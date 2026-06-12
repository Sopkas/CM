import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getMatchPickSummaries } from "@/lib/breakdown";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

type Filter = "today" | "group" | "knockout" | "all";
const TABS: { key: Filter; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "group", label: "Группы" },
  { key: "knockout", label: "Плей-офф" },
  { key: "all", label: "Все" },
];

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string }>;
}) {
  const { f } = await searchParams;
  const filter: Filter = (TABS.find((t) => t.key === f)?.key ?? "all") as Filter;
  const user = await getCurrentUser();

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

  const matches = await db.match.findMany({
    where,
    orderBy: { matchDate: "asc" },
  });

  const summaries = user
    ? await getMatchPickSummaries(user.id, matches.map((m) => m.id))
    : new Map();

  const cards: MatchCardData[] = matches.map((m) => ({
    ...m,
    myPrediction: summaries.get(m.id) ?? null,
  }));

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

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Нет матчей в этом фильтре. Запусти синк или добавь данные.
        </div>
      ) : (
        <div className="space-y-2">
          {cards.map((m) => (
            <MatchCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  );
}
