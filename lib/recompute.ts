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
import { scoreMarketPick, OBVIOUS_COEF } from "@/lib/markets";
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
  const [matches, marketPicks, groupPicks, knockoutPicks, bonusPicks, settings, flaggedUsers] =
    await Promise.all([
      db.match.findMany(),
      db.marketPick.findMany(),
      db.groupPick.findMany(),
      db.knockoutPick.findMany(),
      db.bonusPrediction.findMany(),
      db.setting.findMany(),
      db.user.findMany({ where: { putintseva: true }, select: { id: true } }),
    ]);
  const flagged = new Set(flaggedUsers.map((u) => u.id));

  const matchById = new Map(matches.map((m) => [m.id, m]));
  const settingMap = new Map(settings.map((s) => [s.key, s.value]));

  // Итоговые таблицы только полностью сыгранных групп.
  const groupActual = computeFinishedGroupResults(matches);

  const totals = new Map<string, number>();
  const add = (userId: string, pts: number) =>
    totals.set(userId, (totals.get(userId) ?? 0) + pts);

  // 1) Прогнозы на матчи по рынкам (+ правило Путинцева для отмеченных)
  const pickUpdates: { id: string; pointsEarned: number }[] = [];
  const rows: {
    id: string; userId: string; matchId: string; date: number;
    obvious: boolean; raw: number; prev: number;
  }[] = [];
  // userId -> matchId -> { date, обнаружена ли очевидная ставка }
  const userMatch = new Map<string, Map<string, { date: number; obvious: boolean }>>();

  for (const p of marketPicks) {
    const m = matchById.get(p.matchId);
    let raw = 0;
    if (m && m.status === "finished" && m.homeScore != null && m.awayScore != null) {
      raw =
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
    const obvious = p.coef != null && p.coef < OBVIOUS_COEF;
    const date = m?.matchDate.getTime() ?? 0;
    rows.push({ id: p.id, userId: p.userId, matchId: p.matchId, date, obvious, raw, prev: p.pointsEarned });
    if (flagged.has(p.userId)) {
      let um = userMatch.get(p.userId);
      if (!um) { um = new Map(); userMatch.set(p.userId, um); }
      const cur = um.get(p.matchId) ?? { date, obvious: false };
      cur.obvious = cur.obvious || obvious;
      um.set(p.matchId, cur);
    }
  }

  // Наказанные матчи: очевидная ставка, когда и на предыдущем (по дате) bet-матче была очевидная.
  const punished = new Set<string>(); // `${userId}:${matchId}`
  for (const [userId, um] of userMatch) {
    const sorted = [...um.entries()].sort((a, b) => a[1].date - b[1].date);
    let prevObvious = false;
    for (const [matchId, info] of sorted) {
      if (info.obvious && prevObvious) punished.add(`${userId}:${matchId}`);
      prevObvious = info.obvious;
    }
  }

  for (const r of rows) {
    // у отмеченных на наказанном матче плюс обнуляется, минус остаётся.
    const pts =
      flagged.has(r.userId) && punished.has(`${r.userId}:${r.matchId}`)
        ? Math.min(0, r.raw)
        : r.raw;
    add(r.userId, pts);
    if (pts !== r.prev) pickUpdates.push({ id: r.id, pointsEarned: pts });
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
