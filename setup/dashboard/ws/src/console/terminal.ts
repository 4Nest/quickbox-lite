// SPDX-License-Identifier: GPL-3.0-or-later
import express from "express";
import http from "http";
import { WebSocket, WebSocketServer } from "ws";
import { sameOrigin, type ConsoleAuth } from "./auth";

const PREFIX = "/terminal/session";
const MAX_BUFFER = 1024 * 1024;

// The upstream is fixed to loopback. Browser-controlled paths never select a host.
export function createTerminalProxy(auth: ConsoleAuth, port = 4200) {
    const router = express.Router();
    router.use(PREFIX, auth.requireUser, (req, res) => {
        const pathname = req.path;
        if (!["/", "/token", "/favicon.ico"].includes(pathname)) { res.sendStatus(404); return; }
        if (!["GET", "HEAD"].includes(req.method)) { res.sendStatus(405); return; }
        res.set("X-Frame-Options", "SAMEORIGIN");
        res.set("Content-Security-Policy", "frame-ancestors 'self'");
        const upstream = http.request({ hostname: "127.0.0.1", port, path: pathname, method: req.method, timeout: 10_000 }, response => {
            res.status(response.statusCode ?? 502);
            for (const header of ["content-type", "content-length"]) {
                const value = response.headers[header];
                if (value !== undefined) { res.setHeader(header, value); }
            }
            response.on("error", () => res.destroy());
            response.pipe(res);
        });
        upstream.on("timeout", () => upstream.destroy());
        upstream.on("error", () => {
            if (!res.headersSent) { res.status(503).send("Web 终端暂时不可用，请检查 ttyd 服务。"); }
            else { res.destroy(); }
        });
        res.on("close", () => upstream.destroy());
        upstream.end();
    });

    const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_BUFFER });
    function attach(server: http.Server) {
        server.on("upgrade", (req, socket, head) => {
            if (!req.url?.startsWith(PREFIX + "/")) { return; }
            const reject = (status: number) => { socket.end(`HTTP/1.1 ${status} Rejected\r\nConnection: close\r\n\r\n`); };
            if (req.url !== PREFIX + "/ws") { reject(404); return; }
            if (!req.headers.origin || !sameOrigin(req)) { reject(403); return; }
            if (!auth.identity(req)) { reject(401); return; }
            if (sockets.clients.size >= 32) { reject(503); return; }
            sockets.handleUpgrade(req, socket, head, client => {
                const upstream = new WebSocket(`ws://127.0.0.1:${port}/ws`, "tty", { maxPayload: MAX_BUFFER, handshakeTimeout: 10_000 });
                const pending: { data: Buffer; binary: boolean }[] = [];
                let pendingSize = 0;
                const close = () => { client.terminate(); upstream.terminate(); };
                // Also revoke idle terminals after logout, expiry or password change.
                const timer = setInterval(() => { if (!auth.identity(req)) { close(); } }, 1000);
                timer.unref();
                client.on("close", () => { clearInterval(timer); upstream.terminate(); });
                upstream.on("close", () => { clearInterval(timer); client.terminate(); });
                client.on("error", close);
                upstream.on("error", close);
                client.on("message", (data, binary) => {
                    if (!auth.identity(req)) { close(); return; }
                    const buffer = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
                    if (upstream.readyState === WebSocket.CONNECTING) {
                        pendingSize += buffer.length;
                        if (pendingSize > MAX_BUFFER) { close(); return; }
                        pending.push({ data: buffer, binary });
                    } else if (upstream.readyState === WebSocket.OPEN && upstream.bufferedAmount <= MAX_BUFFER) {
                        upstream.send(buffer, { binary });
                    } else { close(); }
                });
                upstream.on("open", () => {
                    if (!auth.identity(req) || client.readyState !== WebSocket.OPEN) { close(); return; }
                    for (const item of pending) { upstream.send(item.data, { binary: item.binary }); }
                    pending.length = 0;
                });
                upstream.on("message", (data, binary) => {
                    if (!auth.identity(req) || client.readyState !== WebSocket.OPEN || client.bufferedAmount > MAX_BUFFER) { close(); return; }
                    client.send(data, { binary });
                });
            });
        });
        server.on("close", () => { for (const client of sockets.clients) { client.terminate(); } sockets.close(); });
    }
    return { router, attach };
}
