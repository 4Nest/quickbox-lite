// SPDX-License-Identifier: GPL-3.0-or-later
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { mkdirSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "fs";
import path from "path";
import type { IncomingMessage } from "http";
import express, { type Request, type Response, type NextFunction } from "express";
import apacheMD5 from "apache-md5";
import { compareSync } from "bcryptjs";
import { username } from "../shared/constants";

const COOKIE = "quickbox_session";
const DAY = 86_400_000;
interface Session { user: string; expires: number; credential: string }
export interface AuthOptions { user?: string; credentialFile?: string; sessionDir?: string }

function equal(a: string, b: string) {
    const left = Buffer.from(a), right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}
function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function verifyPassword(password: string, hash: string) {
    if (hash.startsWith("$apr1$")) { return equal(apacheMD5(password, hash), hash); }
    if (/^\$2[aby]\$/.test(hash)) { return compareSync(password, hash); }
    if (hash.startsWith("{SHA}")) { return equal(`{SHA}${createHash("sha1").update(password).digest("base64")}`, hash); }
    return false;
}
function loopback(req: IncomingMessage) {
    return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "");
}
export function sameOrigin(req: IncomingMessage) {
    const origin = req.headers.origin;
    if (!origin) { return true; }
    const proto = loopback(req) && req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
    return origin === `${proto}://${req.headers.host ?? ""}`;
}

export function createConsoleAuth(options: AuthOptions = {}) {
    const user = options.user ?? username;
    const credentialFile = options.credentialFile ?? process.env.QUICKBOX_HTPASSWD_FILE ?? `/etc/htpasswd.d/htpasswd.${user}`;
    const sessionDir = options.sessionDir ?? path.join(process.env.QUICKBOX_DASHBOARD_DB_DIR ?? "/srv/dashboard/db", "sessions");
    const failures = new Map<string, { count: number; reset: number }>();
    const recordFailure = (key: string) => {
        const now = Date.now();
        for (const [ip, bucket] of failures) { if (bucket.reset <= now) { failures.delete(ip); } }
        const previous = failures.get(key);
        failures.set(key, { count: (previous?.count ?? 0) + 1, reset: previous?.reset ?? now + 15 * 60_000 });
    };
    const readHash = () => {
        try { return readFileSync(credentialFile, "utf8").split(/\r?\n/).find(line => line.startsWith(`${user}:`))?.slice(user.length + 1) ?? ""; }
        catch { return ""; }
    };
    const tokenFrom = (req: IncomingMessage) => {
        const value = req.headers.cookie?.split(";").map(part => part.trim()).find(part => part.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1) ?? "";
        return /^[a-f0-9]{64}$/.test(value) ? value : "";
    };
    const sessionFile = (token: string) => path.join(sessionDir, `${digest(token)}.json`);
    const revoke = (token: string) => {
        try { unlinkSync(sessionFile(token)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") { throw error; } }
    };
    const identity = (req: IncomingMessage): string | null => {
        const token = tokenFrom(req);
        if (!token) { return null; }
        try {
            const session = JSON.parse(readFileSync(sessionFile(token), "utf8")) as Session;
            const hash = readHash();
            if (session.user === user && session.expires > Date.now() && hash && equal(session.credential, digest(hash))) { return user; }
            unlinkSync(sessionFile(token));
        } catch { /* Missing, revoked, expired or invalid session. */ }
        return null;
    };
    const router = express.Router();
    router.use(express.json({ limit: "4kb" }));
    router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
    router.get("/session", (req, res) => { res.json({ user: identity(req) }); });
    router.get("/validate", (req, res) => {
        const currentUser = identity(req);
        if (!currentUser) { res.sendStatus(401); return; }
        res.set("X-Forwarded-User", currentUser).sendStatus(204);
    });
    const writeGuard = (req: Request, res: Response, next: NextFunction) => {
        if (!sameOrigin(req) || req.get("X-QuickBox-Request") !== "1") { res.status(403).json({ error: "请求来源无效，请刷新页面重试。" }); return; }
        next();
    };
    router.post("/login", writeGuard, (req, res) => {
        const key = req.ip ?? "unknown";
        const failed = failures.get(key);
        if (failed && failed.reset > Date.now() && failed.count >= 8) { res.status(429).json({ error: "尝试过于频繁，请 15 分钟后重试。" }); return; }
        const body = (req.body ?? {}) as { username?: unknown; password?: unknown; remember?: unknown };
        const hash = readHash();
        if (body.username !== user || typeof body.password !== "string" || body.password.length > 1024 || !hash || !verifyPassword(body.password, hash)) {
            recordFailure(key);
            res.status(401).json({ error: "用户名或密码不正确。" }); return;
        }
        const remember = body.remember === true;
        const ttl = remember ? 30 * DAY : 12 * 60 * 60_000;
        const token = randomBytes(32).toString("hex");
        try {
            // Fail closed if the previous token cannot be revoked.
            const oldToken = tokenFrom(req);
            if (oldToken) { revoke(oldToken); }
            mkdirSync(sessionDir, { recursive: true, mode: 0o700 });
            const target = sessionFile(token);
            writeFileSync(`${target}.tmp`, JSON.stringify({ user, expires: Date.now() + ttl, credential: digest(hash) }), { mode: 0o600 });
            renameSync(`${target}.tmp`, target);
        } catch { res.status(503).json({ error: "暂时无法保存登录状态，请检查会话目录权限。" }); return; }
        failures.delete(key);
        res.cookie(COOKIE, token, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/", ...(remember ? { maxAge: ttl } : {}) });
        res.json({ user });
    });
    router.post("/logout", writeGuard, (req, res) => {
        const token = tokenFrom(req);
        try { if (token) { revoke(token); } }
        catch { res.status(503).json({ error: "暂时无法撤销登录状态，请稍后重试或检查会话目录权限。" }); return; }
        res.clearCookie(COOKIE, { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/" });
        res.json({ ok: true, redirect: "/login" });
    });
    const requireUser = (req: Request, res: Response, next: NextFunction) => {
        if (!identity(req)) { res.status(401).json({ error: "登录已过期，请重新登录。" }); return; }
        if (!sameOrigin(req)) { res.status(403).json({ error: "请求来源无效。" }); return; }
        res.set("Cache-Control", "no-store");
        next();
    };
    return { router, identity, requireUser, writeGuard };
}
export type ConsoleAuth = ReturnType<typeof createConsoleAuth>;
