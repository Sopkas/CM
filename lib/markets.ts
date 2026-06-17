// Рынки прогнозов «как на бетке», без коэффициентов. Очки — по сложности.
// Считаются из финального счёта, счёта 1-го тайма (homeHt/awayHt) и статистики ESPN.
// Старые ключи сохранены (outcome, double_chance, btts, total_X_5, odd_even,
// exact_score, handicap_1_5, corners_total, yellow_total, shots_on_target_total,
// total_shots_total, red_card) — существующие ставки продолжают считаться.

export interface MarketOption {
  value: string;
  label: string;
}

export interface ResultContext {
  homeScore: number;
  awayScore: number;
  htHome: number | null; // счёт 1-го тайма
  htAway: number | null;
  stats: { home: Record<string, string>; away: Record<string, string> } | null;
}

// Цена стат-рынков (ESPN их не котирует) — считаем из средних μ по Пуассону.
export type StatPricing =
  | { kind: "ou"; mu: number; line: number } // тотал больше/меньше
  | { kind: "winner" } // у кого больше (home/away/equal)
  | { kind: "binary"; pYes: number }; // да/нет с фикс-вероятностью

export interface MarketDef {
  key: string;
  label: string;
  subtitle: string; // период / уточнение (показывается под названием)
  tab: string; // верхняя вкладка
  points: number;
  options: MarketOption[];
  needsStats?: boolean;
  statPricing?: StatPricing; // как ценить, если рынок не выводится из счёта голов
  evaluate: (selection: string, ctx: ResultContext) => boolean | null;
}

type Period = "match" | "h1" | "h2";
const PT: Record<Period, string> = { match: "Основное время", h1: "1-й тайм", h2: "2-й тайм" };
const sfx = (p: Period) => (p === "match" ? "" : `_${p}`);
const kn = (n: number) => String(n).replace(".", "_");

// Счёт по периоду (null если нет счёта 1-го тайма).
function pScore(ctx: ResultContext, p: Period): { h: number; a: number } | null {
  if (p === "match") return { h: ctx.homeScore, a: ctx.awayScore };
  if (ctx.htHome == null || ctx.htAway == null) return null;
  if (p === "h1") return { h: ctx.htHome, a: ctx.htAway };
  return { h: ctx.homeScore - ctx.htHome, a: ctx.awayScore - ctx.htAway };
}

type Side = "home" | "draw" | "away";
const result = (s: { h: number; a: number }): Side =>
  s.h > s.a ? "home" : s.h === s.a ? "draw" : "away";
const OL: Record<string, string> = { home: "П1", draw: "Х", away: "П2" };
const DCL: Record<string, string> = { "1X": "1X", "12": "12", X2: "X2" };

const evalOutcome = (sel: string, s: { h: number; a: number }): boolean | null => {
  if (sel === "home") return s.h > s.a;
  if (sel === "draw") return s.h === s.a;
  if (sel === "away") return s.a > s.h;
  return null;
};
const evalDC = (sel: string, s: { h: number; a: number }): boolean | null => {
  if (sel === "1X") return s.h >= s.a;
  if (sel === "12") return s.h !== s.a;
  if (sel === "X2") return s.a >= s.h;
  return null;
};
const evalTotalDir = (dir: string, sum: number, line: number): boolean | null => {
  if (dir === "over") return sum > line;
  if (dir === "under") return sum < line;
  return null;
};
const evalBTTS = (sel: string, s: { h: number; a: number }): boolean | null => {
  const both = s.h > 0 && s.a > 0;
  if (sel === "yes") return both;
  if (sel === "no") return !both;
  return null;
};

const OU: MarketOption[] = [
  { value: "over", label: "Больше" },
  { value: "under", label: "Меньше" },
];
const YN: MarketOption[] = [
  { value: "yes", label: "Да" },
  { value: "no", label: "Нет" },
];
const O3: MarketOption[] = [
  { value: "home", label: "П1" },
  { value: "draw", label: "Х" },
  { value: "away", label: "П2" },
];
const DC3: MarketOption[] = [
  { value: "1X", label: "1X" },
  { value: "12", label: "12" },
  { value: "X2", label: "X2" },
];

