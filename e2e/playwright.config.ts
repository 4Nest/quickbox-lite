import { defineConfig } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:18581";

export default defineConfig({
    testDir: "./tests",
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [["html", { open: "never" }], ["list"]],
    timeout: 30_000,
    use: {
        baseURL,
        trace: "on-first-retry",
        screenshot: "on",

    },
    projects: [
        {
            name: "chromium",
            use: {
                browserName: "chromium",
                viewport: { width: 1280, height: 800 },
            },
        },
    ],
    webServer: {
        command: "node scripts/console-server.cjs",
        url: baseURL + "/console/api/auth/session",
        reuseExistingServer: false,
        timeout: 30_000,
    },
});
