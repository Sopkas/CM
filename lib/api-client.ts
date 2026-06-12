// Клиент к worldcup2026 API (rezarahiminia/worldcup2026).
// Схема реальная, не из PRD: эндпоинты /get/games, /get/teams, /get/groups,
// все значения — строки, нужен JWT (register → authenticate).
// Если WC_API_BASE_URL пуст — клиент считается отключённым (работаем на сиде + ручном вводе).

import type { MatchStatus } from "@prisma/client";

const BASE = process.env.WC_API_BASE_URL?.replace(/\/$/, "") ?? "";
const EMAIL = process.env.WC_API_EMAIL ?? "";
const PASSWORD = process.env.WC_API_PASSWORD ?? "";

export function isApiConfigured(): boolean {
  return BASE.length > 0;
}

// Сырой матч из API (всё строками).
interface RawGame {
  id: string;
  home_team_id: string;
  away_team_id: string;
  home_score: string;
  away_score: string;
  group: string; // буква группы ИЛИ раунд ("R32")
  matchday: string;
  local_date: string; // "MM/DD/YYYY HH:mm"
  stadium_id: string;
  finished: string; // "TRUE" | "FALSE"
  time_elapsed: string; // "notstarted" | минута
  type: string; // "group" | "r32" | ...
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_team_label?: string;
  away_team_label?: string;
}

// Нормализованный матч для апсерта в БД.
export interface NormalizedMatch {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: MatchStatus;
  minute: number | null;
  stage: string; // 'group' | 'R32' | 'R16' | 'QF' | 'SF' | 'Final'
  group: string | null; // 'A'..'L' или null
  matchDate: Date;
  venue: string | null;
  round: string | null;
}

let cachedToken: { value: string; at: number } | null = null;

async function getToken(): Promise<string | null> {
  if (!EMAIL || !PASSWORD) return null;
  // токен кэшируем на 50 минут
  if (cachedToken && Date.now() - cachedToken.at < 50 * 60_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${BASE}/auth/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status}`);
  const data = await res.json();
  const token: string | undefined = data.token ?? data.access_token ?? data.jwt;
  if (!token) throw new Error("auth response has no token");
  cachedToken = { value: token, at: Date.now() };
  return token;
}

async function apiGet<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// "MM/DD/YYYY HH:mm" → Date (трактуем как UTC, чтобы дедлайны были детерминированы)
function parseLocalDate(s: string): Date {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!m) return new Date(s);
  const [, mm, dd, yyyy, hh, min] = m;
  return new Date(
    Date.UTC(+yyyy, +mm - 1, +dd, +hh, +min),
  );
}

function normalizeStage(type: string, group: string): string {
  const t = type.toLowerCase();
  if (t === "group") return "group";
  const map: Record<string, string> = {
    r32: "R32",
    r16: "R16",
    qf: "QF",
    sf: "SF",
    final: "Final",
    third: "Third",
  };
  return map[t] ?? group ?? type;
}

function normalize(g: RawGame): NormalizedMatch {
  const finished = g.finished?.toUpperCase() === "TRUE";
  const elapsed = g.time_elapsed?.toLowerCase() ?? "notstarted";
  const minuteNum = parseInt(g.time_elapsed, 10);
  const isLive = !finished && elapsed !== "notstarted";

  let status: MatchStatus = "scheduled";
  if (finished) status = "finished";
  else if (isLive) status = "live";

  const isGroup = g.type?.toLowerCase() === "group";
  const home =
    g.home_team_name_en?.trim() || g.home_team_label?.trim() || "TBD";
  const away =
    g.away_team_name_en?.trim() || g.away_team_label?.trim() || "TBD";

  return {
    externalId: g.id,
    homeTeam: home,
    awayTeam: away,
    homeScore: finished || isLive ? safeInt(g.home_score) : null,
    awayScore: finished || isLive ? safeInt(g.away_score) : null,
    status,
    minute: isLive && !Number.isNaN(minuteNum) ? minuteNum : null,
    stage: normalizeStage(g.type, g.group),
    group: isGroup ? g.group : null,
    matchDate: parseLocalDate(g.local_date),
    venue: g.stadium_id ? `stadium_${g.stadium_id}` : null,
    round: isGroup ? null : g.group,
  };
}

function safeInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function fetchAllMatches(): Promise<NormalizedMatch[]> {
  if (!isApiConfigured()) return [];
  const games = await apiGet<RawGame[]>("/get/games");
  return games.map(normalize);
}
