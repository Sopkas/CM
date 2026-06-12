// Рынки прогнозов «как на бетке», без коэффициентов.
// Часть рынков считается из счёта, часть — из статистики матча (ESPN).
// Очки — по сложности.

export interface MarketOption {
  value: string;
  label: string;
}

// Контекст для разбора рынка: счёт + (опционально) статистика матча.
export interface ResultContext {
  homeScore: number;
  awayScore: number;
  stats: { home: Record<string, string>; away: Record<string, string> } | null;
}

export interface MarketDef {
  key: string;
  label: string;
  group: string; // секция в UI
  points: number;
  options: MarketOption[]; // пусто для exact_score (вводится счёт)
  needsStats?: boolean; // рынок считается только при наличии статистики
  // true = выбор верный, false = неверный, null = не определить
  evaluate: (selection: string, ctx: ResultContext) => boolean | null;
}

const total = (line: number) => (sel: string, ctx: ResultContext) => {
  const sum = ctx.homeScore + ctx.awayScore;
  if (sel === "over") return sum > line;
  if (sel === "under") return sum < line;
  return null;
};

// Сумма статистики обеих команд по метке ESPN (null если статы нет).
function statTotal(ctx: ResultContext, label: string): number | null {
  if (!ctx.stats) return null;
  const h = parseFloat(ctx.stats.home[label] ?? "");
  const a = parseFloat(ctx.stats.away[label] ?? "");
  if (Number.isNaN(h) && Number.isNaN(a)) return null;
  return (Number.isNaN(h) ? 0 : h) + (Number.isNaN(a) ? 0 : a);
}

const overUnderStat = (label: string, line: number) => (sel: string, ctx: ResultContext) => {
  const t = statTotal(ctx, label);
  if (t == null) return null;
  if (sel === "over") return t > line;
  if (sel === "under") return t < line;
  return null;
};

const OVER_UNDER: MarketOption[] = [
  { value: "over", label: "Больше" },
  { value: "under", label: "Меньше" },
];

export const MARKETS: MarketDef[] = [
  {
    key: "outcome",
    label: "Исход",
    group: "Исход",
    points: 2,
    options: [
      { value: "home", label: "П1" },
      { value: "draw", label: "Х" },
      { value: "away", label: "П2" },
    ],
    evaluate: (sel, c) => {
      if (sel === "home") return c.homeScore > c.awayScore;
      if (sel === "draw") return c.homeScore === c.awayScore;
      if (sel === "away") return c.awayScore > c.homeScore;
      return null;
    },
  },
  {
    key: "double_chance",
    label: "Двойной шанс",
    group: "Исход",
    points: 1,
    options: [
      { value: "1X", label: "1X" },
      { value: "12", label: "12" },
      { value: "X2", label: "X2" },
    ],
    evaluate: (sel, c) => {
      if (sel === "1X") return c.homeScore >= c.awayScore;
      if (sel === "12") return c.homeScore !== c.awayScore;
      if (sel === "X2") return c.awayScore >= c.homeScore;
      return null;
    },
  },
  {
    key: "handicap_1_5",
    label: "Фора 1.5 (крупная победа)",
    group: "Исход",
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
  {
    key: "btts",
    label: "Обе забьют",
    group: "Голы",
    points: 2,
    options: [
      { value: "yes", label: "Да" },
      { value: "no", label: "Нет" },
    ],
    evaluate: (sel, c) => {
      const both = c.homeScore > 0 && c.awayScore > 0;
      if (sel === "yes") return both;
      if (sel === "no") return !both;
      return null;
    },
  },
  { key: "total_1_5", label: "Тотал 1.5", group: "Голы", points: 1, options: OVER_UNDER, evaluate: total(1.5) },
  { key: "total_2_5", label: "Тотал 2.5", group: "Голы", points: 2, options: OVER_UNDER, evaluate: total(2.5) },
  { key: "total_3_5", label: "Тотал 3.5", group: "Голы", points: 2, options: OVER_UNDER, evaluate: total(3.5) },
  {
    key: "odd_even",
    label: "Чёт/нечёт",
    group: "Голы",
    points: 1,
    options: [
      { value: "even", label: "Чёт" },
      { value: "odd", label: "Нечёт" },
    ],
    evaluate: (sel, c) => {
      const even = (c.homeScore + c.awayScore) % 2 === 0;
      if (sel === "even") return even;
      if (sel === "odd") return !even;
      return null;
    },
  },
  {
    key: "exact_score",
    label: "Точный счёт",
    group: "Счёт",
    points: 5,
    options: [],
    evaluate: (sel, c) => {
      const m = sel.match(/^(\d+):(\d+)$/);
      if (!m) return null;
      return +m[1] === c.homeScore && +m[2] === c.awayScore;
    },
  },

  // --- Статистические рынки (из ESPN, считаются после матча) ---
  {
    key: "corners_total",
    label: "Тотал угловых 9.5",
    group: "Статистика",
    points: 2,
    options: OVER_UNDER,
    needsStats: true,
    evaluate: overUnderStat("Corner Kicks", 9.5),
  },
  {
    key: "yellow_total",
    label: "Тотал жёлтых 3.5",
    group: "Статистика",
    points: 2,
    options: OVER_UNDER,
    needsStats: true,
    evaluate: overUnderStat("Yellow Cards", 3.5),
  },
  {
    key: "shots_on_target_total",
    label: "Тотал ударов в створ 7.5",
    group: "Статистика",
    points: 2,
    options: OVER_UNDER,
    needsStats: true,
    evaluate: overUnderStat("ON GOAL", 7.5),
  },
  {
    key: "total_shots_total",
    label: "Тотал ударов 24.5",
    group: "Статистика",
    points: 2,
    options: OVER_UNDER,
    needsStats: true,
    evaluate: overUnderStat("SHOTS", 24.5),
  },
  {
    key: "red_card",
    label: "Будет красная карточка",
    group: "Статистика",
    points: 3,
    options: [
      { value: "yes", label: "Да" },
      { value: "no", label: "Нет" },
    ],
    needsStats: true,
    evaluate: (sel, ctx) => {
      const t = statTotal(ctx, "Red Cards");
      if (t == null) return null;
      if (sel === "yes") return t >= 1;
      if (sel === "no") return t < 1;
      return null;
    },
  },
];

export const MARKET_BY_KEY = new Map(MARKETS.map((m) => [m.key, m]));

export const MARKET_GROUPS = [...new Set(MARKETS.map((m) => m.group))];

// Очки за выбор по рынку и контексту (счёт + статистика).
export function scoreMarketPick(
  marketKey: string,
  selection: string,
  ctx: ResultContext,
): number {
  const def = MARKET_BY_KEY.get(marketKey);
  if (!def) return 0;
  return def.evaluate(selection, ctx) === true ? def.points : 0;
}

// Человекочитаемая подпись выбора (для списков прогнозов).
export function selectionLabel(marketKey: string, selection: string): string {
  const def = MARKET_BY_KEY.get(marketKey);
  if (!def) return selection;
  if (def.key === "exact_score") return selection;
  return def.options.find((o) => o.value === selection)?.label ?? selection;
}
