// Статистика матча (из ESPN) — визуальная: владение, группы рынков, диверг-бары.
import { type MatchStats } from "@/lib/espn";
import { Flag } from "@/components/Flag";

const RU: Record<string, string> = {
  Possession: "Владение",
  SHOTS: "Удары",
  "ON GOAL": "Удары в створ",
  "Corner Kicks": "Угловые",
  Fouls: "Фолы",
  Offsides: "Офсайды",
  "Yellow Cards": "Жёлтые карточки",
  "Red Cards": "Красные карточки",
  Saves: "Сейвы",
  Passes: "Передачи",
  "Pass Completion %": "Точность передач",
};

const GROUPS: { title: string; labels: string[] }[] = [
  { title: "Атака", labels: ["SHOTS", "ON GOAL", "Corner Kicks", "Offsides"] },
  { title: "Пас", labels: ["Passes", "Pass Completion %"] },
  { title: "Прочее", labels: ["Fouls", "Yellow Cards", "Red Cards", "Saves"] },
];

function num(v: string | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace("%", ""));
  return Number.isNaN(n) ? 0 : n;
}

function has(stats: MatchStats, label: string): boolean {
  return stats.home[label] != null || stats.away[label] != null;
}

export function MatchStatsView({
  stats,
  homeTeam,
  awayTeam,
}: {
  stats: MatchStats;
  homeTeam?: string;
  awayTeam?: string;
}) {
  const anyStat =
    GROUPS.some((g) => g.labels.some((l) => has(stats, l))) || has(stats, "Possession");
  if (!anyStat) return null;

  const possession = has(stats, "Possession");

  return (
    <section className="rounded-xl border border-border bg-surface p-4 space-y-4">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-semibold min-w-0">
          <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
          {homeTeam && <Flag team={homeTeam} />}
          <span className="truncate">{homeTeam ?? "Хозяева"}</span>
        </span>
        <span className="text-muted uppercase tracking-wide shrink-0 px-2">
          Статистика
        </span>
        <span className="flex items-center gap-1.5 font-semibold min-w-0 justify-end">
          <span className="truncate">{awayTeam ?? "Гости"}</span>
          {awayTeam && <Flag team={awayTeam} />}
          <span className="w-2 h-2 rounded-full bg-accent-2 shrink-0" />
        </span>
      </div>

      {possession && (
        <Possession
          home={num(stats.home["Possession"])}
          away={num(stats.away["Possession"])}
          homeRaw={stats.home["Possession"]}
          awayRaw={stats.away["Possession"]}
        />
      )}

      {GROUPS.map((g) => {
        const labels = g.labels.filter((l) => has(stats, l));
        if (labels.length === 0) return null;
        return (
          <div key={g.title} className="space-y-2.5">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wide">
              {g.title}
            </h3>
            {labels.map((label) => (
              <StatRow
                key={label}
                label={RU[label] ?? label}
                home={num(stats.home[label])}
                away={num(stats.away[label])}
                homeRaw={stats.home[label]}
                awayRaw={stats.away[label]}
              />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function Possession({
  home,
  away,
  homeRaw,
  awayRaw,
}: {
  home: number;
  away: number;
  homeRaw?: string;
  awayRaw?: string;
}) {
  const total = home + away || 1;
  const hPct = Math.round((home / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-lg font-bold font-mono text-accent">
          {homeRaw ?? `${hPct}%`}
        </span>
        <span className="text-xs text-muted">Владение</span>
        <span className="text-lg font-bold font-mono text-accent-2">
          {awayRaw ?? `${100 - hPct}%`}
        </span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden bg-surface-2">
        <div className="bg-accent" style={{ width: `${hPct}%` }} />
        <div className="bg-accent-2" style={{ width: `${100 - hPct}%` }} />
      </div>
    </div>
  );
}

function StatRow({
  label,
  home,
  away,
  homeRaw,
  awayRaw,
}: {
  label: string;
  home: number;
  away: number;
  homeRaw?: string;
  awayRaw?: string;
}) {
  const total = home + away || 1;
  const hPct = Math.round((home / total) * 100);
  const homeLeads = home > away;
  const awayLeads = away > home;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span
          className={`font-mono w-10 ${homeLeads ? "font-bold text-accent" : "text-muted"}`}
        >
          {homeRaw ?? "—"}
        </span>
        <span className="text-xs text-muted text-center flex-1">{label}</span>
        <span
          className={`font-mono w-10 text-right ${
            awayLeads ? "font-bold text-accent-2" : "text-muted"
          }`}
        >
          {awayRaw ?? "—"}
        </span>
      </div>
      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-2 gap-px">
        <div
          className={homeLeads ? "bg-accent" : "bg-accent/40"}
          style={{ width: `${hPct}%` }}
        />
        <div
          className={awayLeads ? "bg-accent-2" : "bg-accent-2/40"}
          style={{ width: `${100 - hPct}%` }}
        />
      </div>
    </div>
  );
}
