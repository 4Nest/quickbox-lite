"""Verify old UI cleanup preserves sessions, live builds and rollback files."""
from pathlib import Path
import os
import subprocess
import tempfile

HELPER = Path(__file__).resolve().parents[5] / 'packages/system/auxiliary/qbDashboardCleanup'
with tempfile.TemporaryDirectory(prefix='quickbox-cleanup-') as directory:
    root = Path(directory)
    dashboard, backup = root / 'dashboard', root / 'backup'
    paths = ('index.php', 'inc/config.php', 'js/dashboard.js', 'skins/quick.css',
             'package.json', 'console-dist.previous-test/index.html', 'lang/flag_lang_en.png',
             'db/.smoked.lock', 'db/master.txt', 'db/output.log', 'db/sessions/test.json',
             'lang/lang_en.json', 'console-dist/index.html', 'ws/dist/server.js')
    for name in paths:
        target = dashboard / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(name)
    env = dict(os.environ, QUICKBOX_DASHBOARD_DIR=str(dashboard), QUICKBOX_LEGACY_BACKUP_DIR=str(backup))
    subprocess.run(['bash', str(HELPER)], env=env, check=True, capture_output=True)
    for name in paths[:8]:
        assert not (dashboard / name).exists(), name
        saved = list(backup.glob('*/' + name))
        assert len(saved) == 1 and saved[0].read_text() == name
    for name in paths[8:]:
        assert (dashboard / name).read_text() == name
    subprocess.run(['bash', str(HELPER)], env=env, check=True, capture_output=True)
    assert len(list(backup.iterdir())) == 1, 'repeat cleanup created another backup'
print('旧 UI 清理、备份和会话保留检查通过')
