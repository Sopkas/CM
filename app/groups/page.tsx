import Link from "next/link";
import { db } from "@/lib/db";
import { computeGroupTable } from "@/lib/standings";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Flag } from "@/components/Flag";
import type { Match } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function GroupsPage() {
  const matches = await db.match.findMany({
    where: { stage: "group", group: { not: null } },
    orderBy: { matchDate: "asc" },
  });

  const byGroup = new Map<string, Match[]>();
  for (const m of matches) {
    const g = m.group!;
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g)!.push(m);
  }
  const groups = [...byGroup.keys()].sort();

  return (
    <div className="space-y-5">
      <AutoRefresh seconds={60} />
      <div className="section-head">
        Групповой этап — {matches.length} матчей, {groups.length} групп
      </div>

      {groups.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard key={g} letter={g} matches={byGroup.get(g)!} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted">
        Первые две команды выходят в плей-офф. Таблицы и счёт обновляются автоматически.
      </p>
    </div>
  );
}

// Колонки таблицы задаём инлайном, а не arbitrary-классом grid-cols-[…]:
// Tailwind v4 JIT в dev иногда не успевает сгенерировать такой «тяжёлый»
// класс при холодной пересборке, и таблица схлопывается в одну колонку.
const TABLE_COLS = "1.4rem 1fr 1.4rem 1.4rem 1.4rem 2.6rem 1.7rem";

function GroupCard({ letter, matches }: { letter: string; matches: Match[] }) {
  const table = computeGroupTable(matches);
  return (
    <div className="rounded-md border border-border bg-surface overflow-hidden">
      <div className="bg-accent text-background px-3 py-1.5">
        <span className="text-xs font-bold tracking-widest uppercase">Группа {letter}</span>
      </div>

      {/* Таблица */}
      <div className="px-3 pt-2.5 pb-1">
        <div
          className="grid gap-1 text-[10px] text-muted uppercase tracking-wide pb-1"
          style={{ gridTemplateColumns: TABLE_COLS }}
        >
          <span />
          <span>Команда</span>
          <span className="text-center">В</span>
          <span className="text-center">Н</span>
          <span className="text-center">П</span>
          <span className="text-center">Голы</span>
          <span className="text-right">О</span>
        </div>
        {table.map((r, i) => {
          const qualified = i < 2;
          return (
            <div
              key={r.team}
              className={`grid gap-1 items-center py-1 text-sm border-t border-border/60 ${
                qualified ? "" : "text-faint"
              }`}
              style={{ gridTemplateColumns: TABLE_COLS }}
            >
              <span className="tnum text-muted text-xs">{i + 1}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                <Flag team={r.team} className="text-sm" />
                <span className={`truncate ${qualified ? "font-semibold" : ""}`}>{r.team}</span>
              </span>
              <span className="text-center tnum text-xs">{r.won}</span>
              <span className="text-center tnum text-xs">{r.drawn}</span>
              <span className="text-center tnum text-xs">{r.lost}</span>
              <span className="text-center tnum text-xs">
                {r.gf}:{r.ga}
              </span>
              <span className="text-right tnum font-bold">{r.points}</span>
            </div>
          );
        })}
      </div>

      {/* Результаты */}
      <div className="px-3 pb-2.5 pt-1.5 mt-1 border-t border-border space-y-0.5">
        {matches.map((m) => (
          <ResultRow key={m.id} m={m} />
        ))}
      </div>
    </div>
  );
}

function ResultRow({ m }: { m: Match }) {
  const played = m.status === "finished" || m.status === "live";
  return (
    <Link
      href={`/predict/${m.id}`}
      className="flex items-center gap-2 py-0.5 text-[13px] hover:bg-surface-2/60 rounded px-1 -mx-1"
    >
      <span className="flex flex-1 items-center justify-end gap-1.5 min-w-0">
        <span className="truncate text-right">{m.homeTeam}</span>
        <Flag team={m.homeTeam} className="text-sm" />
      </span>
      <span className="score text-[13px] w-12 shrink-0 text-center">
        {played ? `${m.homeScore ?? 0}–${m.awayScore ?? 0}` : timeShort(m.matchDate)}
      </span>
      <span className="flex flex-1 items-center gap-1.5 min-w-0">
        <Flag team={m.awayTeam} className="text-sm" />
        <span className="truncate">{m.awayTeam}</span>
      </span>
    </Link>
  );
}

const dt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
function timeShort(d: Date): string {
  return dt.format(d);
}

function Empty() {
  return (
    <div className="rounded-md border border-dashed border-border p-6 text-center text-muted text-sm">
      Групп пока нет — сделай импорт из ESPN в админке.
    </div>
  );
}
