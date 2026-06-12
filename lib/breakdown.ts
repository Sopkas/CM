// Разбивка очков пользователя по источникам (для профиля и сравнения).
import { db } from "@/lib/db";

export interface MatchPickSummary {
  count: number;
  outcome: string | null; // выбор по рынку 'outcome', если есть
  points: number;
}

// Сводка рыночных прогнозов пользователя по списку матчей (для карточек).
export async function getMatchPickSummaries(
  userId: string,
  matchIds: string[],
): Promise<Map<string, MatchPickSummary>> {
  const map = new Map<string, MatchPickSummary>();
  if (matchIds.length === 0) return map;
  const picks = await db.marketPick.findMany({
    where: { userId, matchId: { in: matchIds } },
  });
  for (const p of picks) {
    let e = map.get(p.matchId);
    if (!e) {
      e = { count: 0, outcome: null, points: 0 };
      map.set(p.matchId, e);
    }
    e.count++;
    e.points += p.pointsEarned;
    if (p.market === "outcome") e.outcome = p.selection;
  }
  return map;
}

export interface PointsBreakdown {
  matches: number; // очки за рыночные прогнозы
  groups: number;
  bracket: number;
  bonus: number;
  total: number;
  picksPlayed: number; // разобранных рыночных выборов
  picksCorrect: number;
  exactScores: number; // верных «точный счёт»
}

export async function getBreakdown(userId: string): Promise<PointsBreakdown> {
  const [picks, groupPicks, koPicks, bonus] = await Promise.all([
    db.marketPick.findMany({
      where: { userId },
      select: {
        market: true,
        pointsEarned: true,
        match: { select: { status: true } },
      },
    }),
    db.groupPick.findMany({ where: { userId } }),
    db.knockoutPick.findMany({ where: { userId } }),
    db.bonusPrediction.findMany({ where: { userId } }),
  ]);

  const resolved = picks.filter((p) => p.match.status === "finished");
  const matches = resolved.reduce((s, p) => s + p.pointsEarned, 0);
  const groups = groupPicks.reduce((s, g) => s + g.winnerPoints + g.qualifiersPoints, 0);
  const bracket = koPicks.reduce((s, k) => s + k.pointsEarned, 0);
  const bonusPts = bonus.reduce((s, b) => s + b.pointsEarned, 0);

  return {
    matches,
    groups,
    bracket,
    bonus: bonusPts,
    total: matches + groups + bracket + bonusPts,
    picksPlayed: resolved.length,
    picksCorrect: resolved.filter((p) => p.pointsEarned > 0).length,
    exactScores: resolved.filter((p) => p.market === "exact_score" && p.pointsEarned > 0).length,
  };
}

// ─── Расширенный дашборд участника ──────────────────────────────────────────

export interface MarketAccuracy {
  market: string;
  played: number;
  correct: number;
  points: number;
}
export interface FormMatch {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  date: Date;
  count: number; // сколько рынков сыграно в матче
  points: number;
  hit: boolean; // взял ли хоть какие-то очки
}
export interface Dashboard {
  user: {
    id: string;
    nickname: string;
    avatar: string | null;
    totalPoints: number;
    isAdmin: boolean;
  };
  rank: number;
  total: number;
  bySource: { matches: number; groups: number; bracket: number; bonus: number };
  picksPlayed: number;
  picksCorrect: number;
  accuracy: number;
  exactScores: number;
  byMarket: MarketAccuracy[]; // по убыванию сыгранных
  recent: FormMatch[]; // последние завершённые матчи, новые первыми
  bestMatch: { homeTeam: string; awayTeam: string; points: number } | null;
  outcomeBias: { home: number; draw: number; away: number };
  favoriteMarket: string | null;
}

export async function getDashboard(userId: string): Promise<Dashboard | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  const [picks, groupPicks, koPicks, bonus, ahead] = await Promise.all([
    db.marketPick.findMany({
      where: { userId },
      select: {
        market: true,
        selection: true,
        pointsEarned: true,
        matchId: true,
        match: {
          select: { status: true, homeTeam: true, awayTeam: true, matchDate: true },
        },
      },
    }),
    db.groupPick.findMany({ where: { userId } }),
    db.knockoutPick.findMany({ where: { userId } }),
    db.bonusPrediction.findMany({ where: { userId } }),
    db.user.count({ where: { totalPoints: { gt: user.totalPoints } } }),
  ]);

  const resolved = picks.filter((p) => p.match.status === "finished");
  const matches = resolved.reduce((s, p) => s + p.pointsEarned, 0);
  const groups = groupPicks.reduce((s, g) => s + g.winnerPoints + g.qualifiersPoints, 0);
  const bracket = koPicks.reduce((s, k) => s + k.pointsEarned, 0);
  const bonusPts = bonus.reduce((s, b) => s + b.pointsEarned, 0);

  // точность по рынкам
  const marketMap = new Map<string, MarketAccuracy>();
  for (const p of resolved) {
    let e = marketMap.get(p.market);
    if (!e) {
      e = { market: p.market, played: 0, correct: 0, points: 0 };
      marketMap.set(p.market, e);
    }
    e.played++;
    e.points += p.pointsEarned;
    if (p.pointsEarned > 0) e.correct++;
  }
  const byMarket = [...marketMap.values()].sort((a, b) => b.played - a.played);

  // любимый рынок — по частоте всех выборов (не только завершённых)
  const usage = new Map<string, number>();
  for (const p of picks) usage.set(p.market, (usage.get(p.market) ?? 0) + 1);
  const favoriteMarket =
    [...usage.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // форма по завершённым матчам
  const fm = new Map<string, FormMatch>();
  for (const p of resolved) {
    let e = fm.get(p.matchId);
    if (!e) {
      e = {
        matchId: p.matchId,
        homeTeam: p.match.homeTeam,
        awayTeam: p.match.awayTeam,
        date: p.match.matchDate,
        count: 0,
        points: 0,
        hit: false,
      };
      fm.set(p.matchId, e);
    }
    e.count++;
    e.points += p.pointsEarned;
    if (p.pointsEarned > 0) e.hit = true;
  }
  const byDate = [...fm.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
  const recent = byDate.slice(0, 10);
  const bestMatch = fm.size
    ? [...fm.values()].reduce((best, m) => (m.points > best.points ? m : best))
    : null;

  // предпочтение по исходу
  const outcomeBias = { home: 0, draw: 0, away: 0 };
  for (const p of picks) {
    if (p.market !== "outcome") continue;
    if (p.selection === "home") outcomeBias.home++;
    else if (p.selection === "draw") outcomeBias.draw++;
    else if (p.selection === "away") outcomeBias.away++;
  }

  const picksPlayed = resolved.length;
  const picksCorrect = resolved.filter((p) => p.pointsEarned > 0).length;

  return {
    user: {
      id: user.id,
      nickname: user.nickname,
      avatar: user.avatar,
      totalPoints: user.totalPoints,
      isAdmin: user.isAdmin,
    },
    rank: ahead + 1,
    total: matches + groups + bracket + bonusPts,
    bySource: { matches, groups, bracket, bonus: bonusPts },
    picksPlayed,
    picksCorrect,
    accuracy: picksPlayed ? Math.round((picksCorrect / picksPlayed) * 100) : 0,
    exactScores: resolved.filter(
      (p) => p.market === "exact_score" && p.pointsEarned > 0,
    ).length,
    byMarket,
    recent,
    bestMatch: bestMatch
      ? { homeTeam: bestMatch.homeTeam, awayTeam: bestMatch.awayTeam, points: bestMatch.points }
      : null,
    outcomeBias,
    favoriteMarket,
  };
}