// ── Фабрики базовых рынков ───────────────────────────────────────────────────

const mOutcome = (p: Period): MarketDef => ({
  key: `outcome${sfx(p)}`,
  label: "Исход",
  subtitle: PT[p],
  tab: "Исход",
  points: p === "match" ? 2 : 3,
  options: O3,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    return s ? evalOutcome(sel, s) : null;
  },
});

const mDoubleChance = (p: Period): MarketDef => ({
  key: `double_chance${sfx(p)}`,
  label: "Двойной шанс",
  subtitle: PT[p],
  tab: "Исход",
  points: 1,
  options: DC3,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    return s ? evalDC(sel, s) : null;
  },
});

const totalPts = (line: number) => (line <= 0.5 ? 1 : line <= 2.5 ? 2 : line <= 3.5 ? 3 : 4);
const mTotal = (p: Period, line: number): MarketDef => ({
  key: `total_${kn(line)}${sfx(p)}`,
  label: `Тотал ${line}`,
  subtitle: PT[p],
  tab: "Тотал",
  points: totalPts(line),
  options: OU,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    return s ? evalTotalDir(sel, s.h + s.a, line) : null;
  },
});

const mTeamTotal = (p: Period, side: "home" | "away", line: number): MarketDef => ({
  key: `total_${side}_${kn(line)}${sfx(p)}`,
  label: `Инд. тотал ${side === "home" ? "П1" : "П2"} ${line}`,
  subtitle: PT[p],
  tab: "Тотал",
  points: line >= 2.5 ? 3 : 2,
  options: OU,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    return evalTotalDir(sel, side === "home" ? s.h : s.a, line);
  },
});

const mOddEven = (p: Period): MarketDef => ({
  key: `odd_even${sfx(p)}`,
  label: "Чёт/нечёт",
  subtitle: PT[p],
  tab: "Тотал",
  points: 1,
  options: [
    { value: "even", label: "Чёт" },
    { value: "odd", label: "Нечёт" },
  ],
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    const even = (s.h + s.a) % 2 === 0;
    return sel === "even" ? even : sel === "odd" ? !even : null;
  },
});

const mTotal3 = (p: Period, line: number): MarketDef => ({
  key: `total3_${kn(line)}${sfx(p)}`,
  label: `Тотал ${line} (3 исхода)`,
  subtitle: PT[p],
  tab: "Тотал",
  points: 3,
  options: [
    { value: "under", label: "Меньше" },
    { value: "exact", label: "Ровно" },
    { value: "over", label: "Больше" },
  ],
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    const sum = s.h + s.a;
    if (sel === "under") return sum < line;
    if (sel === "exact") return sum === line;
    if (sel === "over") return sum > line;
    return null;
  },
});

const mBTTS = (p: Period): MarketDef => ({
  key: `btts${sfx(p)}`,
  label: "Обе команды забьют",
  subtitle: PT[p],
  tab: "Голы",
  points: p === "match" ? 2 : 3,
  options: YN,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    return s ? evalBTTS(sel, s) : null;
  },
});

const mTeamScore = (p: Period, side: "home" | "away"): MarketDef => ({
  key: `${side}_to_score${sfx(p)}`,
  label: `${side === "home" ? "П1" : "П2"} забьёт`,
  subtitle: PT[p],
  tab: "Голы",
  points: 1,
  options: YN,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    const scored = (side === "home" ? s.h : s.a) > 0;
    return sel === "yes" ? scored : sel === "no" ? !scored : null;
  },
});

const ahPts = (line: number) => (line >= 3 ? 4 : line >= 2 ? 3 : 2);
const mHandicap = (p: Period, line: number): MarketDef => ({
  key: `ah_${kn(line)}${sfx(p)}`,
  label: `Фора ${line}`,
  subtitle: PT[p],
  tab: "Фора",
  points: ahPts(line),
  options: [
    { value: "home", label: `П1 (−${line})` },
    { value: "away", label: `П2 (+${line})` },
  ],
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    if (sel === "home") return s.h - line > s.a;
    if (sel === "away") return s.a + line > s.h;
    return null;
  },
});

