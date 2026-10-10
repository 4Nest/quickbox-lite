// SPDX-License-Identifier: GPL-3.0-or-later

import { existsSync, readFileSync } from "fs";
import path from "path";

import { username } from "./shared/constants";

export function getDashboardBranch() {
    try {
        const source = JSON.parse(readFileSync("/etc/quickbox-update-source.json", "utf8")) as { branch?: unknown };
        if (typeof source.branch === "string" && source.branch) { return source.branch; }
    } catch { /* Use the standard update channel when no custom source is configured. */ }
    if (!existsSync("/install/.developer.lock")) {
        return "master";
    }
    if (existsSync("/install/.debug.lock")) {
        try {
            const branch = readFileSync("/install/.debug.lock", "utf8").split("\n")[0]?.trim();
            if (branch) {
                return branch;
            }
        } catch {
            return "development";
        }
    }
    return "development";
}

export function dashboardConfig() {
    const version = getDashboardVersion();

    return {
        username,
        version,
        branch: getDashboardBranch(),
        showDeveloper: existsSync("/install/.developer.lock"),
    };
}

function getDashboardVersion() {
    const packageJsonPath = path.resolve(__dirname, "..", "package.json");
    try {
        const content = readFileSync(packageJsonPath, "utf8");
        const parsed = JSON.parse(content) as { version?: string };
        if (typeof parsed.version === "string" && parsed.version.trim() !== "") {
            return `v${parsed.version.trim()}`;
        }
    } catch {
        // Ignore parse/read errors and fall back to the last known version.
    }

    return "v0.0.0";
}
