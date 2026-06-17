import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";
import { VibeBadges } from "@/components/VibeBadges";
import { getVibes } from "@/lib/vibes";
import { getBankStats } from "@/lib/bankroll";

export const dynamic = "force-dynamic";

const fmtMoney = (n: number) => Math.round(n).toLocaleString("ru-RU");

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const view = v === "bank" ? "bank" : "points";
  const me = await getCurrentUser();

  const [users, vibes, bankStats] = await Promise.all([
    db.user.findMany({
      orderBy:
        view === "bank"
          ? [{ bankroll: "desc" }, { nickname: "asc" }]
          : [{ totalPoints: "desc" }, { nickname: "asc" }],
      include: {
        marketPicks: {
          where: { match: { status: "finished" } },
          select: { pointsEarned: true },
        },
      },
    }),
    getVibes(),
    view === "bank" ? getBankStats() : Promise.resolve(null),
  ]);

  const rows = users.map((u) => {
    const scored = u.marketPicks.length;
    const correct = u.marketPicks.filter((p) => p.pointsEarned > 0).length;
    const accuracy = scored > 0 ? Math.round((correct / scored) * 100) : 0;
    const bank = bankStats?.get(u.id) ?? null;
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      points: u.totalPoints,
      bankroll: u.bankroll,
      roi: bank?.roi ?? null,
      played: scored,
      accuracy,
    };
  });

  const grid =
    view === "bank"
      ? "grid-cols-[2rem_1fr_5rem_3.5rem] sm:grid-cols-[2.5rem_1fr_6rem_4.5rem]"
      : "grid-cols-[2rem_1fr_4rem_3rem] sm:grid-cols-[2.5rem_1fr_5rem_4rem]";

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <h1 className="text-xl font-bold">🏆 Лидерборд</h1>

      <div className="flex gap-2">
        {[
          { key: "points", label: "Очки" },
          { key: "bank", label: "💰 Банк" },
        ].map((t) => (
          <Link
            key={t.key}
            href={`/leaderboard${t.key === "bank" ? "?v=bank" : ""}`}
            className={`px-3 py-1.5 rounded-lg text-sm border ${
              view === t.key
                ? "bg-surface-2 border-border text-foreground"
                : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Пока нет участников.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className={`grid ${grid} gap-2 px-3 py-2 text-xs text-muted bg-surface-2`}>
            <span>#</span>
            <span>Участник</span>
            <span className="text-right">{view === "bank" ? "Банк" : "Очки"}</span>
            <span className="text-right">{view === "bank" ? "ROI" : "Точн."}</span>
          </div>
          {rows.map((r, i) => {
            const isMe = me?.id === r.id;
            return (
              <Link
                key={r.id}
                href={isMe ? "/me" : `/u/${r.id}`}
                className={`grid ${grid} gap-2 px-3 py-2.5 items-center border-t border-border transition hover:bg-surface-2/50 ${
                  isMe ? "bg-accent/10" : "bg-surface"
                }`}
              >
                <span className="font-mono text-muted">
                  {["🥇", "🥈", "🥉"][i] ?? i + 1}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  <Avatar avatar={r.avatar} />
                  <span className="font-medium truncate">{r.nickname}</span>
                  {isMe && <span className="text-[10px] text-accent">ты</span>}
                  <VibeBadges vibe={vibes.get(r.id)} />
                </span>
                {view === "bank" ? (
                  <>
                    <span className="text-right font-mono font-bold text-accent">
                      {fmtMoney(r.bankroll)}
                    </span>
                    <span
                      className={`text-right text-sm font-mono ${
                        r.roi == null ? "text-muted" : r.roi >= 0 ? "text-accent" : "text-danger"
                      }`}
                    >
                      {r.roi == null ? "—" : `${r.roi > 0 ? "+" : ""}${r.roi}%`}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-right font-mono font-bold text-accent">{r.points}</span>
                    <span className="text-right text-sm text-muted">{r.accuracy}%</span>
                  </>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        {view === "bank"
          ? "Банк — виртуальные фантики (старт 1000). ROI = профит / поставлено по сыгранным купонам."
          : "Точность = доля матчей с очками от сыгранных. Обновляется автоматически."}
      </p>
    </div>
  );
}
