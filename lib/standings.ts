// Вычисление таблиц групп из матчей (PRD §3.4 — живые таблицы групп).
// Считаем только по матчам со статусом live/finished, у которых есть счёт.

import type { Match } from "@prisma/client";

export interface TeamRow {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
}

export function computeGroupTable(matches: Match[]): TeamRow[] {
  const rows = new Map<string, TeamRow>();

  const row = (team: string): TeamRow => {
    let r = rows.get(team);
    if (!r) {
      r = {
        team,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        gf: 0,
        ga: 0,
        gd: 0,
        points: 0,
      };
      rows.set(team, r);
    }
    return r;
  };

  for (const m of matches) {
    // регистрируем команды даже без сыгранных матчей
    row(m.homeTeam);
    row(m.awayTeam);
    if (
      m.homeScore == null ||
      m.awayScore == null ||
      (m.status !== "finished" && m.status !== "live")
    ) {
      continue;
    }
    const h = row(m.homeTeam);
    const a = row(m.awayTeam);
    h.played++;
    a.played++;
    h.gf += m.homeScore;
    h.ga += m.awayScore;
    a.gf += m.awayScore;
    a.ga += m.homeScore;
    if (m.homeScore > m.awayScore) {
      h.won++;
      a.lost++;
      h.points += 3;
    } else if (m.homeScore < m.awayScore) {
      a.won++;
      h.lost++;
      a.points += 3;
    } else {
      h.drawn++;
      a.drawn++;
      h.points++;
      a.points++;
    }
  }

  const list = [...rows.values()];
  for (const r of list) r.gd = r.gf - r.ga;
  list.sort(
    (x, y) =>
      y.points - x.points || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team),
  );
  return list;
}
