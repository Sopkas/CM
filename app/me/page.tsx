import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { LogoutButton } from "./LogoutButton";
import { formatMatchDate, stageLabel } from "@/lib/format";
import { getDashboard } from "@/lib/breakdown";
import { getVibes } from "@/lib/vibes";
import { getBankStats } from "@/lib/bankroll";
import { Dashboard } from "@/components/Dashboard";

const fmtMoney = (n: number) => Math.round(n).toLocaleString("ru-RU");

export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/join");

  const [picks, dash] = await Promise.all([
    db.marketPick.findMany({
      where: { userId: user.id },
      include: { match: true },
      orderBy: { match: { matchDate: "desc" } },
    }),
    getDashboard(user.id),
  ]);
  if (!dash) redirect("/join");
  const [vibe, bankStat] = await Promise.all([
    getVibes().then((m) => m.get(user.id)),
    getBankStats().then((m) => m.get(user.id)),
  ]);

  // группируем выборы по матчу для списка «Мои прогнозы»
  const matchMap = new Map<
    string,
    { match: (typeof picks)[number]["match"]; count: number; points: number }
  >();
  for (const p of picks) {
    let e = matchMap.get(p.matchId);
    if (!e) {
      e = { match: p.match, count: 0, points: 0 };
      matchMap.set(p.matchId, e);
    }
    e.count++;
    e.points += p.pointsEarned;
  }
  const myMatches = [...matchMap.values()].sort(
    (a, b) => b.match.matchDate.getTime() - a.match.matchDate.getTime(),
  );

  return (
    <div className="space-y-5">
      <Dashboard data={dash} vibe={vibe} headerRight={<LogoutButton />} />

      {/* Виртуальный банк */}
      <Link
        href="/coupons"
        className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3"
      >
        <span className="flex items-center gap-2 font-semibold">💰 Банк</span>
        <span className="flex items-center gap-4 text-sm">
          <span className="font-mono font-bold text-accent">{fmtMoney(user.bankroll)}</span>
          <span className={`font-mono ${(bankStat?.roi ?? 0) >= 0 ? "text-accent" : "text-danger"}`}>
            {bankStat?.roi == null ? "ROI —" : `ROI ${bankStat.roi > 0 ? "+" : ""}${bankStat.roi}%`}
          </span>
          {bankStat && bankStat.pending > 0 && (
            <span className="text-xs text-muted">{bankStat.pending} в игре</span>
          )}
          <span className="text-muted">→</span>
        </span>
      </Link>

      {/* Быстрые ссылки на прогнозы */}
      <div className="grid grid-cols-2 gap-2 text-sm">
        <Link href="/tours" className="text-center bg-surface-2 rounded-lg py-2">
          🏟️ Лига по турам
        </Link>
        <Link href="/coupons" className="text-center bg-surface-2 rounded-lg py-2">
          🧾 Мои купоны
        </Link>
        <Link href="/bracket" className="text-center bg-surface-2 rounded-lg py-2">
          🗂️ Моя сетка
        </Link>
        <Link href="/groups/predict" className="text-center bg-surface-2 rounded-lg py-2">
          📊 Прогноз на группы
        </Link>
        <Link href="/bonus" className="text-center bg-surface-2 rounded-lg py-2">
          ⭐ Бонусы
        </Link>
        <Link href="/compare" className="text-center bg-surface-2 rounded-lg py-2">
          ⚔️ Сравнить
        </Link>
      </div>

      {user.isAdmin && (
        <Link
          href="/admin"
          className="block text-center text-sm bg-surface-2 rounded-lg py-2"
        >
          Открыть админ-панель →
        </Link>
      )}

      <section>
        <h2 className="text-sm font-semibold text-muted mb-2">Мои прогнозы</h2>
        {myMatches.length === 0 ? (
          <p className="text-sm text-muted">Прогнозов пока нет.</p>
        ) : (
          <div className="space-y-1.5">
            {myMatches.map((e) => (
              <Link
                key={e.match.id}
                href={`/predict/${e.match.id}`}
                className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate">
                    {e.match.homeTeam} — {e.match.awayTeam}
                  </div>
                  <div className="text-xs text-muted">
                    {stageLabel(e.match.stage, e.match.group)} ·{" "}
                    {formatMatchDate(e.match.matchDate)} · {e.count} рынк.
                  </div>
                </div>
                <StatusPill status={e.match.status} points={e.points} />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status, points }: { status: string; points: number }) {
  if (status !== "finished") {
    return <span className="text-xs text-muted">ожидает</span>;
  }
  return (
    <span
      className={`px-1.5 rounded text-xs font-semibold ${
        points > 0
          ? "bg-accent/20 text-accent"
          : points < 0
            ? "bg-danger/20 text-danger"
            : "bg-surface-2 text-muted"
      }`}
    >
      {points > 0 ? `+${points}` : points}
    </span>
  );
}
