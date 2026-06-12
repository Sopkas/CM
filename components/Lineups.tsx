"use client";

// Стартовые составы на поле (как на SofaScore, но без рейтингов — ESPN их не отдаёт).
// Формация, позиции, голы/карточки/замены; тап по игроку → его статы из ESPN.
import { useState } from "react";
import type { TeamLineup, LineupPlayer } from "@/lib/espn";

export function Lineups({
  home,
  away,
}: {
  home: TeamLineup;
  away: TeamLineup;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Составы</h2>
      <div className="space-y-3">
        <TeamPitch lineup={home} />
        <TeamPitch lineup={away} />
      </div>
    </section>
  );
}

function TeamPitch({ lineup }: { lineup: TeamLineup }) {
  const [selected, setSelected] = useState<LineupPlayer | null>(null);
  // линии атака→защита сверху вниз: вратарь (rows[0]) внизу
  const rows = [...lineup.rows].reverse();

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-surface">
        <span className="font-semibold text-sm truncate">{lineup.team}</span>
        {lineup.formation && (
          <span className="text-xs text-muted font-mono">{lineup.formation}</span>
        )}
      </div>

      <div
        className="px-2 py-4 space-y-3"
        style={{
          background:
            "repeating-linear-gradient(0deg, #1f6f43 0 38px, #1c6740 38px 76px)",
        }}
      >
        {rows.map((line, i) => (
          <div key={i} className="flex justify-around items-start">
            {line.map((p) => (
              <PlayerMarker
                key={p.id + p.jersey}
                p={p}
                active={selected?.id === p.id}
                onClick={() => setSelected(selected?.id === p.id ? null : p)}
              />
            ))}
          </div>
        ))}
      </div>

      {selected && <StatsPanel p={selected} />}

      {lineup.bench.length > 0 && <Bench bench={lineup.bench} />}
    </div>
  );
}

function PlayerMarker({
  p,
  active,
  onClick,
}: {
  p: LineupPlayer;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 w-16 focus:outline-none"
    >
      <span className="relative">
        <span
          className={`block w-10 h-10 rounded-full overflow-hidden bg-white/90 ring-2 ${
            active ? "ring-warn" : "ring-white/70"
          }`}
        >
          {p.headshot ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={p.headshot}
              alt={p.name}
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="w-full h-full flex items-center justify-center text-sm font-bold text-[#1f6f43]">
              {p.jersey}
            </span>
          )}
        </span>
        <span className="absolute -top-1 -right-1 flex gap-0.5">
          {p.goals > 0 && <Badge>⚽{p.goals > 1 ? p.goals : ""}</Badge>}
          {p.yellow > 0 && <Badge className="bg-yellow-400">{""}</Badge>}
          {p.red > 0 && <Badge className="bg-red-600">{""}</Badge>}
        </span>
        {p.subbedOut && (
          <span className="absolute -bottom-1 -right-1 text-[10px]">🔻</span>
        )}
      </span>
      <span className="text-[10px] text-white font-medium leading-tight text-center">
        <span className="opacity-70">{p.jersey} </span>
        {p.name}
      </span>
    </button>
  );
}

function Badge({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`min-w-[14px] h-3.5 px-0.5 rounded-sm text-[9px] leading-[14px] text-center font-bold ${className}`}
    >
      {children}
    </span>
  );
}

function StatsPanel({ p }: { p: LineupPlayer }) {
  const shown = p.keyStats.filter((s) => s.value !== "0");
  return (
    <div className="px-3 py-2.5 bg-surface-2 border-t border-border">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="font-semibold text-sm">
          {p.jersey} {p.name}
        </span>
        <span className="text-xs text-muted">{p.position}</span>
        {p.subbedOut && <span className="text-[10px] text-danger">заменён</span>}
      </div>
      {shown.length === 0 ? (
        <p className="text-xs text-muted">Нет статистики по игроку.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((s) => (
            <span
              key={s.label}
              className="text-xs px-2 py-1 rounded-lg bg-surface text-foreground"
            >
              <span className="opacity-70">{s.label}:</span>{" "}
              <span className="font-semibold">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Bench({ bench }: { bench: LineupPlayer[] }) {
  return (
    <div className="px-3 py-2 bg-surface border-t border-border">
      <div className="text-[11px] text-muted uppercase tracking-wide mb-1">
        Запас
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
        {bench.map((p) => (
          <span key={p.id + p.jersey} className={p.subbedIn ? "text-accent" : "text-muted"}>
            <span className="opacity-70">{p.jersey}</span> {p.name}
            {p.subbedIn && " ↑"}
            {p.goals > 0 && " ⚽"}
            {p.yellow > 0 && " 🟨"}
            {p.red > 0 && " 🟥"}
          </span>
        ))}
      </div>
    </div>
  );
}
