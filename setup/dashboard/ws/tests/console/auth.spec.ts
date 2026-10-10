// SPDX-License-Identifier: GPL-3.0-or-later
import "mocha";
import { expect } from "chai";
import express from "express";
import request from "supertest";
import fs, { mkdtempSync, writeFileSync, rmSync, readdirSync, readFileSync, mkdirSync, symlinkSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import apacheMD5 from "apache-md5";
import sinon from "sinon";
import { createHash } from "crypto";
import { createConsoleRouter } from "../../src/console/router";
import { buildCommand } from "../../src/handlers/utils/command";
import commands from "../../config/commands.json";
import { createConsoleAuth } from "../../src/console/auth";
import { createFileRouter } from "../../src/console/files";
import { app as productionApp } from "../../src/server";

const headers = { "X-QuickBox-Request": "1" };
describe("console authentication and file access", () => {
    let directory: string, credentialFile: string, sessionDir: string;
    const build = () => {
        const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir });
        const app = express();
        app.set("trust proxy", "loopback");
        app.use("/auth", auth.router);
        app.use("/files", createFileRouter(auth, path.join(directory, "files")));
        return app;
    };
    beforeEach(() => {
        directory = mkdtempSync(path.join(tmpdir(), "quickbox-console-test-"));
        credentialFile = path.join(directory, "htpasswd"); sessionDir = path.join(directory, "sessions");
        writeFileSync(credentialFile, `nest:${apacheMD5("correct-password")}\n`);
        mkdirSync(path.join(directory, "files"));
        mkdirSync(path.join(directory, "files", "nested"));
        writeFileSync(path.join(directory, "files", "hello.txt"), "download-content");
        writeFileSync(path.join(directory, "outside.txt"), "private-content");
        symlinkSync(path.join(directory, "outside.txt"), path.join(directory, "files", "escape.txt"));
    });
    afterEach(() => { sinon.restore(); rmSync(directory, { recursive: true, force: true }); });
    const login = async (app: ReturnType<typeof build>, remember = true) => {
        const res = await request(app).post("/auth/login").set(headers).send({ username: "nest", password: "correct-password", remember });
        expect(res.status).to.equal(200);
        const cookies = res.headers["set-cookie"] as unknown as string[];
        return cookies[0];
    };
    it("persists remembered login across auth service restarts without storing a password", async () => {
        const cookie = await login(build());
        expect(cookie).to.include("HttpOnly").and.include("SameSite=Lax").and.include("Max-Age=2592000");
        const res = await request(build()).get("/auth/session").set("Cookie", cookie);
        expect((res.body as {user: string}).user).to.equal("nest");
        const stored = readFileSync(path.join(sessionDir, readdirSync(sessionDir)[0]), "utf8");
        expect(stored).to.not.include("correct-password").and.not.include("$apr1$");
    });
    it("keeps unchecked login in a browser session cookie", async () => {
        const cookie = await login(build(), false);
        expect(cookie).to.not.include("Max-Age").and.not.include("Expires");
    });
    it("sets secure cookies behind the trusted HTTPS proxy", async () => {
        const res = await request(build()).post("/auth/login").set(headers).set("X-Forwarded-Proto", "https").send({username:"nest", password:"correct-password", remember:true});
        expect((res.headers["set-cookie"] as unknown as string[]).join(";")).to.include("Secure");
    });
    it("revokes the session immediately on logout", async () => {
        const app = build(), cookie = await login(app);
        expect((await request(app).post("/auth/logout").set(headers).set("Cookie", cookie).send({})).status).to.equal(200);
        expect((await request(app).get("/auth/validate").set("Cookie", cookie)).status).to.equal(401);
        expect((await request(app).get("/files").set("Cookie", cookie)).status).to.equal(401);
    });
    it("reports revocation failures without clearing the cookie or issuing a replacement token", async () => {
        const app = build(), cookie = await login(app);
        const originalUnlink = fs.unlinkSync;
        const stub = sinon.stub(fs, "unlinkSync").callsFake(file => {
            if (String(file).startsWith(sessionDir)) { throw Object.assign(new Error("fixture EACCES"), { code: "EACCES" }); }
            originalUnlink(file);
        });
        const logout = await request(app).post("/auth/logout").set(headers).set("Cookie", cookie).send({});
        expect(logout.status).to.equal(503);
        expect(logout.headers["set-cookie"]).to.equal(undefined);
        const rotation = await request(app).post("/auth/login").set(headers).set("Cookie", cookie).send({ username: "nest", password: "correct-password" });
        expect(rotation.status).to.equal(503);
        expect(rotation.headers["set-cookie"]).to.equal(undefined);
        expect(readdirSync(sessionDir)).to.have.length(1);
        stub.restore();
        expect((await request(app).post("/auth/logout").set(headers).set("Cookie", cookie).send({})).status).to.equal(200);
        expect((await request(app).get("/auth/validate").set("Cookie", cookie)).status).to.equal(401);
    });
    it("treats already absent sessions as revoked", async () => {
        const app = build(), cookie = await login(app);
        const token = /quickbox_session=([a-f0-9]+)/.exec(cookie)?.[1] ?? "";
        fs.unlinkSync(path.join(sessionDir, createHash("sha256").update(token).digest("hex") + ".json"));
        expect((await request(app).post("/auth/logout").set(headers).set("Cookie", cookie).send({})).status).to.equal(200);
    });
    it("invalidates sessions after a password change and after expiration", async () => {
        const app = build(), cookie = await login(app);
        writeFileSync(credentialFile, `nest:${apacheMD5("new-password")}\n`);
        expect((await request(app).get("/auth/validate").set("Cookie", cookie)).status).to.equal(401);
        writeFileSync(credentialFile, `nest:${apacheMD5("correct-password")}\n`);
        const otherCookie = await login(app);
        const file = path.join(sessionDir, readdirSync(sessionDir)[0]);
        const session = JSON.parse(readFileSync(file, "utf8")) as {expires: number}; session.expires = Date.now() - 1;
        writeFileSync(file, JSON.stringify(session));
        expect((await request(app).get("/auth/validate").set("Cookie", otherCookie)).status).to.equal(401);
    });
    it("rejects invalid credentials, cross-site writes and forged session tokens", async () => {
        const app = build();
        expect((await request(app).post("/auth/login").set(headers).send({username:"nest",password:"incorrect"})).status).to.equal(401);
        expect((await request(app).post("/auth/login").set(headers).set("Origin", "https://attacker.example").send({username:"nest",password:"correct-password"})).status).to.equal(403);
        expect((await request(app).post("/auth/login").send({username:"nest",password:"correct-password"})).status).to.equal(403);
        expect((await request(app).get("/auth/validate").set("Cookie", "quickbox_session=../../htpasswd")).status).to.equal(401);
        expect((await request(app).get("/auth/validate").set("X-Forwarded-User", "nest")).status).to.equal(401);
    });
    it("rate limits repeated invalid passwords", async () => {
        const app = build();
        for (let i = 0; i < 8; i++) { await request(app).post("/auth/login").set(headers).send({username:"nest",password:"wrong"}); }
        expect((await request(app).post("/auth/login").set(headers).send({username:"nest",password:"correct-password"})).status).to.equal(429);
    });
    it("requires authentication and blocks symlinks and paths outside the configured file root", async () => {
        const app = build();
        expect((await request(app).get("/files")).status).to.equal(401);
        const cookie = await login(app);
        const listing = await request(app).get("/files?path=/").set("Cookie", cookie);
        expect(listing.status).to.equal(200);
        expect((listing.body as {entries: {name: string}[]}).entries.map((entry: {name: string}) => entry.name)).to.deep.equal(["nested", "hello.txt"]);
        expect((await request(app).get("/files/download?path=/escape.txt").set("Cookie", cookie)).status).to.equal(403);
        expect((await request(app).get("/files?path=/../").set("Cookie", cookie)).status).to.equal(403);
        const download = await request(app).get("/files/download?path=/hello.txt").set("Cookie", cookie);
        if (process.platform !== "linux") { expect(download.status).to.equal(503); return; }
        expect(download.status).to.equal(200);
        expect(download.text).to.equal("download-content");
        expect(download.headers["content-disposition"]).to.include("attachment");
    });
    it("returns only allowlisted service command keys and correct units", async () => {
        const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir });
        const app = express();
        app.use("/auth", auth.router);
        app.use(createConsoleRouter(path.resolve(__dirname, "../../.."), auth).router);
        const cookie = await login(app);
        const response = await request(app).get("/console/api/services").set("Cookie", cookie);
        expect(response.status).to.equal(200);
        const { packages } = response.body as { packages: { services: { key: string; unit: string }[] }[] };
        for (const service of packages.flatMap(pkg => pkg.services)) {
            for (const operation of ["start", "stop", "restart"]) {
                expect(() => buildCommand(`systemctl:${operation}:${service.key}`, { systemctl: commands.systemctl }, "nest"), service.key).not.to.throw();
            }
            if (["jellyfin", "netdata", "openvpn"].includes(service.key)) { expect(service.unit).to.equal(service.key); }
        }
        expect(() => buildCommand("systemctl:restart:arbitrary;id", { systemctl: commands.systemctl }, "nest")).to.throw();
    });
    it("streams the opened file and supports byte ranges and empty files", async () => {
        const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir });
        const app = express();
        app.use("/auth", auth.router);
        app.use("/files", createFileRouter(auth, "/"));
        const cookie = await login(app), target = path.join(directory, "files", "hello.txt");
        const range = await request(app).get("/files/download").query({ path: target }).set("Cookie", cookie).set("Range", "bytes=0-7");
        expect(range.status).to.equal(206);
        expect(range.text).to.equal("download");
        expect(range.headers["content-range"]).to.equal("bytes 0-7/16");
        expect((await request(app).get("/files/download").query({ path: target }).set("Cookie", cookie).set("Range", "bytes=200-")).status).to.equal(416);
        writeFileSync(target, "");
        expect((await request(app).get("/files/download").query({ path: target }).set("Cookie", cookie)).status).to.equal(200);
    });
    const linuxIt = process.platform === "linux" ? it : it.skip;
    linuxIt("requires same-origin authentication and only deletes files, links and empty directories", async () => {
        const app = build(), cookie = await login(app);
        const remove = (target: string) => request(app).delete("/files").set(headers).set("Cookie", cookie).send({ path: target });
        expect((await request(app).delete("/files").set(headers).send({ path: "/hello.txt" })).status).to.equal(401);
        expect((await request(app).delete("/files").set("Cookie", cookie).send({ path: "/hello.txt" })).status).to.equal(403);
        expect((await remove("/hello.txt").set("Origin", "https://attacker.example")).status).to.equal(403);
        expect((await remove("/")).status).to.equal(403);
        expect((await remove("/../outside.txt")).status).to.equal(403);
        writeFileSync(path.join(directory, "files", "nested", "keep.txt"), "keep");
        expect((await remove("/nested")).status).to.equal(409);
        expect((await remove("/escape.txt")).status).to.equal(200);
        expect(readFileSync(path.join(directory, "outside.txt"), "utf8")).to.equal("private-content");
        expect((await remove("/nested/keep.txt")).status).to.equal(200);
        expect((await remove("/nested")).status).to.equal(200);
        expect((await remove("/hello.txt")).status).to.equal(200);
        expect((await remove("/hello.txt")).status).to.equal(404);
    });
    linuxIt("keeps system paths read-only when browsing the whole machine", async () => {
        const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir });
        const app = express(); app.use("/auth", auth.router); app.use("/files", createFileRouter(auth, "/"));
        const cookie = await login(app);
        expect((await request(app).delete("/files").set(headers).set("Cookie", cookie).send({ path: path.join(directory, "files", "hello.txt") })).status).to.equal(403);
        expect(fs.existsSync(path.join(directory, "files", "hello.txt"))).to.equal(true);
    });
    linuxIt("does not delete outside the configured root after a parent directory is swapped", async () => {
        mkdirSync(path.join(directory, "files", "nested", "inner"));
        writeFileSync(path.join(directory, "files", "nested", "inner", "item.txt"), "allowed");
        mkdirSync(path.join(directory, "outside-parent", "inner"), { recursive: true });
        writeFileSync(path.join(directory, "outside-parent", "inner", "item.txt"), "private");
        const app = build(), cookie = await login(app), originalOpen = fs.promises.open;
        sinon.stub(fs.promises, "open").callsFake(async (file, flags, mode) => {
            if (String(file) === path.join(directory, "files", "nested", "inner")) {
                fs.renameSync(path.join(directory, "files", "nested"), path.join(directory, "saved-nested"));
                symlinkSync(path.join(directory, "outside-parent"), path.join(directory, "files", "nested"));
            }
            return originalOpen(file, flags, mode);
        });
        expect((await request(app).delete("/files").set(headers).set("Cookie", cookie).send({ path: "/nested/inner/item.txt" })).status).to.equal(403);
        expect(readFileSync(path.join(directory, "outside-parent", "inner", "item.txt"), "utf8")).to.equal("private");
    });
    linuxIt("rejects an out-of-root parent directory swapped after path resolution", async () => {
        writeFileSync(path.join(directory, "files", "nested", "item.txt"), "allowed-content");
        mkdirSync(path.join(directory, "outside-parent"));
        writeFileSync(path.join(directory, "outside-parent", "item.txt"), "private-content");
        const app = build(), cookie = await login(app), originalOpen = fs.promises.open;
        sinon.stub(fs.promises, "open").callsFake(async (file, flags, mode) => {
            if (String(file) === path.join(directory, "files", "nested", "item.txt")) {
                fs.renameSync(path.join(directory, "files", "nested"), path.join(directory, "saved-nested"));
                symlinkSync(path.join(directory, "outside-parent"), path.join(directory, "files", "nested"));
            }
            return originalOpen(file, flags, mode);
        });
        const response = await request(app).get("/files/download?path=/nested/item.txt").set("Cookie", cookie);
        expect(response.status).to.equal(403);
        expect(response.text).not.to.include("private-content");
    });
    linuxIt("keeps streaming the validated descriptor after the pathname is replaced", async () => {
        const app = build(), cookie = await login(app), originalOpen = fs.promises.open;
        sinon.stub(fs.promises, "open").callsFake(async (file, flags, mode) => {
            const handle = await originalOpen(file, flags, mode);
            if (String(file) === path.join(directory, "files", "hello.txt")) {
                fs.renameSync(String(file), path.join(directory, "files", "saved.txt"));
                symlinkSync(path.join(directory, "outside.txt"), String(file));
            }
            return handle;
        });
        const response = await request(app).get("/files/download?path=/hello.txt").set("Cookie", cookie);
        expect(response.status).to.equal(200);
        expect(response.text).to.equal("download-content");
    });
    linuxIt("preserves authenticated legacy directory and file links", async () => {
        const previousRoot = process.env.QUICKBOX_FILE_ROOT;
        process.env.QUICKBOX_FILE_ROOT = directory;
        try {
            const torrents = path.join(directory, "home/nest/torrents/qbittorrent");
            mkdirSync(torrents, { recursive: true });
            writeFileSync(path.join(torrents, "下载说明.txt"), "legacy-download");
            const dist = path.join(directory, "console-dist"); mkdirSync(dist);
            writeFileSync(path.join(dist, "index.html"), "<html>console-shell</html>");
            const auth = createConsoleAuth({ user: "nest", credentialFile, sessionDir });
            const app = express(); app.use("/auth", auth.router);
            app.use(createConsoleRouter(directory, auth).router);
            const cookie = await login(app), alias = "/nest.qbittorrent.downloads/";
            expect((await request(app).get(alias)).status).to.equal(302);
            expect((await request(app).get(alias).set("Cookie", cookie)).text).to.include("console-shell");
            const download = await request(app).get(alias + encodeURIComponent("下载说明.txt")).set("Cookie", cookie);
            expect(download.status).to.equal(200);
            expect(download.text).to.equal("legacy-download");
            expect((await request(app).get("/other.qbittorrent.downloads/").set("Cookie", cookie)).status).to.equal(404);
        } finally {
            if (previousRoot === undefined) { delete process.env.QUICKBOX_FILE_ROOT; }
            else { process.env.QUICKBOX_FILE_ROOT = previousRoot; }
        }
    });
    it("gates the real server data, file endpoints", async () => {
        for (const url of ["/console/api/overview", "/console/api/services", "/console/api/files"]) {
            const res = await request(productionApp).get(url).set("Accept", "application/json");
            expect(res.status, url).to.equal(401);
        }
        expect((await request(productionApp).get("/console/api/auth/session")).status).to.equal(200);
    });
});
