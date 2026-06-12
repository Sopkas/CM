// Вспомогательные выборки по турниру: дедлайны, списки команд.
import { db } from "@/lib/db";
import { deadlineFor } from "@/lib/deadline";

// Старт турнира = самый ранний матч. Дедлайн бонусов — за 15 мин до него.
export async function tournamentDeadline(): Promise<Date | null> {
  const first = await db.match.findFirst({ orderBy: { matchDate: "asc" } });
  return first ? deadlineFor(first.matchDate) : null;
}

// Дедлайн прогноза на группу — за 15 мин до первого матча этой группы.
export async function groupDeadline(group: string): Promise<Date | null> {
  const first = await db.match.findFirst({
    where: { stage: "group", group },
    orderBy: { matchDate: "asc" },
  });
  return first ? deadlineFor(first.matchDate) : null;
}

// Команды по группам (по матчам).
export async function getGroupTeams(): Promise<Map<string, string[]>> {
  const matches = await db.match.findMany({
    where: { stage: "group", group: { not: null } },
    select: { group: true, homeTeam: true, awayTeam: true },
  });
  const map = new Map<string, Set<string>>();
  for (const m of matches) {
    const g = m.group!;
    if (!map.has(g)) map.set(g, new Set());
    map.get(g)!.add(m.homeTeam);
    map.get(g)!.add(m.awayTeam);
  }
  return new Map(
    [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([g, set]) => [g, [...set].sort()]),
  );
}

// Все команды турнира (для прогноза на чемпиона).
export async function getAllTeams(): Promise<string[]> {
  const matches = await db.match.findMany({
    select: { homeTeam: true, awayTeam: true },
  });
  const set = new Set<string>();
  for (const m of matches) {
    if (m.homeTeam !== "TBD") set.add(m.homeTeam);
    if (m.awayTeam !== "TBD") set.add(m.awayTeam);
  }
  return [...set].sort();
}
