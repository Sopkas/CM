"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MARKETS, MARKET_GROUPS } from "@/lib/markets";

interface Props {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  deadlineMs: number;
}

export function PredictForm({
  matchId,
  homeTeam,
  awayTeam,
  deadlineMs,
}: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(deadlineMs - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(deadlineMs - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const locked = remaining <= 0;
  const chosenCount = Object.keys(picks).length;

  // подмена П1/П2 на названия команд в подсказке
  const legend = useMemo(
    () => `П1 — ${homeTeam} · П2 — ${awayTeam}`,
    [homeTeam, awayTeam],
  );

  function toggle(market: string, value: string) {
    setPicks((prev) => {
      const next = { ...prev };
      if (next[market] === value) delete next[market];
      else next[market] = value;
      return next;
    });
  }

  async function save() {
    const arr = Object.entries(picks).map(([market, selection]) => ({ market, selection }));
    if (arr.length === 0) {
      setMsg("Выбери хотя бы один рынок");
      return;
    }
    if (!confirm(`Сделать ставку (${arr.length})? Изменить её потом будет нельзя.`)) {
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/market-picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId, picks: arr }),
      });
      const data = await res.json();
      if (!res.ok) setMsg(data.error ?? "Ошибка");
      else {
        setMsg(`Сохранено ✓ (${data.saved})`);
        router.refresh();
      }
    } catch {
      setMsg("Сеть недоступна");
    } finally {
      setSaving(false);
    }
  }

  if (locked) {
    return (
      <div className="rounded-xl border border-border bg-surface p-4 text-center text-muted text-sm">
        Приём прогнозов закрыт (дедлайн прошёл).
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CountdownBadge ms={remaining} />
      <p className="text-xs text-muted text-center">{legend}</p>
      <p className="text-xs text-warn text-center">
        ⚠️ Ставка одноразовая — после сохранения изменить нельзя.
      </p>

      {MARKET_GROUPS.map((group) => (
        <section key={group} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted uppercase tracking-wide">
            {group}
          </h3>
          {MARKETS.filter((m) => m.group === group).map((m) =>
            m.key === "exact_score" ? (
              <ExactScoreRow
                key={m.key}
                points={m.points}
                value={picks[m.key] ?? null}
                onChange={(v) =>
                  setPicks((prev) => {
                    const next = { ...prev };
                    if (v === null) delete next[m.key];
                    else next[m.key] = v;
                    return next;
                  })
                }
              />
            ) : (
              <div
                key={m.key}
                className="rounded-xl border border-border bg-surface p-2.5"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className="text-[11px] text-accent-2">+{m.points}</span>
                </div>
                <div className="grid grid-flow-col auto-cols-fr gap-1.5">
                  {m.options.map((o) => {
                    const active = picks[m.key] === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => toggle(m.key, o.value)}
                        className={`py-2 rounded-lg text-sm transition ${
                          active
                            ? "bg-accent/25 ring-1 ring-accent font-semibold"
                            : "bg-surface-2 hover:bg-surface-2/70"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
          )}
        </section>
      ))}

      <div className="sticky bottom-16 sm:bottom-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-accent text-background font-semibold py-3 rounded-xl shadow-lg disabled:opacity-50"
        >
          {saving ? "Сохраняю…" : `Сохранить прогноз (${chosenCount})`}
        </button>
        {msg && <p className="text-center text-sm text-muted mt-1.5">{msg}</p>}
      </div>
    </div>
  );
}

function ExactScoreRow({
  points,
  value,
  onChange,
}: {
  points: number;
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const enabled = value !== null;
  const [h, a] = value ? value.split(":").map(Number) : [0, 0];

  function set(nh: number, na: number) {
    onChange(`${Math.max(0, nh)}:${Math.max(0, na)}`);
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">Точный счёт</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-accent-2">+{points}</span>
          <button
            onClick={() => onChange(enabled ? null : "0:0")}
            className={`text-xs px-2 py-0.5 rounded ${
              enabled ? "bg-accent/20 text-accent" : "bg-surface-2 text-muted"
            }`}
          >
            {enabled ? "вкл" : "выкл"}
          </button>
        </div>
      </div>
      {enabled && (
        <div className="flex items-center justify-center gap-3">
          <Stepper value={h} onChange={(v) => set(v, a)} />
          <span className="text-muted font-bold">:</span>
          <Stepper value={a} onChange={(v) => set(h, v)} />
        </div>
      )}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-lg bg-surface-2 text-lg font-bold active:scale-95"
      >
        −
      </button>
      <span className="w-8 text-center text-xl font-mono font-bold">{value}</span>
      <button
        onClick={() => onChange(Math.min(9, value + 1))}
        className="w-8 h-8 rounded-lg bg-surface-2 text-lg font-bold active:scale-95"
      >
        +
      </button>
    </div>
  );
}

function CountdownBadge({ ms }: { ms: number }) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const text = d > 0 ? `${d}д ${h}ч ${m}м` : h > 0 ? `${h}ч ${m}м ${s}с` : `${m}м ${s}с`;
  const urgent = ms < 30 * 60_000;
  return (
    <div
      className={`text-center text-sm rounded-lg py-1.5 ${
        urgent ? "bg-warn/15 text-warn" : "bg-surface-2 text-muted"
      }`}
    >
      До закрытия: <span className="font-mono font-semibold">{text}</span>
    </div>
  );
}
