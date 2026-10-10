// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { realpath, readdir, stat, open } from "fs/promises";
import { constants } from "fs";
import { pipeline } from "stream/promises";
import express from "express";
import type { ConsoleAuth } from "./auth";

export function createFileAccess(root = process.env.QUICKBOX_FILE_ROOT ?? "/") {
    const withinRoot = (realRoot: string, target: string) => {
        const relative = path.relative(realRoot, target);
        if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) { throw new Error("FORBIDDEN_PATH"); }
        return relative;
    };
    const resolveFile = async (requested: unknown) => {
        if (typeof requested !== "string" || requested.includes("\0")) { throw new Error("INVALID_PATH"); }
        const realRoot = await realpath(root);
        const target = await realpath(path.resolve(realRoot, `.${path.sep}${requested}`));
        const relative = withinRoot(realRoot, target);
        return { target, realRoot, displayPath: `/${relative.split(path.sep).join("/")}` };
    };
    const download = async (req: express.Request, res: express.Response, requested: unknown) => {
        try {
            const { target, realRoot } = await resolveFile(requested);
            // O_NONBLOCK avoids hanging on a FIFO swapped in by a local writer.
            const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
            try {
                if (process.platform === "linux") {
                    // Check the file actually opened, including races in parent directories.
                    withinRoot(realRoot, await realpath(`/proc/self/fd/${handle.fd}`));
                } else if (realRoot !== path.parse(realRoot).root) {
                    // Restricted roots need Linux's descriptor path validation; never fall back to a racy pathname check.
                    res.status(503).json({ error: "受限目录下载需要 Linux 文件句柄校验。" }); return;
                }
                const info = await handle.stat();
                if (!info.isFile()) { res.status(400).json({ error: "只能下载普通文件。" }); return; }
                res.attachment(path.basename(target));
                res.set("Accept-Ranges", "bytes");
                let start = 0, end = info.size - 1;
                const ranges = req.range(info.size);
                if (ranges === -1) { res.set("Content-Range", `bytes */${info.size}`).sendStatus(416); return; }
                if (ranges && ranges !== -2 && ranges.type === "bytes" && ranges.length === 1) {
                    ({ start, end } = ranges[0]);
                    res.status(206).set("Content-Range", `bytes ${start}-${end}/${info.size}`);
                }
                res.set("Content-Length", String(Math.max(0, end - start + 1)));
                if (req.method === "HEAD" || info.size === 0) { res.end(); return; }
                // Stream the validated descriptor; do not reopen by pathname.
                await pipeline(handle.createReadStream({ start, end, autoClose: false }), res);
            } finally { await handle.close(); }
        } catch {
            if (!res.headersSent) { res.status(403).json({ error: "文件不可访问。" }); }
            else { res.destroy(); }
        }
    };
    return { resolveFile, download };
}

export function createFileRouter(auth: ConsoleAuth, root = process.env.QUICKBOX_FILE_ROOT ?? "/") {
    const router = express.Router();
    router.use(auth.requireUser);
    const { resolveFile, download } = createFileAccess(root);
    router.get("/", async (req, res) => {
        try {
            const { target, displayPath } = await resolveFile(req.query.path ?? "/");
            const info = await stat(target);
            if (!info.isDirectory()) { res.status(400).json({ error: "请选择一个目录。" }); return; }
            const entries = await readdir(target, { withFileTypes: true });
            // Bound metadata work on very large torrent directories.
            const items = [];
            for (let start = 0; start < entries.length; start += 64) {
                const batch = await Promise.all(entries.slice(start, start + 64).map(async entry => {
                    try {
                        const resolved = await resolveFile(path.posix.join(displayPath, entry.name));
                        const metadata = await stat(resolved.target);
                        if (!metadata.isDirectory() && !metadata.isFile()) { return null; }
                        return { name: entry.name, path: path.posix.join(displayPath, entry.name), directory: metadata.isDirectory(), symlink: entry.isSymbolicLink(), size: metadata.size, modified: metadata.mtime.toISOString() };
                    } catch { return null; }
                }));
                items.push(...batch.filter(item => item !== null));
            }
            items.sort((a, b) => Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, "zh-CN", { numeric: true }));
            res.json({ path: displayPath, root, entries: items });
        } catch (error) {
            const code = error instanceof Error && "code" in error ? error.code : "";
            res.status(code === "ENOENT" ? 404 : 403).json({ error: code === "ENOENT" ? "目录不存在，请检查路径。" : "无法访问这个目录，请检查路径和权限。" });
        }
    });
    router.get("/download", (req, res) => download(req, res, req.query.path));
    return router;
}
