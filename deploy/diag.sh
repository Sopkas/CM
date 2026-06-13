#!/usr/bin/env bash
# Диагностика сети/TLS. Запуск: cd /opt/champions && git pull && bash deploy/diag.sh
echo "===== 1. MTU eth0 ====="
ip -br link show eth0
echo
echo "===== 2. сервисы ====="
echo -n "champions: "; systemctl is-active champions
echo -n "caddy:     "; systemctl is-active caddy
echo
echo "===== 3. кто слушает порты ====="
ss -tlnp
echo
echo "===== 4. приложение локально (3000) ====="
curl -s -o /dev/null -w 'app: http=%{http_code} time=%{time_total}s\n' --max-time 8 http://127.0.0.1:3000 || echo "app: FAIL"
echo
echo "===== 5. TLS Caddy через loopback (без сети, без MTU) ====="
curl -sk -o /dev/null -w 'caddy loopback: https=%{http_code} time=%{time_total}s\n' \
  --max-time 8 --resolve 161.104.32.35:443:127.0.0.1 https://161.104.32.35 \
  || echo "caddy loopback: FAIL/timeout"
echo
echo "===== 6. сам сервер -> свой публичный IP:443 (через егресс) ====="
curl -sk -o /dev/null -w 'public 443: https=%{http_code} time=%{time_total}s\n' \
  --max-time 8 https://161.104.32.35 || echo "public 443: FAIL/timeout"
echo
echo "===== 7. логи Caddy ====="
journalctl -u caddy -n 20 --no-pager
echo
echo "===== 8. Caddyfile ====="
cat /etc/caddy/Caddyfile
