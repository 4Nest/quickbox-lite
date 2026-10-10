"""Validate repeatable console migration for the built-in password session.
Run from any directory: python3 setup/dashboard/ws/tests/console/check-nginx.py
Requires nginx on PATH. All configurations and backups stay under /tmp.
"""
from pathlib import Path
import os
import shutil
import subprocess
import tempfile

REPO = Path(__file__).resolve().parents[5]
HELPER = REPO / 'packages/system/auxiliary/qbConsoleMigrate'
AUTH_HELPER = REPO / 'packages/system/auxiliary/qbNginxAuth'
TEMPLATE = REPO / 'setup/templates/nginx/dashboard.conf.template'
USER = 'testuser'


def generate(root, backend_port=8575):
    apps, locks = root / 'apps', root / 'locks'
    apps.mkdir(exist_ok=True); locks.mkdir(exist_ok=True)
    (root / 'admin').write_text(USER + ':placeholder\n')
    for file in locks.glob('*'): file.unlink()
    (apps / 'dashboard.conf').write_text(TEMPLATE.read_text())
    (apps / 'downloads.conf').write_text('''location /testuser.qbittorrent.downloads {
  alias /home/testuser/torrents/qbittorrent;
  include /etc/nginx/snippets/fancyindex.conf;
  auth_basic "Password Required";
  auth_basic_user_file /etc/htpasswd.d/htpasswd.testuser;
  location ~* \.php$ {
  }
}
''')
    env = dict(os.environ, QUICKBOX_ADMIN_INFO=str(root / 'admin'), QUICKBOX_NGINX_DIR=str(apps),
               QUICKBOX_INSTALL_DIR=str(locks), QUICKBOX_AUTH_HELPER=str(AUTH_HELPER))
    for count in range(2):
        subprocess.run(['bash', str(HELPER)], env=env, check=True)
        current = (apps / 'dashboard.conf').read_text()
        if count:
            assert current == previous, 'repeated migration changed config'
        previous = current
    assert current.count('location = /console/api/auth/session {') == 1
    assert current.count('location = /login {') == 1
    assert 'fancyindex' not in (apps / 'downloads.conf').read_text()
    (root / 'snippets').mkdir(exist_ok=True)
    (root / 'snippets/proxy.conf').write_text('''proxy_set_header Host $http_host;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_http_version 1.1;
''')
    config = '\n'.join(file.read_text() for file in apps.glob('*.conf'))
    config = config.replace('127.0.0.1:8575', '127.0.0.1:' + str(backend_port))
    config = config.replace('/srv/dashboard/console-dist/', str(REPO / 'setup/dashboard/console-dist') + '/')
    config = config.replace('root /srv/dashboard;', 'root ' + str(REPO / 'setup/dashboard') + ';')
    text = f'''pid {root}/nginx.pid;
error_log {root}/error.log;
events {{}}
http {{
  access_log off;
  include /opt/homebrew/etc/nginx/mime.types;
  server {{ listen 127.0.0.1:18576;
{config}
  }}
}}
'''
    # Debian and Linux installations use their own mime.types path.
    if not Path('/opt/homebrew/etc/nginx/mime.types').exists():
        text = text.replace('/opt/homebrew/etc/nginx/mime.types', '/etc/nginx/mime.types')
    (root / 'nginx.conf').write_text(text)
    subprocess.run(['nginx', '-t', '-p', str(root) + '/', '-c', str(root / 'nginx.conf')], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


if __name__ == '__main__':
    if not shutil.which('nginx'):
        raise SystemExit('nginx is required for this integration check')
    with tempfile.TemporaryDirectory(prefix='quickbox-nginx-check-') as directory:
        generate(Path(directory))
        print('native: migration, repeatability and nginx -t passed')