const mScoreDraw = (p: Period): MarketDef => ({
  key: `score_draw${sfx(p)}`,
  label: "Результативная ничья",
  subtitle: PT[p],
  tab: "Голы",
  points: 3,
  options: YN,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    const yes = s.h === s.a && s.h > 0;
    return sel === "yes" ? yes : sel === "no" ? !yes : null;
  },
});

const mOnlyOne = (p: Period): MarketDef => ({
  key: `only_one_scores${sfx(p)}`,
  label: "Забьёт только одна команда",
  subtitle: PT[p],
  tab: "Голы",
  points: 2,
  options: YN,
  evaluate: (sel, c) => {
    const s = pScore(c, p);
    if (!s) return null;
    const yes = (s.h > 0) !== (s.a > 0);
    return sel === "yes" ? yes : sel === "no" ? !yes : null;
  },
});

// ── Тайм-зависимые ───────────────────────────────────────────────────────────

const mHtFt = (): MarketDef => {
  const opts: MarketOption[] = [];
  for (const r1 of ["home", "draw", "away"] as Side[])
    for (const r2 of ["home", "draw", "away"] as Side[])
      opts.push({ value: `${r1}_${r2}`, label: `${OL[r1]}/${OL[r2]}` });
  return {
    key: "ht_ft",
    label: "Тайм / матч",
    subtitle: "1-й тайм → итог",
    tab: "Тайм/матч",
    points: 4,
    options: opts,
    evaluate: (sel, c) => {
      const h1 = pScore(c, "h1");
      const m = pScore(c, "match");
      if (!h1 || !m) return null;
      const [a, b] = sel.split("_");
      return result(h1) === a && result(m) === b;
    },
  };
};

const mWinHalf = (side: "home" | "away", both: boolean): MarketDef => ({
  key: `${side}_wins_${both ? "both" : "any"}_half`,
  label: `${side === "home" ? "П1" : "П2"} выиграет ${both ? "оба тайма" : "хотя бы один тайм"}`,
  subtitle: "Основное время",
  tab: "Тайм/матч",
  points: both ? 3 : 2,
  options: YN,
  evaluate: (sel, c) => {
    const h1 = pScore(c, "h1");
    const h2 = pScore(c, "h2");
    if (!h1 || !h2) return null;
    const w = (s: { h: number; a: number }) => (side === "home" ? s.h > s.a : s.a > s.h);
    const yes = both ? w(h1) && w(h2) : w(h1) || w(h2);
    return sel === "yes" ? yes : sel === "no" ? !yes : null;
  },
});

const mHalvesCompare = (): MarketDef => ({
  key: "halves_compare",
  label: "Результативность таймов",
  subtitle: "1-й vs 2-й",
  tab: "Тайм/матч",
  points: 3,
  options: [
    { value: "less", label: "1 < 2" },
    { value: "equal", label: "1 = 2" },
    { value: "more", label: "1 > 2" },
  ],
  evaluate: (sel, c) => {
    const h1 = pScore(c, "h1");
    const h2 = pScore(c, "h2");
    if (!h1 || !h2) return null;
    const t1 = h1.h + h1.a;
    const t2 = h2.h + h2.a;
    if (sel === "less") return t1 < t2;
    if (sel === "equal") return t1 === t2;
    if (sel === "more") return t1 > t2;
    return null;
  },
});

const mGoalBothHalves = (): MarketDef => ({
  key: "goal_both_halves",
  label: "Гол в обоих таймах",
  subtitle: "Основное время",
  tab: "Тайм/матч",
  points: 2,
  options: YN,
  evaluate: (sel, c) => {
    const h1 = pScore(c, "h1");
    const h2 = pScore(c, "h2");
    if (!h1 || !h2) return null;
    const yes = h1.h + h1.a > 0 && h2.h + h2.a > 0;
    return sel === "yes" ? yes : sel === "no" ? !yes : null;
  },
});

