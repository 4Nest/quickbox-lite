// SPDX-License-Identifier: GPL-3.0-or-later
import express from "express";
import path from "path";
import os from "os";
import { existsSync } from "fs";
import { stat } from "fs/promises";
import si from "systeminformation";
import { dashboardConfig } from "../dashboard-config";
import { resolveDashboardMenuState } from "../widgets/menu";
import { getVisiblePackages, isPackageInstalled } from "../widgets/panels";
import { getProcessList, processExistsIn, systemdUnitActive } from "../utils/helpers";
import { createFileRouter, createFileAccess } from "./files";
import { sameOrigin, type ConsoleAuth } from "./auth";
import { username } from "../shared/constants";
import { readOutputLog } from "../widgets/output-log";
import commands from "../../config/commands.json";
import { listActiveInterfaceNames } from "../utils/network-interfaces";
import i18n, { resolveRequestLocale, withLocale } from "../i18n";

async function networkSnapshot() {
    const interfaces = listActiveInterfaceNames(await si.networkInterfaces());
    const results = await Promise.allSettled(interfaces.map(iface => si.networkStats(iface)));
    return results.flatMap(result => result.status === "fulfilled" ? result.value : []);
}

export function createConsoleRouter(dashboardDir: string, auth: ConsoleAuth) {
    const router = express.Router();
    const dist = path.join(dashboardDir, "console-dist");
    const index = path.join(dist, "index.html");
    router.use("/console-assets", express.static(dist, { index: false, maxAge: "1h" }));
    router.use("/console/api/auth", auth.router);
    router.use("/console/api/files", createFileRouter(auth));
    router.get("/console/api/overview", auth.requireUser, async (req, res) => {
        const [memory, load, disks, network, cpu, system, menu] = await Promise.all([
            si.mem(), si.currentLoad(), si.fsSize(), networkSnapshot(), si.cpu(), si.osInfo(), resolveDashboardMenuState(),
        ]);
        const config = dashboardConfig();
        const rootDisk: si.Systeminformation.FsSizeData | undefined = disks.find(disk => disk.mount === "/") ?? disks.at(0);
        res.json({
            config, menu, hostname: os.hostname(), system: `${system.distro} ${system.release}`, arch: os.arch(),
            uptime: si.time().uptime, cpu: { model: cpu.brand, cores: cpu.cores, percent: load.currentLoad },
            memory: { total: memory.total, used: memory.active },
            disk: rootDisk ? { total: rootDisk.size, used: rootDisk.used, percent: rootDisk.use } : null,
            network: network.filter(iface => iface.iface !== "lo").map(iface => ({ iface: iface.iface, rx: iface.rx_sec, tx: iface.tx_sec })),
        });
    });
    router.get("/console/api/services", auth.requireUser, async (req, res) => {
        const processList = await getProcessList();
        const packages = await withLocale(resolveRequestLocale(req), async () => await Promise.all(getVisiblePackages().map(async pkg => ({
            package: pkg.package, name: pkg.name, description: pkg.description ? i18n.t(pkg.description) : "",
            installed: isPackageInstalled(pkg), installable: !pkg.boxonly && commands.installpackage.targets.includes(pkg.package),
            services: await Promise.all(Object.entries(pkg.services ?? {}).map(async ([key, service]) => ({
                key, name: service.name, unit: (commands.systemctl.targets.find(target => target === key || target === `${key}@$username$`) ?? key).replaceAll("$username$", username),
                running: service.systemdUnit ? await systemdUnitActive(service.systemdUnit) : processExistsIn(processList, service.process ?? "", service.username, service.params),
            }))),
        }))));
        res.json({ packages });
    });
    router.get("/console/api/log", auth.requireUser, (_req, res) => { res.json(readOutputLog()); });
    // Serve the same React application at the dashboard, file page and legacy download aliases.
    const shell = (_req: express.Request, res: express.Response) => {
        res.set("Cache-Control", "no-store");
        if (!existsSync(index)) { res.status(503).send("请先构建控制台：cd setup/dashboard/ui && npm ci && npm run build"); return; }
        res.sendFile(index);
    };
    router.get(["/console", "/console/", "/files", "/login", "/services", "/settings", "/terminal"], shell);
    const files = createFileAccess();
    router.get(/^\/[A-Za-z0-9_-]+\.(?:qbittorrent|deluge|transmission|rtorrent)\.downloads(?:\/.*)?$/, async (req, res) => {
        const user = auth.identity(req);
        if (!user) { res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`); return; }
        if (!sameOrigin(req)) { res.sendStatus(403); return; }
        res.set("Cache-Control", "no-store");
        try {
            const alias = req.path.match(/^\/([A-Za-z0-9_-]+)\.(qbittorrent|deluge|transmission|rtorrent)\.downloads(?:\/(.*))?$/);
            if (!alias || alias[1] !== user) { res.sendStatus(404); return; }
            const requested = `/home/${user}/torrents/${alias[2]}/${decodeURIComponent(alias[3] || "")}`;
            const { target } = await files.resolveFile(requested);
            if ((await stat(target)).isDirectory()) { shell(req, res); }
            else { await files.download(req, res, requested); }
        } catch { res.sendStatus(404); }
    });
    return { router, shell };
}
