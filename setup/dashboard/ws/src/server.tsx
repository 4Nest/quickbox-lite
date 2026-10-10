// SPDX-License-Identifier: GPL-3.0-or-later

import "./testing/bootstrap";

import express from "express";
import http from "http";
import path from "path";
import { Server as socketio } from "socket.io";
import { WebSocketServer } from "ws";

import logHandler from "./handlers/log";
import execHandler from "./handlers/exec";
import i18nHandler from "./handlers/i18n";
import { isTestMode } from "./testing";
import { createConsoleAuth, sameOrigin } from "./console/auth";
import { createConsoleRouter } from "./console/router";
import { createTerminalProxy } from "./console/terminal";

const app = express();
app.set("trust proxy", "loopback");

const dashboardDir = path.resolve(__dirname, "..", "..");
const auth = createConsoleAuth();
const consoleApp = createConsoleRouter(dashboardDir, auth);

const server = http.createServer(app);
const terminal = createTerminalProxy(auth);
terminal.attach(server);
const socketOptions = {
    wsEngine: WebSocketServer,
    destroyUpgrade: false,
    allowRequest: (req: http.IncomingMessage, callback: (error: string | null, success: boolean) => void) => {
        callback(null, sameOrigin(req) && Boolean(auth.identity(req)));
    },
};
const io = new socketio(server, socketOptions);
const wsPathIo = new socketio(server, { ...socketOptions, path: "/ws/socket.io" });

for (const socketServer of [io, wsPathIo]) {
    socketServer.use((socket, next) => {
        if (!sameOrigin(socket.request) || !auth.identity(socket.request)) {
            next(new Error("Unauthorized"));
            return;
        }
        // Recheck every message so logout and expiry also revoke open sockets.
        socket.use((_packet, packetNext) => {
            if (!auth.identity(socket.request)) {
                socket.disconnect(true);
                packetNext(new Error("Unauthorized"));
                return;
            }
            packetNext();
        });
        next();
    });
    socketServer.use(logHandler);
    socketServer.use(execHandler);
    socketServer.use(i18nHandler);
}
// Socket.IO must leave terminal upgrades alone, but unknown upgrade paths still fail closed.
server.on("upgrade", (req, socket) => {
    const url = req.url ?? "";
    if (["/socket.io/", "/ws/socket.io/", "/terminal/session/"].some(prefix => url.startsWith(prefix))) { return; }
    socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
});

app.use(consoleApp.router);
app.use(terminal.router);
app.get("/", consoleApp.shell);
app.use((_req, res) => { res.sendStatus(404); });

export { app };

if (process.env.NODE_ENV !== "test" || process.env.MOCK_ENABLED === "1") {
    const host = process.env.WS_HOST || "127.0.0.1";
    const port = parseInt(process.env.WS_PORT || "8575", 10);
    server.listen(port, host, () => {
        console.log(`Quickbox-ws running on http://${host}:${port} ...`);
        if (isTestMode()) {
            console.log(`Mock mode enabled, profile: ${process.env.MOCK_PROFILE || "all-running"}`);
        }
    });
}