const mBttsBothHalves = (): MarketDef => ({
  key: "btts_both_halves",
  label: "Обе забьют в обоих таймах",
  subtitle: "Основное время",
  tab: "Тайм/матч",
  points: 4,
  options: YN,
  evaluate: (sel, c) => {
    const h1 = pScore(c, "h1");
    const h2 = pScore(c, "h2");
    if (!h1 || !h2) return null;
    const yes = h1.h > 0 && h1.a > 0 && h2.h > 0 && h2.a > 0;
    return sel === "yes" ? yes : sel === "no" ? !yes : null;
  },
});

const mFirstGoalHalf = (): MarketDef => ({
  key: "first_goal_half",
  label: "В каком тайме первый гол",
  subtitle: "Основное время",
  tab: "Тайм/матч",
  points: 2,
  options: [
    { value: "h1", label: "1-й тайм" },
    { value: "h2", label: "2-й тайм" },
    { value: "none", label: "Гола не будет" },
  ],
  evaluate: (sel, c) => {
    const h1 = pScore(c, "h1");
    const m = pScore(c, "match");
    if (!h1 || !m) return null;
    const t1 = h1.h + h1.a;
    const tot = m.h + m.a;
    if (sel === "h1") return t1 > 0;
    if (sel === "h2") return t1 === 0 && tot > 0;
    if (sel === "none") return tot === 0;
    return null;
  },
});

// ── Экспресс (комбо): один рынок = сетка опций ───────────────────────────────

const TOTAL_LINES = [1.5, 2.5, 3.5, 4.5, 5.5];
const dirL = (d: string) => (d === "over" ? "Б" : "М");

const mOutcomeTotal = (p: Period): MarketDef => {
  const opts: MarketOption[] = [];
  for (const o of ["home", "draw", "away"])
    for (const d of ["under", "over"])
      for (const line of p === "match" ? TOTAL_LINES : [1.5])
        opts.push({ value: `${o}_${d}_${kn(line)}`, label: `${OL[o]} и ${dirL(d)} (${line})` });
  return {
    key: `outcome_total${sfx(p)}`,
    label: "Исход и тотал",
    subtitle: PT[p],
    tab: "Экспресс",
    points: 4,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, p);
      if (!s) return null;
      const [o, d, ...rest] = sel.split("_");
      const line = parseFloat(rest.join(".")); // "3_5" → ["3","5"] → 3.5
      const a = evalOutcome(o, s);
      const b = evalTotalDir(d, s.h + s.a, line);
      return a == null || b == null ? null : a && b;
    },
  };
};

const mDcTotal = (p: Period): MarketDef => {
  const opts: MarketOption[] = [];
  for (const dc of ["1X", "12", "X2"])
    for (const d of ["under", "over"])
      for (const line of p === "match" ? [1.5, 2.5, 3.5, 4.5] : [1.5])
        opts.push({ value: `${dc}_${d}_${kn(line)}`, label: `${DCL[dc]} и ${dirL(d)} (${line})` });
  return {
    key: `dc_total${sfx(p)}`,
    label: "Двойной шанс и тотал",
    subtitle: PT[p],
    tab: "Экспресс",
    points: 3,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, p);
      if (!s) return null;
      const [dc, d, ...rest] = sel.split("_");
      const line = parseFloat(rest.join(".")); // "2_5" → ["2","5"] → 2.5
      const a = evalDC(dc, s);
      const b = evalTotalDir(d, s.h + s.a, line);
      return a == null || b == null ? null : a && b;
    },
  };
};

const mOutcomeBtts = (): MarketDef => {
  const opts: MarketOption[] = [];
  for (const o of ["home", "draw", "away"])
    for (const b of ["yes", "no"])
      opts.push({
        value: `${o}_${b}`,
        label: `${OL[o]} и ${b === "yes" ? "обе забьют" : "хотя бы одна не забьёт"}`,
      });
  return {
    key: "outcome_btts",
    label: "Исход и обе команды забьют",
    subtitle: "Основное время",
    tab: "Экспресс",
    points: 3,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, "match");
      if (!s) return null;
      const [o, b] = sel.split("_");
      const a = evalOutcome(o, s);
      const bb = evalBTTS(b, s);
      return a == null || bb == null ? null : a && bb;
    },
  };
};

