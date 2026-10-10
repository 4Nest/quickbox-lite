// SPDX-License-Identifier: GPL-3.0-or-later
import { test, expect } from "@playwright/test";

test("login, independent terminal navigation and responsive console", async ({ page, context, request }) => {
    await page.goto("/login");
    await page.getByLabel("用户名", { exact: true }).fill("testuser");
    await page.getByLabel("密码", { exact: true }).fill("fixture-password");
    await expect(page.getByText("记住密码", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "登录控制台", exact: true }).click();
    await expect(page.getByRole("link", { name: "Web 终端", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Web 终端", exact: true }).click();
    await expect(page).toHaveURL(/\/terminal$/);
    await expect(page.getByRole("heading", { name: "Web 终端", exact: true, level: 1 })).toBeVisible();
    await expect(page.locator('a[href*="legacy"]')).toHaveCount(0);
    for (const width of [390, 1280, 1920, 2560]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.reload();
    await expect(page.getByRole("heading", { name: "Web 终端", exact: true, level: 1 })).toBeVisible();
    const cookies = await context.cookies();
    const session = cookies.find(cookie => cookie.name === "quickbox_session");
    expect(session?.httpOnly).toBe(true);
    expect(session?.expires ?? 0).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
    for (const route of ["/legacy", "/node/dashboard_config", "/debug", "/index.php", "/js/dashboard.js"]) {
        expect((await request.get(route)).status()).toBe(404);
    }
});
