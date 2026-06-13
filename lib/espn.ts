// Клиент к неофициальному ESPN API (бесплатно, без ключа).
// Источник реальных данных ЧМ-2026: счёт, статус, группы, стадии и статистика матча.
// site.api.espn.com — структура может меняться, парсим защитно.

import type { MatchStatus } from "@prisma/client";
import type { NormalizedMatch } from "@/lib/api-client";

const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";
const STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/fifa.world/standings";

// Статы, которые показываем (label из ESPN → они же ключи в JSON).
export const STAT_LABELS = [
  "Possession",
  "SHOTS",
  "ON GOAL",
  "Corner Kicks",
  "Fouls",
  "Offsides",
  "Yellow Cards",
  "Red Cards",
  "Saves",
  "Passes",
  "Pass Completion %",
] as const;

export type TeamStats = Record<string, string>;
export interface MatchStats {
  home: TeamStats;
  away: TeamStats;
}

function stageFromSlug(slug: string): string {
  const s = (slug || "").toLowerCase();
  if (s.includes("group")) return "group";
  if (s.includes("round-of-32")) return "R32";
  if (s.includes("round-of-16")) return "R16";
  if (s.includes("quarter")) return "QF";
  if (s.includes("semi")) return "SF";
  if (s.includes("3rd") || s.includes("third")) return "Third";
  if (s.includes("final")) return "Final";
  return "group";
}

function mapStatus(name: string): MatchStatus {
  const n = (name || "").toUpperCase();
  if (n.includes("SCHEDULED") || n.includes("PRE")) return "scheduled";
  if (n.includes("FULL_TIME") || n.includes("FINAL") || n.includes("FT") || n.includes("POST"))
    return "finished";
  return "live"; // in progress / halftime / first|second half
}

function parseMinute(clock: string, statusName: string): number | null {
  if ((statusName || "").toUpperCase().includes("HALFTIME")) return 45;
  const m = (clock || "").match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function getJson(url: string, revalidate?: number): Promise<unknown> {
  const res = await fetch(
    url,
    revalidate != null ? { next: { revalidate } } : { cache: "no-store" },
  );
  if (!res.ok) throw new Error(`ESPN GET ${url} → ${res.status}`);
  return res.json();
}

// Карта «команда → буква группы» из standings.
export async function fetchTeamGroups(): Promise<Map<string, string>> {
  const data = (await getJson(STANDINGS)) as {
    children?: { name?: string; standings?: { entries?: { team?: { displayName?: string } }[] } }[];
  };
  const map = new Map<string, string>();
  for (const child of data.children ?? []) {
    const letter = (child.name ?? "").replace(/group\s*/i, "").trim();
    for (const e of child.standings?.entries ?? []) {
      const name = e.team?.displayName;
      if (name && letter) map.set(name, letter);
    }
  }
  return map;
}

interface EspnCompetitor {
  homeAway: string;
  team: { id: string; displayName: string };
  score?: string;
}
interface EspnEvent {
  id: string;
  date: string;
  season?: { slug?: string };
  competitions: {
    status?: { type?: { name?: string }; displayClock?: string };
    venue?: { fullName?: string };
    competitors: EspnCompetitor[];
  }[];
}

async function fetchEventsForDate(yyyymmdd: string): Promise<EspnEvent[]> {
  const data = (await getJson(`${BASE}/scoreboard?dates=${yyyymmdd}`)) as {
    events?: EspnEvent[];
  };
  return data.events ?? [];
}

function normalizeEvent(
  e: EspnEvent,
  groups: Map<string, string>,
): NormalizedMatch | null {
  const comp = e.competitions?.[0];
  if (!comp) return null;
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  if (!home || !away) return null;

  const stage = stageFromSlug(e.season?.slug ?? "");
  const status = mapStatus(comp.status?.type?.name ?? "");
  const isGroup = stage === "group";
  const homeName = home.team.displayName;
  const awayName = away.team.displayName;

  return {
    externalId: `espn:${e.id}`,
    homeTeam: homeName,
    awayTeam: awayName,
    homeScore: status === "scheduled" ? null : intOrNull(home.score),
    awayScore: status === "scheduled" ? null : intOrNull(away.score),
    status,
    minute: status === "live" ? parseMinute(comp.status?.displayClock ?? "", comp.status?.type?.name ?? "") : null,
    stage,
    group: isGroup ? groups.get(homeName) ?? null : null,
    matchDate: new Date(e.date),
    venue: comp.venue?.fullName ?? null,
    round: isGroup ? null : stage,
  };
}

function intOrNull(s?: string): number | null {
  if (s == null) return null;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? null : n;
}

// Даты турнира (UTC) — для полного импорта. ЧМ-2026: 11 июня — 19 июля.
function tournamentDates(): string[] {
  const dates: string[] = [];
  const start = Date.UTC(2026, 5, 11);
  const end = Date.UTC(2026, 6, 20);
  for (let t = start; t <= end; t += 86_400_000) {
    const d = new Date(t);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    dates.push(`${yyyy}${mm}${dd}`);
  }
  return dates;
}

// Все матчи турнира (полный импорт). Уникализируем по id.
export async function fetchAllEspnMatches(): Promise<NormalizedMatch[]> {
  const groups = await fetchTeamGroups().catch(() => new Map<string, string>());
  const seen = new Set<string>();
  const out: NormalizedMatch[] = [];
  for (const date of tournamentDates()) {
    let events: EspnEvent[] = [];
    try {
      events = await fetchEventsForDate(date);
    } catch {
      continue; // пропускаем сбойный день
    }
    for (const e of events) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const n = normalizeEvent(e, groups);
      if (n) out.push(n);
    }
  }
  return out;
}