const mDcBtts = (): MarketDef => {
  const opts: MarketOption[] = [];
  for (const dc of ["1X", "12", "X2"])
    for (const b of ["yes", "no"])
      opts.push({
        value: `${dc}_${b}`,
        label: `${DCL[dc]} и ${b === "yes" ? "обе забьют" : "хотя бы одна не забьёт"}`,
      });
  return {
    key: "dc_btts",
    label: "Двойной шанс и обе забьют",
    subtitle: "Основное время",
    tab: "Экспресс",
    points: 2,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, "match");
      if (!s) return null;
      const [dc, b] = sel.split("_");
      const a = evalDC(dc, s);
      const bb = evalBTTS(b, s);
      return a == null || bb == null ? null : a && bb;
    },
  };
};

const mOutcomeOrTotal = (): MarketDef => {
  const opts: MarketOption[] = [];
  for (const o of ["home", "draw", "away"])
    for (const d of ["under", "over"])
      for (const line of [1.5, 2.5, 3.5])
        opts.push({ value: `${o}_${d}_${kn(line)}`, label: `${OL[o]} или ${dirL(d)} (${line})` });
  return {
    key: "outcome_or_total",
    label: "Исход или тотал",
    subtitle: "Основное время",
    tab: "Экспресс",
    points: 1,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, "match");
      if (!s) return null;
      const [o, d, ...rest] = sel.split("_");
      const line = parseFloat(rest.join(".")); // "3_5" → ["3","5"] → 3.5
      const a = evalOutcome(o, s);
      const b = evalTotalDir(d, s.h + s.a, line);
      return a == null || b == null ? null : a || b;
    },
  };
};

const mOutcomeOrBtts = (): MarketDef => {
  const opts: MarketOption[] = [];
  for (const o of ["home", "draw", "away"])
    for (const b of ["yes", "no"])
      opts.push({
        value: `${o}_${b}`,
        label: `${OL[o]} или ${b === "yes" ? "обе забьют" : "хотя бы одна не забьёт"}`,
      });
  return {
    key: "outcome_or_btts",
    label: "Исход или обе забьют",
    subtitle: "Основное время",
    tab: "Экспресс",
    points: 1,
    options: opts,
    evaluate: (sel, c) => {
      const s = pScore(c, "match");
      if (!s) return null;
      const [o, b] = sel.split("_");
      const a = evalOutcome(o, s);
      const bb = evalBTTS(b, s);
      return a == null || bb == null ? null : a || bb;
    },
  };
};

// ── Статистика (ESPN, только основное время) ─────────────────────────────────

function statTotal(ctx: ResultContext, label: string): number | null {
  if (!ctx.stats) return null;
  const h = parseFloat(ctx.stats.home[label] ?? "");
  const a = parseFloat(ctx.stats.away[label] ?? "");
  if (Number.isNaN(h) && Number.isNaN(a)) return null;
  return (Number.isNaN(h) ? 0 : h) + (Number.isNaN(a) ? 0 : a);
}

const mStatTotal = (
  key: string,
  label: string,
  tab: string,
  espnLabel: string,
  line: number,
  mu: number,
  points = 2,
): MarketDef => ({
  key,
  label: `${label} ${line}`,
  subtitle: "Основное время",
  tab,
  points,
  options: OU,
  needsStats: true,
  statPricing: { kind: "ou", mu, line },
  evaluate: (sel, c) => {
    const t = statTotal(c, espnLabel);
    return t == null ? null : evalTotalDir(sel, t, line);
  },
});

const mStatWinner = (
  key: string,
  label: string,
  tab: string,
  espnLabel: string,
): MarketDef => ({
  key,
  label,
  subtitle: "У кого больше",
  tab,
  points: 2,
  options: [
    { value: "home", label: "П1" },
    { value: "away", label: "П2" },
    { value: "equal", label: "Поровну" },
  ],
  needsStats: true,
  statPricing: { kind: "winner" },
  evaluate: (sel, c) => {
    if (!c.stats) return null;
    const h = parseFloat(c.stats.home[espnLabel] ?? "");
    const a = parseFloat(c.stats.away[espnLabel] ?? "");
    if (Number.isNaN(h) || Number.isNaN(a)) return null;
    if (sel === "home") return h > a;
    if (sel === "away") return a > h;
    if (sel === "equal") return h === a;
    return null;
  },
});

