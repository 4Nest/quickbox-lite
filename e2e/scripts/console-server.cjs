// SPDX-License-Identifier: GPL-3.0-or-later
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const directory = mkdtempSync(path.join(os.tmpdir(), 'quickbox-console-e2e-'));
const password = require('../../setup/dashboard/ws/node_modules/apache-md5')('fixture-password');
const credentialFile = path.join(directory, 'htpasswd');
writeFileSync(credentialFile, `testuser:${password}\n`, { mode: 0o600 });
const child = spawn(process.execPath, [path.resolve(__dirname, '../../setup/dashboard/ws/dist/server.js')], {
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', MOCK_ENABLED: '1', MOCK_PROFILE: 'partial-running',
        WS_HOST: '127.0.0.1', WS_PORT: '18581', QUICKBOX_USERNAME: 'testuser',
        QUICKBOX_HTPASSWD_FILE: credentialFile, QUICKBOX_DASHBOARD_DB_DIR: directory },
});
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => child.kill(signal));
}
child.on('exit', code => { rmSync(directory, { recursive: true, force: true }); process.exit(code ?? 0); });
