#!/usr/bin/env bash
# Переезд с Supabase (EU, недостижим из РФ) на локальный Postgres на самом VDS.
# Запускать из /opt/champions под root. Идемпотентный.
set -euo pipefail
APP=/opt/champions
DBNAME=champions
DBUSER=champions
DBPASS=champions
URL="postgresql://$DBUSER:$DBPASS@localhost:5432/$DBNAME"

echo ">>> [1/5] установка PostgreSQL"
apt-get update
apt-get install -y postgresql

systemctl enable --now postgresql

echo ">>> [2/5] роль + база (если ещё нет)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DBUSER'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE $DBUSER LOGIN PASSWORD '$DBPASS';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='$DBNAME'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE DATABASE $DBNAME OWNER $DBUSER;"

echo ">>> [3/5] переключаю .env на localhost"
# бэкап и замена обеих строк подключения
cp "$APP/.env" "$APP/.env.bak.$(date +%s)"
sed -i "s#^DATABASE_URL=.*#DATABASE_URL=\"$URL\"#" "$APP/.env"
sed -i "s#^DIRECT_URL=.*#DIRECT_URL=\"$URL\"#" "$APP/.env"
echo "    DATABASE_URL -> $URL"

echo ">>> [4/5] накатываю схему Prisma в локальную базу"
cd "$APP"
npx prisma db push

echo ">>> [5/5] перезапуск приложения"
systemctl restart champions
sleep 4
curl -s -o /dev/null -w '    локальный отклик: http=%{http_code} time=%{time_total}s\n' --max-time 10 http://127.0.0.1:3000 \
  || echo "    приложение пока не отвечает — смотри: journalctl -u champions -n 40 --no-pager"

echo
echo "==================================================="
echo " ГОТОВО. База теперь локальная (localhost:5432)."
echo " Открой https://161.104.32.35 — должно грузиться мгновенно."
echo
echo " База пустая. Дальше:"
echo "  1) Зайди на /join, введи код из ADMIN_INVITE_CODE -> станешь админом"
echo "  2) В админ-панели жми «Импорт из ESPN» — подтянет все 104 матча"
echo "==================================================="
