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
} from "@/lib/espn";
import { recomputeAllPoints } from "@/lib/recompute";

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