// ── Сборка каталога ──────────────────────────────────────────────────────────

const HALF: Period[] = ["match", "h1", "h2"];

export const MARKETS: MarketDef[] = [
  // Исход
  ...HALF.map(mOutcome),
  ...HALF.map(mDoubleChance),

  // Тотал
  ...[0.5, 1.5, 2.5, 3.5, 4.5, 5.5].map((l) => mTotal("match", l)),
  ...[0.5, 1.5, 2.5].map((l) => mTotal("h1", l)),
  ...[0.5, 1.5, 2.5].map((l) => mTotal("h2", l)),
  ...[0.5, 1.5, 2.5].flatMap((l) => [mTeamTotal("match", "home", l), mTeamTotal("match", "away", l)]),
  ...[0.5, 1.5].flatMap((l) => [mTeamTotal("h1", "home", l), mTeamTotal("h1", "away", l)]),
  ...HALF.map(mOddEven),
  ...[2, 3, 4].map((l) => mTotal3("match", l)),
  ...[1, 2].map((l) => mTotal3("h1", l)),

  // Фора
  ...[1, 1.5, 2, 2.5, 3].map((l) => mHandicap("match", l)),
  ...[1, 1.5].map((l) => mHandicap("h1", l)),
  // сохранённая старая фора (3 исхода)
  {
    key: "handicap_1_5",
    label: "Фора 1.5 (крупная победа)",
    subtitle: "Основное время",
    tab: "Фора",
    points: 2,
    options: [
      { value: "home_2", label: "П1 в 2+" },
      { value: "margin_1", label: "разница ≤1" },
      { value: "away_2", label: "П2 в 2+" },
    ],
    evaluate: (sel, c) => {
      if (sel === "home_2") return c.homeScore - c.awayScore >= 2;
      if (sel === "away_2") return c.awayScore - c.homeScore >= 2;
      if (sel === "margin_1") return Math.abs(c.homeScore - c.awayScore) <= 1;
      return null;
    },
  },

  // Голы
  ...HALF.map(mBTTS),
  ...HALF.flatMap((p) => [mTeamScore(p, "home"), mTeamScore(p, "away")]),
  ...HALF.map(mScoreDraw),
  ...HALF.map(mOnlyOne),

  // Счёт
  {
    key: "exact_score",
    label: "Точный счёт",
    subtitle: "Основное время",
    tab: "Счёт",
    points: 5,
    options: [],
    evaluate: (sel, c) => {
      const m = sel.match(/^(\d+):(\d+)$/);
      if (!m) return null;
      return +m[1] === c.homeScore && +m[2] === c.awayScore;
    },
  },

  // Тайм/матч
  mHtFt(),
  mWinHalf("home", false),
  mWinHalf("away", false),
  mWinHalf("home", true),
  mWinHalf("away", true),
  mHalvesCompare(),
  mGoalBothHalves(),
  mBttsBothHalves(),
  mFirstGoalHalf(),

  // Экспресс
  mOutcomeTotal("match"),
  mOutcomeTotal("h1"),
  mDcTotal("match"),
  mDcTotal("h1"),
  mOutcomeBtts(),
  mDcBtts(),
  mOutcomeOrTotal(),
  mOutcomeOrBtts(),

  // Статистика — Удары (μ — средние по матчу)
  mStatTotal("total_shots_total", "Тотал ударов", "Удары", "SHOTS", 24.5, 25),
  mStatTotal("shots_20_5", "Тотал ударов", "Удары", "SHOTS", 20.5, 25),
  mStatTotal("shots_28_5", "Тотал ударов", "Удары", "SHOTS", 28.5, 25),
  mStatTotal("shots_on_target_total", "Тотал ударов в створ", "Удары", "ON GOAL", 7.5, 8.5),
  mStatTotal("shots_on_target_9_5", "Тотал ударов в створ", "Удары", "ON GOAL", 9.5, 8.5),
  mStatWinner("shots_winner", "Больше ударов", "Удары", "SHOTS"),

  // Угловые
  mStatTotal("corners_8_5", "Тотал угловых", "Угловые", "Corner Kicks", 8.5, 10.5),
  mStatTotal("corners_total", "Тотал угловых", "Угловые", "Corner Kicks", 9.5, 10.5),
  mStatTotal("corners_10_5", "Тотал угловых", "Угловые", "Corner Kicks", 10.5, 10.5),
  mStatTotal("corners_11_5", "Тотал угловых", "Угловые", "Corner Kicks", 11.5, 10.5),
  mStatWinner("corners_winner", "Больше угловых", "Угловые", "Corner Kicks"),

  // Карточки
  mStatTotal("yellow_2_5", "Тотал жёлтых", "Карточки", "Yellow Cards", 2.5, 3.8),
  mStatTotal("yellow_total", "Тотал жёлтых", "Карточки", "Yellow Cards", 3.5, 3.8),
  mStatTotal("yellow_4_5", "Тотал жёлтых", "Карточки", "Yellow Cards", 4.5, 3.8),
  {
    key: "red_card",
    label: "Будет красная карточка",
    subtitle: "Основное время",
    tab: "Карточки",
    points: 3,
    options: YN,
    needsStats: true,
    statPricing: { kind: "binary", pYes: 0.22 },
    evaluate: (sel, c) => {
      const t = statTotal(c, "Red Cards");
      if (t == null) return null;
      if (sel === "yes") return t >= 1;
      if (sel === "no") return t < 1;
      return null;
    },
  },

  // Прочая стата
  mStatTotal("fouls_19_5", "Тотал фолов", "Прочее", "Fouls", 19.5, 22),
  mStatTotal("fouls_22_5", "Тотал фолов", "Прочее", "Fouls", 22.5, 22),
  mStatTotal("offsides_2_5", "Тотал офсайдов", "Прочее", "Offsides", 2.5, 3.2),
  mStatTotal("offsides_3_5", "Тотал офсайдов", "Прочее", "Offsides", 3.5, 3.2),
  mStatTotal("saves_total_6_5", "Тотал сейвов", "Прочее", "Saves", 6.5, 6),
  mStatWinner("possession_winner", "Чьё владение больше", "Прочее", "Possession"),
];

