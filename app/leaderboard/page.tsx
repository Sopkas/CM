import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { Avatar } from "@/components/Avatar";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const me = await getCurrentUser();

  const users = await db.user.findMany({
    orderBy: [{ totalPoints: "desc" }, { nickname: "asc" }],
    include: {
      marketPicks: {
        where: { match: { status: "finished" } },
        select: { pointsEarned: true },
      },
    },
  });

  const rows = users.map((u) => {
    const scored = u.marketPicks.length;
    const correct = u.marketPicks.filter((p) => p.pointsEarned > 0).length;
    const accuracy = scored > 0 ? Math.round((correct / scored) * 100) : 0;
    return {
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar,
      points: u.totalPoints,
      played: scored,
      accuracy,
    };
  });

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <h1 className="text-xl font-bold">🏆 Лидерборд</h1>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Пока нет участников.
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-[2rem_1fr_4rem_3rem] sm:grid-cols-[2.5rem_1fr_5rem_4rem] gap-2 px-3 py-2 text-xs text-muted bg-surface-2">
            <span>#</span>
            <span>Участник</span>
            <span className="text-right">Очки</span>
            <span className="text-right">Точн.</span>
          </div>
          {rows.map((r, i) => {
            const isMe = me?.id === r.id;
            return (
              <Link
                key={r.id}
                href={isMe ? "/me" : `/u/${r.id}`}
                className={`grid grid-cols-[2rem_1fr_4rem_3rem] sm:grid-cols-[2.5rem_1fr_5rem_4rem] gap-2 px-3 py-2.5 items-center border-t border-border transition hover:bg-surface-2/50 ${
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
                </span>
                <span className="text-right font-mono font-bold text-accent">
                  {r.points}
                </span>
                <span className="text-right text-sm text-muted">{r.accuracy}%</span>
              </Link>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        Точность = доля матчей с очками от сыгранных. Обновляется автоматически.
      </p>
    </div>
  );
}