// Только сегодняшние матчи (для частого live-синка).
export async function fetchTodayEspnMatches(): Promise<NormalizedMatch[]> {
  const groups = await fetchTeamGroups().catch(() => new Map<string, string>());
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const events = await fetchEventsForDate(`${yyyy}${mm}${dd}`);
  return events
    .map((e) => normalizeEvent(e, groups))
    .filter((m): m is NormalizedMatch => m !== null);
}

// Статистика матча из summary (event id без префикса espn:).
export async function fetchEspnMatchStats(eventId: string): Promise<MatchStats | null> {
  const id = eventId.replace(/^espn:/, "");
  const data = (await getJson(`${BASE}/summary?event=${id}`)) as {
    boxscore?: {
      teams?: { team?: { id?: string }; statistics?: { label?: string; displayValue?: string }[] }[];
    };
    header?: {
      competitions?: { competitors?: { homeAway?: string; team?: { id?: string } }[] }[];
    };
  };
  const teams = data.boxscore?.teams;
  if (!teams || teams.length < 2) return null;

  // id команды → home/away
  const sideById = new Map<string, string>();
  for (const c of data.header?.competitions?.[0]?.competitors ?? []) {
    if (c.team?.id && c.homeAway) sideById.set(c.team.id, c.homeAway);
  }

  const pick = (stats?: { label?: string; displayValue?: string }[]): TeamStats => {
    const out: TeamStats = {};
    for (const s of stats ?? []) {
      if (s.label && (STAT_LABELS as readonly string[]).includes(s.label) && s.displayValue != null) {
        out[s.label] = s.displayValue;
      }
    }
    return out;
  };

  const result: MatchStats = { home: {}, away: {} };
  for (const t of teams) {
    const side = t.team?.id ? sideById.get(t.team.id) : undefined;
    const stats = pick(t.statistics);
    if (side === "home") result.home = stats;
    else if (side === "away") result.away = stats;
  }
  if (Object.keys(result.home).length === 0 && Object.keys(result.away).length === 0) {
    return null;
  }
  return result;
}

// Счёт 1-го тайма из summary (header.competitors[].linescores[0]).
export async function fetchEspnMatchHt(
  eventId: string,
): Promise<{ home: number; away: number } | null> {
  const id = eventId.replace(/^espn:/, "");
  const data = (await getJson(`${BASE}/summary?event=${id}`)) as {
    header?: {
      competitions?: {
        competitors?: { homeAway?: string; linescores?: { displayValue?: string }[] }[];
      }[];
    };
  };
  const comps = data.header?.competitions?.[0]?.competitors;
  if (!comps) return null;
  let home: number | null = null;
  let away: number | null = null;
  for (const c of comps) {
    const v = c.linescores?.[0]?.displayValue;
    if (v == null) continue;
    const n = parseInt(v, 10);
    if (Number.isNaN(n)) continue;
    if (c.homeAway === "home") home = n;
    else if (c.homeAway === "away") away = n;
  }
  if (home == null || away == null) return null;
  return { home, away };
}

// ─── Составы + форма (из того же summary) ───────────────────────────────────
// Рейтингов игроков ESPN не отдаёт; берём формацию, позиции, голы/карточки/замены.

