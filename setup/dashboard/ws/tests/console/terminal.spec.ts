// SPDX-License-Identifier: GPL-3.0-or-later
import "mocha";
import { expect } from "chai";
import express from "express";
import http from "http";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import os from "os";
import path from "path";
import { once } from "events";
import request from "supertest";
import apacheMD5 from "apache-md5";
import { WebSocket, WebSocketServer } from "ws";
import { Server as SocketIO } from "socket.io";
import { createConsoleAuth } from "../../src/console/auth";
import { createTerminalProxy } from "../../src/console/terminal";
import { app as productionApp } from "../../src/server";

describe("console/terminal", function() {
    this.timeout(5000);
    let directory: string, base: string, cookie: string, credentialFile: string;
    let app: express.Express, server: http.Server, upstream: http.Server, upstreamSockets: WebSocketServer;
    let upstreamRequests: string[], connections: number;
    beforeEach(async () => {
        directory = mkdtempSync(path.join(os.tmpdir(), "quickbox-terminal-"));
        credentialFile = path.join(directory, "htpasswd");
        writeFileSync(credentialFile, `nest:${apacheMD5("test-password")}\n`);
        const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir: path.join(directory, "sessions") });
        upstreamRequests = []; connections = 0;
        upstream = http.createServer((req, res) => {
            upstreamRequests.push(req.url ?? "");
            expect(req.headers.cookie).to.equal(undefined);
            res.setHeader("Content-Type", "text/html"); res.end("terminal-fixture");
        });
        upstreamSockets = new WebSocketServer({ server: upstream });
        upstreamSockets.on("connection", socket => {
            connections++;
            socket.on("message", (data, binary) => { socket.send(data, { binary }); });
        });
        upstream.listen(0, "127.0.0.1"); await once(upstream, "listening");
        const address = upstream.address();
        if (!address || typeof address === "string") { throw new Error("missing upstream port"); }
        const terminal = createTerminalProxy(auth, address.port);
        app = express(); app.use("/auth", auth.router); app.use(terminal.router);
        server = http.createServer(app); terminal.attach(server);
        // Exercise coexistence with both real dashboard Socket.IO upgrade listeners.
        new SocketIO(server, { destroyUpgrade: false });
        new SocketIO(server, { destroyUpgrade: false, path: "/ws/socket.io" });
        server.listen(0, "127.0.0.1"); await once(server, "listening");
        const bound = server.address();
        if (!bound || typeof bound === "string") { throw new Error("missing proxy port"); }
        base = `http://127.0.0.1:${bound.port}`;
        const login = await request(app).post("/auth/login").set("X-QuickBox-Request", "1")
            .send({ username: "nest", password: "test-password", remember: true });
        cookie = login.headers["set-cookie"][0].split(";")[0];
    });
    afterEach(async () => {
        for (const socket of upstreamSockets.clients) { socket.terminate(); }
        await new Promise<void>(resolve => { server.close(() => { resolve(); }); server.closeAllConnections(); });
        upstreamSockets.close();
        await new Promise<void>(resolve => { upstream.close(() => { resolve(); }); upstream.closeAllConnections(); });
        rmSync(directory, { recursive: true, force: true });
    });
    const connect = (origin = base, session = cookie, suffix = "/ws") => new WebSocket(
        base.replace("http:", "ws:") + "/terminal/session" + suffix, "tty", { origin, headers: { Cookie: session } },
    );
    const rejectConnection = async (origin: string, session: string, status: number, suffix = "/ws") => {
        const socket = connect(origin, session, suffix);
        socket.on("error", () => undefined);
        const response = new Promise<number>(resolve => {
            socket.on("unexpected-response", (_req, res) => { res.resume(); socket.terminate(); resolve(res.statusCode ?? 0); });
        });
        expect(await response).to.equal(status);
    };
    it("requires a session and same-origin HTTP requests before contacting ttyd", async () => {
        expect((await request(app).get("/terminal/session/")).status).to.equal(401);
        expect((await request(app).get("/terminal/session/").set("Cookie", cookie).set("Origin", "https://evil.example")).status).to.equal(403);
        expect(upstreamRequests).to.deep.equal([]);
        const response = await request(app).get("/terminal/session/").set("Cookie", cookie);
        expect(response.text).to.equal("terminal-fixture");
        expect(response.headers["cache-control"]).to.equal("no-store");
        expect(response.headers["x-frame-options"]).to.equal("SAMEORIGIN");
        expect((await request(app).get("/terminal/session/token").set("Cookie", cookie)).status).to.equal(200);
        expect(upstreamRequests).to.deep.equal(["/", "/token"]);
    });
    it("rejects anonymous, cross-site and unsupported WebSocket paths", async () => {
        await rejectConnection(base, "", 401);
        await rejectConnection("https://evil.example", cookie, 403);
        await rejectConnection("", cookie, 403);
        await rejectConnection(base, cookie, 404, "/other");
        expect(connections).to.equal(0);
    });
    it("keeps terminal frames binary and revokes an idle connection after logout", async () => {
        const socket = connect(); socket.on("error", () => undefined);
        await once(socket, "open");
        const response = once(socket, "message");
        socket.send(Buffer.from([0, 65, 66]));
        const [data, binary] = await response;
        expect(Buffer.from(data as Buffer).equals(Buffer.from([0, 65, 66]))).to.equal(true);
        expect(binary).to.equal(true);
        await new Promise(resolve => setTimeout(resolve, 1200));
        expect(socket.readyState).to.equal(WebSocket.OPEN);
        const closed = once(socket, "close");
        expect((await request(app).post("/auth/logout").set("X-QuickBox-Request", "1").set("Cookie", cookie)).status).to.equal(200);
        await closed;
        await rejectConnection(base, cookie, 401);
    });
    it("revokes an open terminal on password change", async () => {
        const socket = connect(); socket.on("error", () => undefined); await once(socket, "open");
        const closed = once(socket, "close");
        writeFileSync(credentialFile, `nest:${apacheMD5("changed-password")}\n`);
        await closed;
        expect((await request(app).get("/terminal/session/").set("Cookie", cookie)).status).to.equal(401);
    });
    it("returns 404 for removed old UI and data routes", async () => {
        for (const url of ["/legacy", "/legacy#console", "/node/dashboard_config", "/debug", "/test", "/index.php", "/js/dashboard.js", "/ws/", "/inc/info.package.php"]) {
            expect((await request(productionApp).get(url)).status, url).to.equal(404);
        }
    });
});
