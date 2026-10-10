---
applyTo: "**"
---

# QuickBox Lite fork

The dashboard uses React + TypeScript + shadcn/ui, with an Express/Socket.IO backend. The old PHP/SSR WebUI and `/legacy` endpoints have been removed.

## Modules

- `setup/dashboard/ui/src/`: frontend pages, shared helpers and shadcn components.
- `setup/dashboard/ui/public/`: assets retained by the new frontend.
- `setup/dashboard/console-dist/`: distributed frontend bundle; commit build output.
- `setup/dashboard/ws/src/server.tsx`: backend entry.
- `setup/dashboard/ws/src/console/`: cookie sessions, files, overview and terminal proxy.
- `setup/dashboard/ws/config/`: command allowlist and package/service definitions.
- `setup/dashboard/ws/src/widgets/`: shared menu, package metadata and output log data only.
- `setup/dashboard/lang/`: application description translations.
- `packages/`: shell package installation, update and removal scripts.
- `setup/templates/`: Nginx/systemd and other installation templates.
- `e2e/`: native Playwright browser tests with temporary local auth fixtures.

## Implementation

Use SPDX license headers, TypeScript strict typing, PascalCase React components and camelCase exports. Keep requests and formatting helpers shared across pages. Use shadcn components for forms, dialogs and controls, and check both narrow and wide layouts.

Cookie sessions protect all privileged APIs and terminal connections. Preserve same-origin checks, command allowlists and file descriptor path checks. Never add a direct anonymous ttyd proxy or a Basic Auth bypass around terminal session validation. An open terminal must close after logout, expiry or a credential change.

The update scripts must preserve `db/sessions`. `qbDashboardCleanup` moves obsolete assets outside the webroot while keeping rollback copies; `qbConsoleMigrate` updates Nginx routes. Changes to backend code, assets or routes must update both installation and upgrade paths.

## Verification

```bash
cd setup/dashboard/ui
npm ci && npm run build
cd ../ws
npm ci && npm run lint && npm test && npm run build
python3 tests/console/check-nginx.py
python3 tests/console/check-cleanup.py
cd ../../../e2e
npm ci && npm test
```

Browser tests require Playwright Chromium (`npx playwright install chromium`). Test environments must use temporary credentials, never production secrets. Deploy both `console-dist` and `ws/dist`, check Nginx syntax, and retain a rollback copy before replacing the running dashboard.
