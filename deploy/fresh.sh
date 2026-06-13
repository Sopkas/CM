#!/usr/bin/env bash
# Полный деплой на ЧИСТЫЙ Ubuntu 24.04 с локальным Postgres.
# Запуск:  cd /opt && git clone https://github.com/Sopkas/CM.git champions && cd champions && bash deploy/fresh.sh
# Идемпотентный, секреты генерит сам — Supabase не нужен.
set -euo pipefail
APP=/opt/champions
DBNAME=champions
DBUSER=champions
DBPASS=champions
DBURL="postgresql://$DBUSER:$DBPASS@localhost:5432/$DBNAME"

# публичный IP сервера (для Caddy)
IP=$(ip -4 -o addr show eth0 2>/dev/null | awk '{print $4}' | cut -d/ -f1 || true)
[ -z "${IP:-}" ] && IP=$(curl -s --max-time 8 ifconfig.me || true)
echo ">>> публичный IP: ${IP:-НЕ ОПРЕДЕЛЁН}"

echo ">>> [1/8] swap 2G"
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo ">>> [2/8] базовый софт"
apt-get update
apt-get install -y git curl ca-certificates openssl

echo ">>> [3/8] Node 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/node20.sh
  bash /tmp/node20.sh
  apt-get install -y nodejs
fi
node -v

echo ">>> [4/8] PostgreSQL (локально)"
apt-get install -y postgresql
systemctl enable --now postgresql
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DBUSER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE $DBUSER LOGIN PASSWORD '$DBPASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DBNAME OWNER $DBUSER;"

echo ">>> [5/8] Caddy"
if ! command -v caddy >/dev/null 2>&1; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy.key
  gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.key
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo ">>> [6/8] .env (генерим, если нет)"
if [ ! -f "$APP/.env" ]; then
  SECRET=$(openssl rand -hex 24)
  cat > "$APP/.env" <<ENVEOF
DATABASE_URL="$DBURL"
DIRECT_URL="$DBURL"
WC_API_BASE_URL=""
WC_API_EMAIL=""
WC_API_PASSWORD=""
SYNC_SECRET="$SECRET"
ADMIN_INVITE_CODE="admin-первый-вход"
ENVEOF
  echo "    .env создан (SYNC_SECRET сгенерирован, БД локальная)"
fi

echo ">>> [7/8] сборка + схема БД (пара минут)"
cd "$APP"
npm ci
npm run build
npx prisma db push

echo ">>> [8/8] сервисы: app + Caddy(HTTPS) + крон"
cp deploy/champions.service /etc/systemd/system/champions.service
systemctl daemon-reload
systemctl enable --now champions
systemctl restart champions

cat > /etc/caddy/Caddyfile <<CADDYEOF
{
	auto_https disable_redirects
}

https://${IP} {
	tls internal
	reverse_proxy 127.0.0.1:3000
}
CADDYEOF
systemctl restart caddy

cp deploy/sync.sh "$APP/sync.sh"
chmod +x "$APP/sync.sh"
echo '* * * * * root /opt/champions/sync.sh' > /etc/cron.d/champions-sync
chmod 644 /etc/cron.d/champions-sync

sleep 4
echo
echo "==================================================="
echo " ГОТОВО."
echo " Открой:  https://${IP}"
echo " (самоподписанный серт — браузер ругнётся, жми «всё равно перейти»)"
printf " Локальный отклик: "
curl -s -o /dev/null -w 'http=%{http_code} time=%{time_total}s\n' --max-time 10 http://127.0.0.1:3000 \
  || echo "приложение не отвечает — смотри journalctl -u champions -n 40 --no-pager"
echo
echo " Дальше:  /join -> код  admin-первый-вход  -> в админке «Импорт из ESPN»"
echo "==================================================="
