import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getBreakdown } from "@/lib/breakdown";
import { Avatar } from "@/components/Avatar";
import { CompareSelect } from "./CompareSelect";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { a, b } = await searchParams;
  const me = await getCurrentUser();

  const users = await db.user.findMany({
    select: { id: true, nickname: true, avatar: true },
    orderBy: { nickname: "asc" },
  });

  const aId = a ?? me?.id ?? users[0]?.id ?? null;
  const bId = b ?? users.find((u) => u.id !== aId)?.id ?? null;

  if (!aId || !bId || aId === bId) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">⚔️ Сравнение</h1>
        <p className="text-sm text-muted">Нужно минимум два участника.</p>
      </div>
    );
  }

  const [ua, ub, ba, bb] = await Promise.all([
    db.user.findUnique({ where: { id: aId } }),
    db.user.findUnique({ where: { id: bId } }),
    getBreakdown(aId),
    getBreakdown(bId),
  ]);
  if (!ua || !ub) return null;

  // Head-to-head: суммарные очки по матчу (по всем рынкам), общие завершённые матчи.
  const [predsA, predsB] = await Promise.all([
    db.marketPick.groupBy({
      by: ["matchId"],
      where: { userId: aId, match: { status: "finished" } },
      _sum: { pointsEarned: true },
    }),
    db.marketPick.groupBy({
      by: ["matchId"],
      where: { userId: bId, match: { status: "finished" } },
      _sum: { pointsEarned: true },
    }),
  ]);
  const bMap = new Map(predsB.map((p) => [p.matchId, p._sum.pointsEarned ?? 0]));
  let winsA = 0;
  let winsB = 0;
  let ties = 0;
  for (const p of predsA) {
    if (!bMap.has(p.matchId)) continue;
    const pa = p._sum.pointsEarned ?? 0;
    const pb = bMap.get(p.matchId)!;
    if (pa > pb) winsA++;
    else if (pa < pb) winsB++;
    else ties++;
  }

  const rows: { label: string; a: number; b: number }[] = [
    { label: "Матчи", a: ba.matches, b: bb.matches },
    { label: "Группы", a: ba.groups, b: bb.groups },
    { label: "Сетка", a: ba.bracket, b: bb.bracket },
    { label: "Бонусы", a: ba.bonus, b: bb.bonus },
    { label: "Точных счётов", a: ba.exactScores, b: bb.exactScores },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">⚔️ Сравнение</h1>

      {/* Селекторы */}
      <div className="grid grid-cols-2 gap-2">
        <CompareSelect users={users} value={aId} param="a" />
        <CompareSelect users={users} value={bId} param="b" />
      </div>

      {/* Заголовки */}
      <div className="grid grid-cols-3 items-center text-center">
        <Head u={ua} pts={ba.total} />
        <span className="text-muted text-sm">vs</span>
        <Head u={ub} pts={bb.total} />
      </div>

      {/* Очки по категориям */}
      <div className="rounded-xl border border-border overflow-hidden">
        {rows.map((r) => (
          <div
            key={r.label}
            className="grid grid-cols-3 items-center px-3 py-2 border-t border-border first:border-t-0 text-sm"
          >
            <span className={`text-right font-mono font-semibold ${r.a > r.b ? "text-accent" : ""}`}>
              {r.a}
            </span>
            <span className="text-center text-xs text-muted">{r.label}</span>
            <span className={`text-left font-mono font-semibold ${r.b > r.a ? "text-accent" : ""}`}>
              {r.b}
            </span>
          </div>
        ))}
      </div>

      {/* Head-to-head */}
      <div className="rounded-xl border border-border bg-surface p-4 text-center">
        <h2 className="text-sm font-semibold text-muted mb-2">
          Очные прогнозы (общие матчи)
        </h2>
        <div className="flex items-center justify-center gap-4 text-lg font-bold">
          <span className="text-accent">{winsA}</span>
          <span className="text-muted text-sm">— {ties} —</span>
          <span className="text-accent">{winsB}</span>
        </div>
        <p className="text-xs text-muted mt-1">
          у кого больше очков за конкретный матч
        </p>
      </div>
    </div>
  );
}

function Head({
  u,
  pts,
}: {
  u: { nickname: string; avatar: string | null };
  pts: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar avatar={u.avatar} size={40} />
      <span className="font-semibold text-sm truncate max-w-full">{u.nickname}</span>
      <span className="font-mono font-bold text-accent">{pts}</span>
    </div>
  );
}

