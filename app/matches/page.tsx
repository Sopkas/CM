import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getMatchPickSummaries } from "@/lib/breakdown";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Filter = "today" | "group" | "knockout" | "all" | "past";
const TABS: { key: Filter; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "group", label: "Группы" },
  { key: "knockout", label: "Плей-офф" },
  { key: "all", label: "Все" },
  { key: "past", label: "Прошедшие" },
];

const PAST_DAYS = 3; // матчи старше этого числа дней → вкладка «Прошедшие»

// Заголовок дня: Сегодня / Завтра / Вчера / «17 июня, пн».
function dayLabel(d: Date): string {
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Завтра";
  if (diff === -1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", weekday: "short" });
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filter: Filter = (TABS.find((t) => t.key === f)?.key ?? "all") as Filter;
  const user = await getCurrentUser();

  // Граница «прошедшего»: старше PAST_DAYS дней назад.
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - PAST_DAYS);

  const where: Prisma.MatchWhereInput = {};
  if (filter === "group") where.stage = "group";
  if (filter === "knockout") where.stage = { not: "group" };
  if (filter === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    where.OR = [{ matchDate: { gte: start, lte: end } }, { status: "live" }];
  }
  // Прошедшие — отдельно; остальные вкладки прячут старьё.
  if (filter === "past") where.matchDate = { lt: cutoff };
  else if (filter !== "today") where.matchDate = { gte: cutoff };

  const matches = await db.match.findMany({
    where,
    orderBy: { matchDate: filter === "past" ? "desc" : "asc" },
  });

  const summaries = user
    ? await getMatchPickSummaries(user.id, matches.map((m) => m.id))
    : new Map();

  const cards: MatchCardData[] = matches.map((m) => ({
    ...m,
    myPrediction: summaries.get(m.id) ?? null,
  }));

  // Группировка по дням (порядок дней сохраняем как в выборке).
  const groups: { key: string; label: string; items: MatchCardData[] }[] = [];
  for (const m of cards) {
    const d = new Date(m.matchDate);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      g = { key, label: dayLabel(d), items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <h1 className="text-xl font-bold">Матчи</h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/matches?f=${t.key}`}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap border ${
              filter === t.key
                ? "bg-surface-2 border-border text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          {filter === "past" ? "Прошедших матчей пока нет." : "Нет матчей в этом фильтре."}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <h2 className="text-xs font-semibold text-muted uppercase tracking-wide sticky top-14 bg-background/90 backdrop-blur py-1 z-10">
                {g.label}
                <span className="text-muted/60 font-normal"> · {g.items.length}</span>
              </h2>
              {g.items.map((m) => (
                <MatchCard key={m.id} m={m} />
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
