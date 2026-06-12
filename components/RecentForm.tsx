// Форма команд — последние 5 матчей из ESPN (lastFiveGames).
import type { TeamForm, FormGame } from "@/lib/espn";

const RESULT = {
  W: { letter: "В", cls: "bg-accent/20 text-accent" },
  D: { letter: "Н", cls: "bg-surface-2 text-muted" },
  L: { letter: "П", cls: "bg-danger/15 text-danger" },
} as const;

export function RecentForm({
  home,
  away,
}: {
  home: TeamForm;
  away: TeamForm;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-muted mb-2">Последние матчи</h2>
      <div className="rounded-xl border border-border bg-surface divide-y divide-border">
        <TeamRow form={home} />
        <TeamRow form={away} />
      </div>
    </section>
  );
}

function TeamRow({ form }: { form: TeamForm }) {
  if (form.games.length === 0) {
    return (
      <div className="p-3 text-sm">
        <span className="font-medium">{form.team}</span>
        <span className="text-muted ml-2">нет данных</span>
      </div>
    );
  }
  return (
    <div className="p-3">
      <div className="text-sm font-medium mb-2 truncate">{form.team}</div>
      <div className="flex gap-1.5">
        {form.games.map((g, i) => (
          <GamePill key={i} g={g} />
        ))}
      </div>
    </div>
  );
}

function GamePill({ g }: { g: FormGame }) {
  const r = RESULT[g.result as keyof typeof RESULT] ?? RESULT.D;
  return (
    <div className="flex flex-col items-center gap-1 min-w-0">
      <span
        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${r.cls}`}
        title={`${g.atVs === "@" ? "в гостях" : "дома"} ${g.opponent} · ${g.teamScore}:${g.oppScore}${g.pens ? ` (пен ${g.pens})` : ""} · ${g.competition}`}
      >
        {r.letter}
      </span>
      <span className="text-[10px] font-mono text-muted">
        {g.teamScore}:{g.oppScore}
        {g.pens && <span className="text-[8px]"> ({g.pens}п)</span>}
      </span>
      <span className="text-[9px] text-muted max-w-12 truncate text-center leading-tight">
        {g.atVs === "@" ? "@ " : ""}
        {g.opponent}
      </span>
    </div>
  );
}