export const MARKET_BY_KEY = new Map(MARKETS.map((m) => [m.key, m]));

// Вкладки в нужном порядке (только реально присутствующие).
const TAB_ORDER = ["Исход", "Тотал", "Фора", "Голы", "Счёт", "Тайм/матч", "Экспресс", "Удары", "Угловые", "Карточки", "Прочее"];
export const MARKET_TABS = TAB_ORDER.filter((t) => MARKETS.some((m) => m.tab === t));

// Логарифмическая выплата: выигрыш = round(WIN_K × ln(кэф)), проигрыш = −LOSS.
// Так лонгшоты различаются (0:2 > 0:1 > 2:0), но без диких чисел; фаворит-проходняк ≈ 0.
export const WIN_K = 4;
export const LOSS = 3;
// Правило Путинцева: пик с кэфом ниже этого — «очевидная ставка» (проходняк).
export const OBVIOUS_COEF = 1.45;
export function winPoints(coef: number): number {
  return Math.max(0, Math.round(WIN_K * Math.log(coef)));
}

// Очки за выбор.
//  - coef задан (рынок котировался) → по кэфу: угадал +winPoints, мимо −LOSS.
//  - coef нет (стат-рынки / матч без кэфов) → фолбэк: ±static points.
//  - не определить (нет данных) → 0.
export function scoreMarketPick(
  marketKey: string,
  selection: string,
  ctx: ResultContext,
  coef: number | null = null,
): number {
  const def = MARKET_BY_KEY.get(marketKey);
  if (!def) return 0;
  const r = def.evaluate(selection, ctx);
  if (r === null) return 0;
  if (coef != null) return r ? winPoints(coef) : -LOSS;
  return r ? def.points : -def.points;
}

// Человекочитаемая подпись выбора (для списков прогнозов).
export function selectionLabel(marketKey: string, selection: string): string {
  const def = MARKET_BY_KEY.get(marketKey);
  if (!def) return selection;
  if (def.key === "exact_score") return selection;
  return def.options.find((o) => o.value === selection)?.label ?? selection;
}