export interface LineupPlayer {
  id: string;
  name: string;
  jersey: string;
  position: string; // abbreviation: GK, RB, CD-L, CM-R, CF-L...
  starter: boolean;
  subbedIn: boolean;
  subbedOut: boolean;
  goals: number;
  yellow: number;
  red: number;
  headshot: string | null;
  keyStats: { label: string; value: string }[];
}
export interface TeamLineup {
  side: "home" | "away";
  team: string;
  formation: string | null;
  rows: LineupPlayer[][]; // [0] = [вратарь], далее линии защиты→атаки
  bench: LineupPlayer[];
}
export interface FormGame {
  result: string; // 'W' | 'L' | 'D'
  teamScore: number;
  oppScore: number;
  pens: string | null; // счёт по пенальти с позиции команды, напр. '4:2'
  opponent: string;
  atVs: string; // 'vs' | '@'
  date: string;
  competition: string;
}
export interface TeamForm {
  side: "home" | "away";
  team: string;
  games: FormGame[];
}
export interface MatchExtras {
  lineups: { home: TeamLineup; away: TeamLineup } | null;
  form: { home: TeamForm; away: TeamForm } | null;
}

// Ключевые статы игрока, которые показываем при тапе (имя ESPN → ярлык).
const PLAYER_STAT_LABELS: { name: string; label: string }[] = [
  { name: "totalGoals", label: "Голы" },
  { name: "goalAssists", label: "Ассисты" },
  { name: "totalShots", label: "Удары" },
  { name: "shotsOnTarget", label: "В створ" },
  { name: "saves", label: "Сейвы" },
  { name: "foulsCommitted", label: "Фолы" },
  { name: "yellowCards", label: "ЖК" },
  { name: "redCards", label: "КК" },
  { name: "offsides", label: "Офсайды" },
];

interface EspnRosterPlayer {
  starter?: boolean;
  jersey?: string;
  subbedIn?: boolean;
  subbedOut?: boolean;
  formationPlace?: string;
  athlete?: { id?: string; shortName?: string; displayName?: string; headshot?: { href?: string } };
  position?: { abbreviation?: string };
  stats?: { name?: string; value?: number; displayValue?: string }[];
}

function statVal(stats: EspnRosterPlayer["stats"], name: string): number {
  const s = stats?.find((x) => x.name === name);
  return s?.value != null ? Number(s.value) : 0;
}

function toPlayer(p: EspnRosterPlayer): LineupPlayer {
  const stats = p.stats ?? [];
  return {
    id: p.athlete?.id ?? "",
    name: p.athlete?.shortName ?? p.athlete?.displayName ?? "—",
    jersey: p.jersey ?? "",
    position: p.position?.abbreviation ?? "",
    starter: !!p.starter,
    subbedIn: !!p.subbedIn,
    subbedOut: !!p.subbedOut,
    goals: statVal(stats, "totalGoals"),
    yellow: statVal(stats, "yellowCards"),
    red: statVal(stats, "redCards"),
    headshot: p.athlete?.headshot?.href ?? null,
    keyStats: PLAYER_STAT_LABELS.map((s) => ({
      label: s.label,
      value: String(statVal(stats, s.name)),
    })),
  };
}

// Глубина позиции для сортировки защита→атака.
function depth(pos: string): number {
  const a = pos.toUpperCase();
  if (a === "G" || a.includes("GK")) return -1;
  if (a.startsWith("D") || a.endsWith("B") || a.startsWith("CD") || a.startsWith("SW")) return 0;
  if (a.startsWith("DM") || a.startsWith("CDM")) return 1;
  if (a.startsWith("AM") || a.startsWith("CAM")) return 3;
  if (a.includes("M")) return 2;
  return 4; // нападающие/вингеры
}

// Горизонтальный слот слева→направо по суффиксу позиции.
function xKey(pos: string): number {
  const a = pos.toUpperCase();
  if (a.startsWith("L")) return 0; // LB, LM, LW
  if (a.endsWith("-L")) return 1;
  if (a.startsWith("R")) return 4; // RB, RM, RW
  if (a.endsWith("-R")) return 3;
  return 2; // центр
}

