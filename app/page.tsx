import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { MatchCard, type MatchCardData } from "@/components/MatchCard";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";
import { getMatchPickSummaries } from "@/lib/breakdown";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  const now = new Date();
  const dayEnd = new Date(now);
  dayEnd.setHours(23, 59, 59, 999);

  const [liveOrToday, top, nextOpen] = await Promise.all([
    db.match.findMany({
      where: {
        OR: [
          { status: "live" },
          {
            status: "scheduled",
            matchDate: { lte: dayEnd, gte: new Date(now.getTime() - 3 * 3600_000) },
          },
          {
            status: "finished",
            matchDate: { gte: new Date(now.getTime() - 24 * 3600_000) },
          },
        ],
      },
      orderBy: { matchDate: "asc" },
      take: 8,
    }),
    db.user.findMany({ orderBy: { totalPoints: "desc" }, take: 3 }),
    db.match.findFirst({
      where: { status: "scheduled", matchDate: { gt: now } },
      orderBy: { matchDate: "asc" },
    }),
  ]);

  const summaries = user
    ? await getMatchPickSummaries(user.id, liveOrToday.map((m) => m.id))
    : new Map();

  const cards: MatchCardData[] = liveOrToday.map((m) => ({
    ...m,
    myPrediction: summaries.get(m.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <AutoRefresh seconds={60} />

      {!user && (
        <div className="rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="font-semibold">Привет! Это прогнозы на ЧМ-2026 для своих.</p>
          <p className="text-sm text-muted mt-1">
            Войди по инвайт-коду, выбери ник — и делай прогнозы.
          </p>
          <Link
            href="/join"
            className="inline-block mt-3 bg-accent text-background font-semibold px-4 py-2 rounded-lg text-sm"
          >
            Войти по инвайту
          </Link>
        </div>
      )}

      {nextOpen && user && (
        <Link
          href={`/predict/${nextOpen.id}`}
          className="block rounded-xl border border-accent/40 bg-gradient-to-r from-accent/15 to-transparent p-4"
        >
          <div className="text-xs text-accent font-semibold mb-1">БЛИЖАЙШИЙ МАТЧ</div>
          <div className="font-semibold">
            {nextOpen.homeTeam} — {nextOpen.awayTeam}
          </div>
          <div className="text-sm text-muted mt-0.5">Сделать прогноз →</div>
        </Link>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">Сегодня и сейчас</h2>
        {cards.length === 0 ? (
          <Empty text="Пока нет матчей на сегодня." />
        ) : (
          <div className="space-y-2">
            {cards.map((m) => (
              <MatchCard key={m.id} m={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-muted">Топ-3</h2>
          <Link href="/leaderboard" className="text-xs text-accent-2">
            весь лидерборд →
          </Link>
        </div>
        {top.length === 0 ? (
          <Empty text="Пока никто не набрал очков." />
        ) : (
          <div className="space-y-2">
            {top.map((u, i) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3"
              >
                <span className="text-lg w-6 text-center">{["🥇", "🥈", "🥉"][i]}</span>
                <Avatar avatar={u.avatar} />
                <span className="font-medium flex-1 truncate">{u.nickname}</span>
                <span className="font-mono font-bold text-accent">{u.totalPoints}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
      {text}
    </div>
  );
}
