// Персональный дашборд участника — визуальная статистика.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Dashboard as DashboardData } from "@/lib/breakdown";
import type { UserVibe } from "@/lib/vibes";
import { MARKET_BY_KEY } from "@/lib/markets";
import { Avatar } from "@/components/Avatar";
import { VibeBadges } from "@/components/VibeBadges";

const OUTCOME_RU: Record<string, string> = {
  home: "П1",
  draw: "Х",
  away: "П2",
};

export function Dashboard({
  data,
  vibe,
  headerRight,
}: {
  data: DashboardData;
  vibe?: UserVibe;
  headerRight?: ReactNode;
}) {
  const { user } = data;

  return (
    <div className="space-y-5">
      {/* Шапка профиля */}
      <div className="flex items-center gap-3">
        <Avatar avatar={user.avatar} size={52} />
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{user.nickname}</h1>
          <div className="text-sm text-muted">
            <span className="text-accent font-semibold">#{data.rank}</span> ·{" "}
            <span className="font-mono">{user.totalPoints}</span> очков
            {user.isAdmin && <span className="ml-2 text-xs text-accent-2">админ</span>}
          </div>
          {vibe && (
            <div className="mt-1">
              <VibeBadges vibe={vibe} showNames />
            </div>
          )}
        </div>
        {headerRight}
      </div>

      {/* KPI */}
      <div className="grid grid-cols-4 gap-2">
        <Kpi label="Очки" value={user.totalPoints} accent />
        <Kpi label="Место" value={`#${data.rank}`} />
        <Kpi label="Точность" value={`${data.accuracy}%`} />
        <Kpi label="Точных" value={data.exactScores} />
      </div>
      <p className="text-xs text-muted -mt-2">
        Угадано {data.picksCorrect} из {data.picksPlayed} сыгранных рынков
      </p>

      {/* Откуда очки — вклад источников */}
      <SourceBars bySource={data.bySource} total={data.total} />

      {/* Форма */}
      {data.recent.length > 0 && <FormStrip recent={data.recent} />}

      {/* Точность по рынкам */}
      {data.byMarket.length > 0 && <MarketAccuracyList byMarket={data.byMarket} />}

      {/* Хайлайты */}
      <Highlights data={data} />
    </div>
  );
}

function Kpi({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3 text-center">
      <div className={`text-xl font-bold font-mono ${accent ? "text-accent" : ""}`}>
        {value}
      </div>
      <div className="text-[10px] text-muted mt-0.5">{label}</div>
    </div>
  );
}

const SOURCES: { key: keyof DashboardData["bySource"]; label: string; cls: string }[] = [
  { key: "matches", label: "Матчи", cls: "bg-accent" },
  { key: "groups", label: "Группы", cls: "bg-accent-2" },
  { key: "bracket", label: "Сетка", cls: "bg-warn" },
  { key: "bonus", label: "Бонусы", cls: "bg-danger" },
];

