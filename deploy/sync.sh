#!/usr/bin/env bash
# Дёргает /api/sync с секретом — вешается в /etc/cron.d на каждую минуту.
set -a
. /opt/champions/.env
set +a
curl -s -H "Authorization: Bearer $SYNC_SECRET" http://127.0.0.1:3000/api/sync >/dev/null
