#!/usr/bin/env bash
# Одноразовый установщик на чистый Ubuntu 24.04 (запускать из /opt/champions под root).
# Идемпотентный: можно гонять повторно. Требует заранее созданный /opt/champions/.env
set -euo pipefail
APP=/opt/champions
cd "$APP"

echo ">>> [1/7] swap 2G"
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ">>> [2/7] Node 20"
if ! command -v node >/dev/null 2>&1; then
  apt-get update
  apt-get install -y git curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/node20.sh
  bash /tmp/node20.sh
  apt-get install -y nodejs
fi
node -v

echo ">>> [3/7] Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy.key
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.key
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo ">>> [4/7] проверка .env"
if [ ! -f "$APP/.env" ]; then
  echo "!!! НЕТ файла $APP/.env — создай его (см. README) и запусти скрипт снова."
  exit 1
fi

echo ">>> [5/7] зависимости + сборка (может занять пару минут)"
npm ci
npm run build

echo ">>> [6/7] systemd-сервис"
cp deploy/champions.service /etc/systemd/system/champions.service
systemctl daemon-reload
systemctl enable --now champions
systemctl restart champions

echo ">>> [7/7] Caddy (HTTPS) + крон синка"
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl restart caddy
cp deploy/sync.sh "$APP/sync.sh"
chmod +x "$APP/sync.sh"
echo '* * * * * root /opt/champions/sync.sh' > /etc/cron.d/champions-sync
chmod 644 /etc/cron.d/champions-sync

echo
echo "==================================================="
echo " ГОТОВО. Приложение: https://161.104.32.35"
echo " (браузер ругнётся на самоподписанный серт — это норм)"
echo "==================================================="
sleep 3
systemctl --no-pager status champions | head -6 || true
