// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { constants } from "fs";
import { open, realpath, lstat, unlink, rmdir } from "fs/promises";

const inside = (root: string, target: string) => {
    const relative = path.relative(root, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// Destructive operations default to the administrator's torrent data, not system files.
export function createFileDeletion(root: string, user: string) {
    const configured = process.env.QUICKBOX_DELETE_ROOTS?.split(path.delimiter).filter(Boolean) ??
        [root === "/" ? `/home/${user}/torrents` : root];
    const allowedRoots = async () => (await Promise.all(configured.map(async entry => {
        try { return await realpath(entry); } catch { return null; }
    }))).filter((entry): entry is string => entry !== null);
    let rootsPromise: ReturnType<typeof allowedRoots> | undefined;
    const resolveParent = async (requested: unknown) => {
        if (typeof requested !== "string" || requested.includes("\0")) { throw new Error("INVALID_PATH"); }
        const realRoot = await realpath(root);
        const target = path.resolve(realRoot, `.${path.sep}${requested}`);
        if (target === realRoot || !inside(realRoot, target)) { throw new Error("FORBIDDEN_PATH"); }
        const parent = await realpath(path.dirname(target));
        if (!inside(realRoot, parent)) { throw new Error("FORBIDDEN_PATH"); }
        const roots = await (rootsPromise ??= allowedRoots());
        const permitted = (directory: string) => roots.some(allowed => inside(allowed, directory));
        // Requiring the parent to be inside also prevents removing an allowed root itself.
        if (!permitted(parent)) { throw new Error("FORBIDDEN_PATH"); }
        return { parent, name: path.basename(target), realRoot, permitted };
    };
    const allowed = async (requested: string) => {
        if (process.platform !== "linux") { return false; }
        try { await resolveParent(requested); return true; } catch { return false; }
    };
    const remove = async (requested: unknown) => {
        if (process.platform !== "linux") { throw new Error("LINUX_REQUIRED"); }
        const { parent, name, realRoot, permitted } = await resolveParent(requested);
        const handle = await open(parent, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
        try {
            const descriptor = `/proc/self/fd/${handle.fd}`;
            const actual = await realpath(descriptor);
            if (!inside(realRoot, actual) || !permitted(actual)) { throw new Error("FORBIDDEN_PATH"); }
            const target = path.join(descriptor, name);
            // Never follow the final symlink, and never recursively traverse mutable directories.
            const info = await lstat(target);
            if (info.isDirectory()) { await rmdir(target); }
            else if (info.isFile() || info.isSymbolicLink()) { await unlink(target); }
            else { throw new Error("UNSUPPORTED_FILE"); }
        } finally { await handle.close(); }
    };
    return { allowed, remove };
}