function parseFormation(formation: string | null): number[] | null {
  if (!formation) return null;
  const parts = formation.split("-").map((n) => parseInt(n, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  return parts;
}

// Раскладка стартового состава по линиям: [0]=вратарь, дальше защита→атака.
function layoutRows(players: LineupPlayer[], formation: string | null): LineupPlayer[][] {
  const gk = players.filter((p) => depth(p.position) === -1);
  const outfield = players
    .filter((p) => depth(p.position) !== -1)
    .sort((a, b) => depth(a.position) - depth(b.position));

  const sizes = parseFormation(formation);
  const rows: LineupPlayer[][] = [];
  rows.push(gk.length ? gk : []);

  if (sizes && sizes.reduce((s, n) => s + n, 0) === outfield.length) {
    let i = 0;
    for (const n of sizes) {
      rows.push(outfield.slice(i, i + n));
      i += n;
    }
  } else {
    // фолбэк: группируем по защита/полузащита/атака
    const byBucket = (lo: number, hi: number) =>
      outfield.filter((p) => depth(p.position) >= lo && depth(p.position) <= hi);
    rows.push(byBucket(0, 0));
    rows.push(byBucket(1, 3));
    rows.push(byBucket(4, 4));
  }

  // сортируем каждую линию слева→направо
  return rows.map((line) => [...line].sort((a, b) => xKey(a.position) - xKey(b.position)));
}

function toLineup(r: {
  homeAway?: string;
  team?: { displayName?: string };
  formation?: string;
  roster?: EspnRosterPlayer[];
}): TeamLineup {
  const players = (r.roster ?? []).map(toPlayer);
  const starters = players.filter((p) => p.starter);
  return {
    side: r.homeAway === "away" ? "away" : "home",
    team: r.team?.displayName ?? "—",
    formation: r.formation ?? null,
    rows: layoutRows(starters, r.formation ?? null),
    bench: players.filter((p) => !p.starter),
  };
}

interface EspnFormGame {
  gameResult?: string;
  score?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamScore?: string;
  awayTeamScore?: string;
  homeShootoutScore?: string;
  awayShootoutScore?: string;
  gameDate?: string;
  competitionName?: string;
  leagueAbbreviation?: string;
  opponent?: { displayName?: string };
  atVs?: string;
}

function toForm(t: {
  team?: { id?: string; displayName?: string };
  events?: EspnFormGame[];
}, side: "home" | "away"): TeamForm {
  const teamId = t.team?.id;
  const games: FormGame[] = (t.events ?? []).map((g) => {
    const weHome = g.homeTeamId != null && g.homeTeamId === teamId;
    const teamScore = parseInt((weHome ? g.homeTeamScore : g.awayTeamScore) ?? "0", 10);
    const oppScore = parseInt((weHome ? g.awayTeamScore : g.homeTeamScore) ?? "0", 10);
    const teamPens = parseInt((weHome ? g.homeShootoutScore : g.awayShootoutScore) ?? "0", 10);
    const oppPens = parseInt((weHome ? g.awayShootoutScore : g.homeShootoutScore) ?? "0", 10);
    const hadShootout = (teamPens || 0) + (oppPens || 0) > 0;
    return {
      result: (g.gameResult ?? "").toUpperCase(),
      teamScore: Number.isNaN(teamScore) ? 0 : teamScore,
      oppScore: Number.isNaN(oppScore) ? 0 : oppScore,
      pens: hadShootout ? `${teamPens}:${oppPens}` : null,
      opponent: g.opponent?.displayName ?? "—",
      atVs: g.atVs ?? "vs",
      date: g.gameDate ?? "",
      competition: g.leagueAbbreviation ?? g.competitionName ?? "",
    };
  });
  return { side, team: t.team?.displayName ?? "—", games };
}

// Составы + форма из summary. Возвращает то, что реально есть (может быть частично null).
export async function fetchEspnMatchExtras(eventId: string): Promise<MatchExtras> {
  const id = eventId.replace(/^espn:/, "");
  const data = (await getJson(`${BASE}/summary?event=${id}`, 60)) as {
    rosters?: { homeAway?: string; roster?: EspnRosterPlayer[]; team?: { displayName?: string }; formation?: string }[];
    lastFiveGames?: { team?: { id?: string; displayName?: string }; events?: EspnFormGame[] }[];
  };

  let lineups: MatchExtras["lineups"] = null;
  const rosters = data.rosters ?? [];
  const hasRoster = rosters.some((r) => (r.roster?.length ?? 0) > 0);
  if (hasRoster && rosters.length >= 2) {
    const home = rosters.find((r) => r.homeAway === "home") ?? rosters[0];
    const away = rosters.find((r) => r.homeAway === "away") ?? rosters[1];
    lineups = { home: toLineup(home), away: toLineup(away) };
  }

  let form: MatchExtras["form"] = null;
  const lf = data.lastFiveGames ?? [];
  if (lf.length >= 2) {
    // порядок в lastFiveGames: home, away (displayOrder)
    form = { home: toForm(lf[0], "home"), away: toForm(lf[1], "away") };
  }

  return { lineups, form };
}
