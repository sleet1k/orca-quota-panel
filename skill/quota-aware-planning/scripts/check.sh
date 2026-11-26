#!/usr/bin/env bash
# Печатает остаток бесплатного лимита OpenRouter (rpd), credits и эффективный режим.
set -u
DIR="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$(cat "$DIR/key.txt" 2>/dev/null)"
if [ -z "$KEY" ]; then echo "ERROR: key.txt пуст"; exit 1; fi
export OR_KEY="$KEY"
export OR_MODE_FILE="$DIR/mode.txt"
curl -s https://openrouter.ai/api/v1/key -H "Authorization: Bearer $KEY" | python -c "
import json,sys,os
from datetime import datetime, timezone, timedelta
d=json.load(sys.stdin).get('data',{})
f=d.get('free_model_daily_requests',{})
u=f.get('used',0); lim=f.get('limit',0); rem=f.get('remaining',0)
pct=(u/lim*100) if lim else 0
try:
    manual=open(os.environ['OR_MODE_FILE']).read().strip().lower() or 'auto'
except Exception:
    manual='auto'
if manual not in ('auto','turbo','balance','eco'): manual='auto'
eff=manual if manual!='auto' else ('turbo' if rem>400 else ('balance' if rem>=150 else 'eco'))
now=datetime.now(timezone.utc)
reset=datetime(now.year,now.month,now.day,tzinfo=timezone.utc)+timedelta(days=1)
local=reset.astimezone()
print(f'rpd: {u}/{lim} used, {rem} remaining ({pct:.0f}% израсходовано)')
print(f'is_free_tier: {d.get(\"is_free_tier\")}')
print(f'credits_remaining: {d.get(\"limit_remaining\")}')
print(f'manual_mode: {manual} | effective_mode: {eff}')
print(f'reset: {reset.strftime(\"%H:%M UTC\")} = {local.strftime(\"%H:%M %Z\")} (local)')
"