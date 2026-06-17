// Лига по турам: мини-лидерборд очков в рамках одного тура. Read-only агрегация
// поверх MarketPick (как lib/vibes.ts / lib/breakdown.ts).
import { db } from "@/lib/db";
import { roundKeyOf } from "@/lib/rounds";

export interface RoundStanding {
  userId: string;
  nickname: string;
  avatar: string | null;
  points: number;
  played: number; // сыгранных выборов
  correct: number;
  accuracy: number;
}

// Таблица одного тура: очки участников по завершённым матчам этого тура.
// Сортировка по очкам desc, топ-1 = MVP тура.
export async function getRoundStandings(roundKey: string): Promise<RoundStanding[]> {
  const picks = await db.marketPick.findMany({
    where: { match: { status: "finished" } },
    select: {
      userId: true,
      pointsEarned: true,
      user: { select: { nickname: true, avatar: true } },
      match: { select: { stage: true, matchDate: true } },
    },
  });

  const agg = new Map<string, RoundStanding>();
  for (const p of picks) {
    if (roundKeyOf(p.match) !== roundKey) continue;
    let r = agg.get(p.userId);
    if (!r) {
      r = {
        userId: p.userId,
        nickname: p.user.nickname,
        avatar: p.user.avatar,
        points: 0,
        played: 0,
        correct: 0,
        accuracy: 0,
      };
      agg.set(p.userId, r);
    }
    r.points += p.pointsEarned;
    r.played++;
    if (p.pointsEarned > 0) r.correct++;
  }

  const rows = [...agg.values()];
  for (const r of rows) r.accuracy = r.played ? Math.round((r.correct / r.played) * 100) : 0;
  rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.nickname.localeCompare(b.nickname));
  return rows;
}
