// Синхронизация матчей + статистики + начисление очков.
// Источник по умолчанию — ESPN (бесплатно). Опциональный worldcup2026 — если задан WC_API_BASE_URL.

import { db } from "@/lib/db";
import type { NormalizedMatch } from "@/lib/api-client";
import { fetchAllMatches, isApiConfigured } from "@/lib/api-client";
import {
  fetchAllEspnMatches,
  fetchTodayEspnMatches,
  fetchEspnMatchStats,
  fetchEspnMatchHt,
  fetchEspnMatchOdds,
} from "@/lib/espn";
import { americanToProb, devig, buildModel, coefForPick } from "@/lib/odds";
import { recomputeAllPoints } from "@/lib/recompute";

// Кэфы для ближайших запланированных матчей (окно 72ч, ≤12 за прогон, рефреш ~2ч).
async function syncUpcomingOdds(): Promise<number> {
  const now = Date.now();
  const soon = new Date(now + 72 * 3600_000);
  const matches = await db.match.findMany({
    where: {
      status: "scheduled",
      matchDate: { lte: soon, gte: new Date(now - 3600_000) },
      externalId: { startsWith: "espn:" },
    },
    orderBy: { matchDate: "asc" },
  });
  let n = 0;
  for (const m of matches) {
    if (n >= 12) break;
    if (m.oddsUpdatedAt && now - m.oddsUpdatedAt.getTime() < 2 * 3600_000) continue;
    try {
      const o = await fetchEspnMatchOdds(m.externalId);
      const data: Record<string, unknown> = { oddsUpdatedAt: new Date() };
      if (o) {
        const dv = devig(
          americanToProb(o.homeMl),
          americanToProb(o.drawMl),
          americanToProb(o.awayMl),
        );
        data.pHome = dv.pHome;
        data.pDraw = dv.pDraw;
        data.pAway = dv.pAway;
        data.goalLine = o.goalLine;
        // де-виг over/under для калибровки μ
        if (o.overOdds != null && o.underOdds != null) {
          const over = americanToProb(o.overOdds);
          const under = americanToProb(o.underOdds);
          data.pOver = over / (over + under || 1);
        }
        n++;
      }
      await db.match.update({ where: { id: m.id }, data });
    } catch {
      // пропускаем сбойный матч
    }
  }
  return n;
}

// Backfill: проставить кэф уже сделанным ставкам несыгранных матчей, у которых
// кэфы уже подтянулись, а у ставки coef ещё нет. Независимо от троттлинга кэфов.
async function backfillCoefs(): Promise<number> {
  const picks = await db.marketPick.findMany({
    where: { coef: null, match: { status: "scheduled", pHome: { not: null } } },
    select: {
      id: true,
      market: true,
      selection: true,
      match: { select: { pHome: true, pDraw: true, pAway: true, goalLine: true, pOver: true } },
    },
  });
  let n = 0;
  for (const pk of picks) {
    const mm = pk.match;
    if (mm.pHome == null || mm.pDraw == null || mm.pAway == null || mm.goalLine == null) continue;
    const model = buildModel({
      pHome: mm.pHome, pDraw: mm.pDraw, pAway: mm.pAway,
      goalLine: mm.goalLine, pOver: mm.pOver ?? undefined,
    });
    const c = coefForPick(pk.market, pk.selection, model);
    if (c != null) {
      await db.marketPick.update({ where: { id: pk.id }, data: { coef: c } });
      n++;
    }
  }
  return n;
}

export interface SyncResult {
  source: "espn" | "worldcup2026";
  upserted: number;
  statsUpdated: number;
}

async function upsertMatch(m: NormalizedMatch): Promise<void> {
  await db.match.upsert({
    where: { externalId: m.externalId },
    // не затираем известные имена команд значением "TBD"
    update: {
      homeTeam: m.homeTeam === "TBD" ? undefined : m.homeTeam,
      awayTeam: m.awayTeam === "TBD" ? undefined : m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      minute: m.minute,
      stage: m.stage,
      group: m.group,
      matchDate: m.matchDate,
      venue: m.venue,
      round: m.round,
    },
    create: {
      externalId: m.externalId,
      homeTeam: m.homeTeam,
      awayTeam: m.awayTeam,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      status: m.status,
      minute: m.minute,
      stage: m.stage,
      group: m.group,
      matchDate: m.matchDate,
      venue: m.venue,
      round: m.round,
    },
  });
}

// Подтягивает статистику ESPN для нужных матчей (live + недавно завершённые без свежей статы).
async function pullStats(externalIds: string[]): Promise<number> {
  let updated = 0;
  for (const ext of externalIds) {
    if (!ext.startsWith("espn:")) continue;
    try {
      const [stats, ht] = await Promise.all([
        fetchEspnMatchStats(ext).catch(() => null),
        fetchEspnMatchHt(ext).catch(() => null),
      ]);
      const data: Record<string, unknown> = {};
      if (stats) {
        data.stats = stats as unknown as object;
        data.statsUpdatedAt = new Date();
      }
      if (ht) {
        data.homeHt = ht.home;
        data.awayHt = ht.away;
      }
      if (Object.keys(data).length > 0) {
        await db.match.update({ where: { externalId: ext }, data });
        updated++;
      }
    } catch {
      // пропускаем сбойный матч
    }
  }
  return updated;
}

// Регулярный синк: сегодняшние матчи + статистика их live/finished.
export async function runSync(): Promise<SyncResult> {
  const useWorldcup = isApiConfigured();
  const matches = useWorldcup ? await fetchAllMatches() : await fetchTodayEspnMatches();
  for (const m of matches) await upsertMatch(m);

  // статистика — для live и завершённых сегодняшних матчей (ESPN)
  const needStats = matches
    .filter((m) => m.status !== "scheduled")
    .map((m) => m.externalId);
  const statsUpdated = useWorldcup ? 0 : await pullStats(needStats);

  await syncUpcomingOdds().catch(() => 0);
  await backfillCoefs().catch(() => 0);
  await recomputeAllPoints();
  return {
    source: useWorldcup ? "worldcup2026" : "espn",
    upserted: matches.length,
    statsUpdated,
  };
}

// Полный импорт всех 104 матчей из ESPN (admin-действие) + статистика завершённых.
export async function importAllFromEspn(): Promise<SyncResult> {
  const matches = await fetchAllEspnMatches();
  for (const m of matches) await upsertMatch(m);

  const finished = matches
    .filter((m) => m.status === "finished")
    .map((m) => m.externalId);
  const statsUpdated = await pullStats(finished);

  await recomputeAllPoints();
  return { source: "espn", upserted: matches.length, statsUpdated };
}