function SourceBars({
  bySource,
  total,
}: {
  bySource: DashboardData["bySource"];
  total: number;
}) {
  const max = Math.max(1, ...SOURCES.map((s) => bySource[s.key]));
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Откуда очки</h2>
      <div className="rounded-xl border border-border bg-surface p-3 space-y-2.5">
        {SOURCES.map((s) => {
          const v = bySource[s.key];
          const pct = total > 0 ? Math.round((v / total) * 100) : 0;
          return (
            <div key={s.key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-muted">{s.label}</span>
                <span className="font-mono">
                  <span className="font-semibold text-foreground">{v}</span>
                  <span className="text-muted"> · {pct}%</span>
                </span>
              </div>
              <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.cls}`}
                  style={{ width: `${Math.round((v / max) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
        {total === 0 && (
          <p className="text-xs text-muted text-center">Очков пока нет.</p>
        )}
      </div>
    </section>
  );
}

function FormStrip({ recent }: { recent: DashboardData["recent"] }) {
  // показываем старые→новые слева направо
  const items = [...recent].reverse();
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Форма</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {items.map((m) => (
          <Link
            key={m.matchId}
            href={`/predict/${m.matchId}`}
            className="flex flex-col items-center gap-1 shrink-0"
            title={`${m.homeTeam} — ${m.awayTeam}: ${m.points > 0 ? `+${m.points}` : m.points} (${m.count} рынк.)`}
          >
            <span
              className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold font-mono ${
                m.points > 0
                  ? "bg-accent/20 text-accent"
                  : m.points < 0
                    ? "bg-danger/15 text-danger"
                    : "bg-surface-2 text-muted"
              }`}
            >
              {m.points > 0 ? `+${m.points}` : m.points}
            </span>
            <span className="text-[9px] text-muted max-w-12 truncate text-center leading-tight">
              {abbr(m.homeTeam)}–{abbr(m.awayTeam)}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function MarketAccuracyList({
  byMarket,
}: {
  byMarket: DashboardData["byMarket"];
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Точность по рынкам</h2>
      <div className="rounded-xl border border-border bg-surface divide-y divide-border">
        {byMarket.map((m) => {
          const pct = m.played ? Math.round((m.correct / m.played) * 100) : 0;
          const label = MARKET_BY_KEY.get(m.market)?.label ?? m.market;
          return (
            <div key={m.market} className="px-3 py-2">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium truncate">{label}</span>
                <span className="text-muted font-mono shrink-0 ml-2">
                  {m.correct}/{m.played} · {pct}% · {m.points > 0 ? `+${m.points}` : m.points}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Highlights({ data }: { data: DashboardData }) {
  const bias = data.outcomeBias;
  const biasTotal = bias.home + bias.draw + bias.away || 1;
  const favMarket = data.favoriteMarket
    ? MARKET_BY_KEY.get(data.favoriteMarket)?.label ?? data.favoriteMarket
    : null;

  return (
    <section className="grid grid-cols-2 gap-2">
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
          Лучший матч
        </div>
        {data.bestMatch && data.bestMatch.points > 0 ? (
          <>
            <div className="text-sm font-medium truncate">
              {abbr(data.bestMatch.homeTeam)}–{abbr(data.bestMatch.awayTeam)}
            </div>
            <div className="text-lg font-bold font-mono text-accent">
              +{data.bestMatch.points}
            </div>
          </>
        ) : (
          <div className="text-sm text-muted">—</div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
          Любимый рынок
        </div>
        <div className="text-sm font-medium truncate">{favMarket ?? "—"}</div>
      </div>

      <div className="col-span-2 rounded-xl border border-border bg-surface p-3">
        <div className="text-[10px] text-muted uppercase tracking-wide mb-1">
          Эдж против закрытия (CLV) · скилл, а не везение
        </div>
        {data.edgePct == null ? (
          <div className="text-sm text-muted">пока нет данных</div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span
              className={`text-xl font-bold font-mono ${
                data.edgePct > 0 ? "text-accent" : data.edgePct < 0 ? "text-danger" : ""
              }`}
            >
              {data.edgePct > 0 ? "+" : ""}
              {data.edgePct}%
            </span>
            <span className="text-xs text-muted">
              {data.edgePct > 0 ? "берёшь лучше линии 🔥" : data.edgePct < 0 ? "хуже линии" : ""} ·{" "}
              {data.edgeSamples} ст.
            </span>
          </div>
        )}
      </div>

      <div className="col-span-2 rounded-xl border border-border bg-surface p-3">
        <div className="text-[10px] text-muted uppercase tracking-wide mb-1.5">
          Выбор исхода (П1 / Х / П2)
        </div>
        <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
          <div className="bg-accent" style={{ width: `${(bias.home / biasTotal) * 100}%` }} />
          <div className="bg-muted/40" style={{ width: `${(bias.draw / biasTotal) * 100}%` }} />
          <div className="bg-accent-2" style={{ width: `${(bias.away / biasTotal) * 100}%` }} />
        </div>
        <div className="flex justify-between text-[11px] text-muted mt-1 font-mono">
          <span>{OUTCOME_RU.home} {bias.home}</span>
          <span>{OUTCOME_RU.draw} {bias.draw}</span>
          <span>{OUTCOME_RU.away} {bias.away}</span>
        </div>
      </div>
    </section>
  );
}

function abbr(team: string): string {
  return team.length > 3 ? team.slice(0, 3).toUpperCase() : team.toUpperCase();
}
