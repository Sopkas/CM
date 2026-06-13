"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MARKETS, MARKET_TABS, type MarketDef } from "@/lib/markets";

const MAX_PICKS = 3; // не больше 3 котировок на матч

interface Props {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  deadlineMs: number;
  initialPicks?: Record<string, string>;
  forceOpen?: boolean;
}

export function PredictForm({
  matchId,
  homeTeam,
  awayTeam,
  deadlineMs,
  initialPicks,
  forceOpen = false,
}: Props) {
  const router = useRouter();
  const [picks, setPicks] = useState<Record<string, string>>(initialPicks ?? {});
  const [tab, setTab] = useState<string>(MARKET_TABS[0]);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(() => deadlineMs - Date.now());

  useEffect(() => {
    const id = setInterval(() => setRemaining(deadlineMs - Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadlineMs]);

  const locked = remaining <= 0 && !forceOpen;
  const chosenCount = Object.keys(picks).length;
  const legend = useMemo(() => `П1 — ${homeTeam} · П2 — ${awayTeam}`, [homeTeam, awayTeam]);

  // какие рынки показывать: при поиске — по всем вкладкам, иначе — активная вкладка
  const q = query.trim().toLowerCase();
  const shown: MarketDef[] = useMemo(() => {
    if (q) {
      return MARKETS.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.subtitle.toLowerCase().includes(q) ||
          m.tab.toLowerCase().includes(q),
      );
    }
    return MARKETS.filter((m) => m.tab === tab);
  }, [q, tab]);

  function pick(market: string, value: string) {
    const isNew = picks[market] === undefined;
    if (isNew && Object.keys(picks).length >= MAX_PICKS) {
      setMsg(`Максимум ${MAX_PICKS} котировки на матч — сними другую`);
      return;
    }
    setMsg(null);
    setPicks((prev) => {
      const next = { ...prev };
      if (next[market] === value) delete next[market];
      else next[market] = value;
      return next;
    });
  }

  function setExact(v: string | null) {
    const isNew = picks["exact_score"] === undefined;
    if (v !== null && isNew && Object.keys(picks).length >= MAX_PICKS) {
      setMsg(`Максимум ${MAX_PICKS} котировки на матч — сними другую`);
      return;
    }
    setMsg(null);
    setPicks((prev) => {
      const next = { ...prev };
      if (v === null) delete next["exact_score"];
      else next["exact_score"] = v;
      return next;
    });
  }

  async function save() {
    const arr = Object.entries(picks).map(([market, selection]) => ({ market, selection }));
    if (arr.length === 0) {
      setMsg("Выбери хотя бы один рынок");
      return;
    }
    if (!forceOpen && !confirm(`Сделать ставку (${arr.length} рынк.)? Изменить её потом будет нельзя.`)) {
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
    <div className="space-y-3">
      <CountdownBadge ms={remaining} />
      <p className="text-xs text-muted text-center">{legend}</p>
      <p className="text-xs text-warn text-center">
        {forceOpen
          ? "🔓 Матч открыт админом — можно переставить выборы."
          : "⚠️ Ставка одноразовая — после сохранения изменить нельзя."}
      </p>
      <p className="text-xs text-muted text-center">
        Выбрано <span className="font-semibold text-foreground">{chosenCount}/{MAX_PICKS}</span> котировок · считаются отдельно · <span className="text-warn">за неверный −очки</span>
      </p>

      {/* Поиск */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔎 Поиск рынка (тотал, фора, 1-й тайм…)"
        className="w-full bg-surface-2 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent"
      />

      {/* Вкладки */}
      {!q && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {MARKET_TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm transition ${
                tab === t ? "bg-accent text-background font-semibold" : "bg-surface-2 text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {/* Карточки рынков */}
      <div className="space-y-2">
        {shown.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Ничего не найдено.</p>
        ) : (
          shown.map((m) =>
            m.key === "exact_score" ? (
              <ExactScoreCard
                key={m.key}
                value={picks[m.key] ?? null}
                points={m.points}
                onChange={setExact}
              />
            ) : (
              <MarketCard key={m.key} m={m} selected={picks[m.key] ?? null} onPick={pick} />
            ),
          )
        )}
      </div>

      {/* Сохранить */}
      <div className="sticky bottom-16 sm:bottom-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="w-full bg-accent text-background font-semibold py-3 rounded-xl shadow-lg disabled:opacity-50"
        >
          {saving ? "Сохраняю…" : `Сохранить прогноз (${chosenCount}/${MAX_PICKS})`}
        </button>
        {msg && <p className="text-center text-sm text-muted mt-1.5">{msg}</p>}
      </div>
    </div>
  );
}

function MarketCard({
  m,
  selected,
  onPick,
}: {
  m: MarketDef;
  selected: string | null;
  onPick: (market: string, value: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const cols = m.options.length <= 3 ? "grid-flow-col auto-cols-fr" : "grid-cols-2";
  return (
    <section className="rounded-xl border border-border bg-surface overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="text-sm font-medium block truncate">
            {m.label}
            {selected && <span className="text-accent"> ●</span>}
          </span>
          <span className="text-[11px] text-muted">{m.subtitle}</span>
        </span>
        <span className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-accent-2">±{m.points}</span>
          <span className="text-muted text-xs">{open ? "▲" : "▼"}</span>
        </span>
      </button>
      {open && (
        <div className={`grid ${cols} gap-1.5 px-2.5 pb-2.5`}>
          {m.options.map((o) => {
            const active = selected === o.value;
            return (
              <button
                key={o.value}
                onClick={() => onPick(m.key, o.value)}
                className={`py-2 px-1 rounded-lg text-xs leading-tight transition ${
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
      )}
    </section>
  );
}

function ExactScoreCard({
  value,
  points,
  onChange,
}: {
  value: string | null;
  points: number;
  onChange: (v: string | null) => void;
}) {
  const enabled = value !== null;
  const [h, a] = value ? value.split(":").map(Number) : [0, 0];
  const set = (nh: number, na: number) => onChange(`${Math.max(0, nh)}:${Math.max(0, na)}`);
  return (
    <section className="rounded-xl border border-border bg-surface p-2.5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">
          Точный счёт{value && <span className="text-accent"> ●</span>}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-accent-2">±{points}</span>
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
    </section>
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
