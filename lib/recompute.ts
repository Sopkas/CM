// Полный идемпотентный пересчёт очков из всех источников (PRD §3.5).
// Для ≤20 участников дешевле и надёжнее дельт: считаем всё заново.
// Источники: прогнозы на матчи, выход из групп, сетка плей-офф, бонусы.

import type { Match } from "@prisma/client";
import { db } from "@/lib/db";
import {
  scoreGroupPick,
  scoreKnockoutPick,
  matchWinner,
  SCORING,
} from "@/lib/scoring";
import { scoreMarketPick } from "@/lib/markets";
import { computeGroupTable } from "@/lib/standings";

const SETTINGS = {
  champion: "actualChampion",
  topScorer: "actualTopScorer",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const s = await db.setting.findUnique({ where: { key } });
  return s?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export async function recomputeAllPoints(): Promise<void> {
  const [matches, marketPicks, groupPicks, knockoutPicks, bonusPicks, settings] =
    await Promise.all([
      db.match.findMany(),
      db.marketPick.findMany(),
      db.groupPick.findMany(),
      db.knockoutPick.findMany(),
      db.bonusPrediction.findMany(),
      db.setting.findMany(),
    ]);

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const settingMap = new Map(settings.map((s) => [s.key, s.value]));

  // Итоговые таблицы только полностью сыгранных групп.
  const groupActual = computeFinishedGroupResults(matches);

  const totals = new Map<string, number>();
  const add = (userId: string, pts: number) =>
    totals.set(userId, (totals.get(userId) ?? 0) + pts);

  // 1) Прогнозы на матчи по рынкам
  const pickUpdates: { id: string; pointsEarned: number }[] = [];
  for (const p of marketPicks) {
    const m = matchById.get(p.matchId);
    let pts = 0;
    if (m && m.status === "finished" && m.homeScore != null && m.awayScore != null) {
      pts =
        scoreMarketPick(
          p.market,
          p.selection,
          {
            homeScore: m.homeScore,
            awayScore: m.awayScore,
            htHome: m.homeHt ?? null,
            htAway: m.awayHt ?? null,
            stats: (m.stats as { home: Record<string, string>; away: Record<string, string> } | null) ?? null,
          },
          p.coef ?? null,
        ) * (p.stake ?? 1);
    }
    add(p.userId, pts);
    if (pts !== p.pointsEarned) {
      pickUpdates.push({ id: p.id, pointsEarned: pts });
    }
  }

  // 2) Выход из групп
  const groupUpdates: { id: string; winnerPoints: number; qualifiersPoints: number }[] = [];
  for (const gp of groupPicks) {
    const actual = groupActual.get(gp.group);
    let winnerPoints = 0;
    let qualifiersPoints = 0;
    if (actual) {
      const r = scoreGroupPick(gp.firstTeam, gp.secondTeam, actual.first, actual.second);
      winnerPoints = r.winnerPoints;
      qualifiersPoints = r.qualifiersPoints;
    }
    add(gp.userId, winnerPoints + qualifiersPoints);
    if (winnerPoints !== gp.winnerPoints || qualifiersPoints !== gp.qualifiersPoints) {
      groupUpdates.push({ id: gp.id, winnerPoints, qualifiersPoints });
    }
  }

  // 3) Сетка плей-офф
  const koUpdates: { id: string; pointsEarned: number }[] = [];
  for (const kp of knockoutPicks) {
    const m = matchById.get(kp.matchId);
    let pts = 0;
    if (m && m.status === "finished") {
      const winner = matchWinner(m.homeTeam, m.awayTeam, m.homeScore, m.awayScore);
      if (winner) pts = scoreKnockoutPick(kp.predictedTeam, winner, m.stage);
    }
    add(kp.userId, pts);
    if (pts !== kp.pointsEarned) koUpdates.push({ id: kp.id, pointsEarned: pts });
  }

  // 4) Бонусы
  const bonusUpdates: { id: string; pointsEarned: number }[] = [];
  for (const b of bonusPicks) {
    let pts = 0;
    if (b.type === "champion") {
      const actual = settingMap.get(SETTINGS.champion);
      if (actual && actual === b.value) pts = SCORING.champion;
    } else if (b.type === "top_scorer") {
      const actual = settingMap.get(SETTINGS.topScorer);
      if (actual && actual === b.value) pts = SCORING.topScorer;
    }
    add(b.userId, pts);
    if (pts !== b.pointsEarned) bonusUpdates.push({ id: b.id, pointsEarned: pts });
  }

  // Запись изменений одной транзакцией
  const users = await db.user.findMany({ select: { id: true, totalPoints: true } });
  const userUpdates = users
    .map((u) => ({ id: u.id, total: totals.get(u.id) ?? 0 }))
    .filter((u, i) => u.total !== users[i].totalPoints);

  await db.$transaction([
    ...pickUpdates.map((u) =>
      db.marketPick.update({ where: { id: u.id }, data: { pointsEarned: u.pointsEarned } }),
    ),
    ...groupUpdates.map((u) =>
      db.groupPick.update({
        where: { id: u.id },
        data: { winnerPoints: u.winnerPoints, qualifiersPoints: u.qualifiersPoints },
      }),
    ),
    ...koUpdates.map((u) =>
      db.knockoutPick.update({ where: { id: u.id }, data: { pointsEarned: u.pointsEarned } }),
    ),
    ...bonusUpdates.map((u) =>
      db.bonusPrediction.update({ where: { id: u.id }, data: { pointsEarned: u.pointsEarned } }),
    ),
    ...userUpdates.map((u) =>
      db.user.update({ where: { id: u.id }, data: { totalPoints: u.total } }),
    ),
  ]);
}

interface GroupResult {
  first: string;
  second: string;
}

// Возвращает итоги только тех групп, где ВСЕ матчи завершены.
function computeFinishedGroupResults(matches: Match[]): Map<string, GroupResult> {
  const byGroup = new Map<string, Match[]>();
  for (const m of matches) {
    if (m.stage !== "group" || !m.group) continue;
    if (!byGroup.has(m.group)) byGroup.set(m.group, []);
    byGroup.get(m.group)!.push(m);
  }
  const result = new Map<string, GroupResult>();
  for (const [g, ms] of byGroup) {
    const allDone = ms.every((m) => m.status === "finished");
    if (!allDone || ms.length === 0) continue;
    const table = computeGroupTable(ms);
    if (table.length >= 2) {
      result.set(g, { first: table[0].team, second: table[1].team });
    }
  }
  return result;
}
