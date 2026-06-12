# Деплой на VDS (Selectel, Ubuntu 24.04)

Сервер: `161.104.32.35` (1 vCPU / 2 ГБ / 25 ГБ). БД — внешняя (Supabase), на сервере крутится только Next-приложение.

> Подключайся **без VPN** (через VPN рвётся SSH из-за MTU). С телефона/мака напрямую — ок.

```bash
ssh root@161.104.32.35
```

Дальше всё выполняется на сервере под root, **блоками по порядку**.

---

## 1. (опц.) вернуть MTU интерфейса в норму

Мы временно ставили 1300 — без VPN он не нужен:

```bash
ip link set eth0 mtu 1500
```

## 2. Swap 2 ГБ (страховка от OOM при сборке на 2 ГБ RAM)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

## 3. Базовый софт: Node 20, git, curl

```bash
apt update && apt install -y git curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x -o /tmp/node20.sh
bash /tmp/node20.sh
apt install -y nodejs
node -v && npm -v
```

## 4. Caddy (reverse-proxy + самоподписанный HTTPS)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' -o /tmp/caddy.key
gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg /tmp/caddy.key
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

## 5. Клонировать репозиторий

```bash
mkdir -p /opt && cd /opt
git clone https://github.com/Sopkas/CM.git champions
cd champions
```

## 6. Залить `.env` (с секретами — его нет в git)

`.env` уже есть на твоём маке в `~/champions/.env`. **С мака (без VPN)** в отдельном терминале:

```bash
scp ~/champions/.env root@161.104.32.35:/opt/champions/.env
```

Проверь на сервере, что файл на месте: `cat /opt/champions/.env | head`.

## 7. Установить зависимости и собрать

```bash
cd /opt/champions
npm ci
npm run build      # prisma generate && next build
```

> Схему БД пересоздавать НЕ нужно — она уже есть в Supabase. Никаких `db push`/`migrate`.

## 8. systemd-сервис (держит приложение живым)

```bash
cat > /etc/systemd/system/champions.service <<'UNIT'
[Unit]
Description=Champions WC2026 (Next.js)
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/champions
EnvironmentFile=/opt/champions/.env
Environment=NODE_ENV=production
Environment=PORT=3000
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now champions
sleep 3
systemctl status champions --no-pager | head -12
curl -sI http://127.0.0.1:3000 | head -1     # ждём HTTP/1.1 200 (или 307 редирект)
```

## 9. Caddy: HTTPS на IP с самоподписанным сертом

```bash
cat > /etc/caddy/Caddyfile <<'CADDY'
{
	auto_https disable_redirects
}

https://161.104.32.35 {
	tls internal
	reverse_proxy 127.0.0.1:3000
}
CADDY

systemctl restart caddy
curl -skI https://161.104.32.35 | head -1     # ждём HTTP/2 200
```

Открой в браузере **https://161.104.32.35** → браузер ругнётся на самоподписанный серт (это норм) → «Дополнительно → Перейти на сайт».

## 10. Крон синка каждую минуту (live-счёт/статы)

```bash
cat > /opt/champions/sync.sh <<'SH'
#!/usr/bin/env bash
set -a; . /opt/champions/.env; set +a
curl -s -H "Authorization: Bearer $SYNC_SECRET" http://127.0.0.1:3000/api/sync >/dev/null
SH
chmod +x /opt/champions/sync.sh

echo '* * * * * root /opt/champions/sync.sh' > /etc/cron.d/champions-sync
chmod 644 /etc/cron.d/champions-sync
cat /etc/cron.d/champions-sync
```

---

## Готово ✅

Приложение: **https://161.104.32.35**

### Обновить после изменений в репо

```bash
cd /opt/champions && git pull && npm ci && npm run build && systemctl restart champions
```

### Полезное

```bash
systemctl status champions          # статус
journalctl -u champions -f          # логи приложения
journalctl -u caddy -f              # логи прокси
systemctl restart champions         # рестарт
```
