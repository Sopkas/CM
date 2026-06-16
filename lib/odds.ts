// Движок цен: реальные кэфы ESPN/DraftKings → модель голов (двойной Пуассон) →
// честная вероятность любого рынка → кэф. Цена считается тем же evaluate, что и
// скоринг, поэтому пул и оплата всегда согласованы.
import { MARKET_BY_KEY, winPoints, type MarketDef, type StatPricing } from "@/lib/markets";

// Лог-выплата сама гасит хвост, поэтому кэп высокий (только чтобы не было Infinity).
export const MAX_COEF = 1000;
const MIN_COEF = 1.01;
const FT_MAX = 8; // макс. голов команды в матче для матрицы
const HALF_MAX = 5;
const H1_SHARE = 0.45; // доля голов в 1-м тайме
const DC_RHO = -0.08; // поправка Диксона-Коулза на низкие счета

export interface GoalModel {
  lambdaHome: number;
  lambdaAway: number;
}
export interface MatchOdds {
  pHome: number; // де-вигнутые вероятности 1X2
  pDraw: number;
  pAway: number;
  goalLine: number; // тотал-линия
  pOver?: number; // де-вигнутая вероятность «больше» (для калибровки μ)
}

// P(X > line) для Пуассона (line вида .5).
function poissonOver(mu: number, line: number): number {
  const k = Math.floor(line);
  let cdf = 0;
  let term = Math.exp(-mu);
  for (let i = 0; i <= k; i++) {
    cdf += term;
    term = (term * mu) / (i + 1);
  }
  return Math.max(0, 1 - cdf);
}

// μ тотала: из реальных over/under-кэфов, иначе ≈ линия.
function muFromLine(line: number, pOver?: number): number {
  if (pOver == null) return Math.max(0.6, line);
  let lo = 0.2, hi = 7;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (poissonOver(mid, line) < pOver) lo = mid;
    else hi = mid;
  }
  return Math.max(0.6, (lo + hi) / 2);
}

// Цена стат-рынка (ESPN не котирует) по Пуассону / фикс-вероятности.
function priceStat(sp: StatPricing, sel: string): number | null {
  if (sp.kind === "ou") {
    const over = poissonOver(sp.mu, sp.line);
    if (sel === "over") return over;
    if (sel === "under") return 1 - over;
    return null;
  }
  if (sp.kind === "winner") {
    if (sel === "home" || sel === "away") return 0.43;
    if (sel === "equal") return 0.14;
    return null;
  }
  // binary
  if (sel === "yes") return sp.pYes;
  if (sel === "no") return 1 - sp.pYes;
  return null;
}

// Американские кэфы → вероятность.
export function americanToProb(ml: number): number {
  return ml < 0 ? -ml / (-ml + 100) : 100 / (ml + 100);
}

// Убираем маржу букмекера (нормируем вероятности к сумме 1).
export function devig(
  home: number,
  draw: number,
  away: number,
): { pHome: number; pDraw: number; pAway: number } {
  const s = home + draw + away || 1;
  return { pHome: home / s, pDraw: draw / s, pAway: away / s };
}

function poissonVec(lambda: number, max: number): number[] {
  const out: number[] = [];
  let term = Math.exp(-lambda);
  let cum = 0;
  for (let k = 0; k < max; k++) {
    out.push(term);
    cum += term;
    term = (term * lambda) / (k + 1);
  }
  out.push(Math.max(0, 1 - cum)); // хвост в последний бакет
  return out;
}

function matrix(lh: number, la: number, max: number): number[][] {
  const h = poissonVec(lh, max);
  const a = poissonVec(la, max);
  const m = h.map((ph) => a.map((pa) => ph * pa));
  // Диксон-Коулз: реальный футбол даёт больше 0:0 и 1:1, меньше 1:0/0:1.
  const r = DC_RHO;
  m[0][0] *= 1 - lh * la * r;
  m[0][1] *= 1 + lh * r;
  m[1][0] *= 1 + la * r;
  m[1][1] *= 1 - r;
  let s = 0;
  for (const row of m) for (const v of row) s += v;
  if (s > 0) for (const row of m) for (let j = 0; j < row.length; j++) row[j] /= s;
  return m;
}

// P(исход) из матрицы счёта.
function outcomeProbs(m: number[][]): { home: number; draw: number; away: number } {
  let home = 0, draw = 0, away = 0;
  for (let i = 0; i < m.length; i++)
    for (let j = 0; j < m.length; j++) {
      if (i > j) home += m[i][j];
      else if (i === j) draw += m[i][j];
      else away += m[i][j];
    }
  return { home, draw, away };
}

// Калибруем λ_home, λ_away под де-вигнутые 1X2 и тотал-линию.
export function buildModel(o: MatchOdds): GoalModel {
  const mu = muFromLine(o.goalLine, o.pOver); // из over/under-кэфов либо ≈ линия
  // подбираем перевес s = λh − λa так, чтобы P(home)−P(away) совпало с целевым
  const targetDiff = o.pHome - o.pAway;
  let lo = -mu, hi = mu;
  for (let it = 0; it < 40; it++) {
    const s = (lo + hi) / 2;
    const lh = Math.max(0.01, (mu + s) / 2);
    const la = Math.max(0.01, (mu - s) / 2);
    const p = outcomeProbs(matrix(lh, la, FT_MAX));
    if (p.home - p.away < targetDiff) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return {
    lambdaHome: Math.max(0.05, (mu + s) / 2),
    lambdaAway: Math.max(0.05, (mu - s) / 2),
  };
}

// Честная вероятность выигрыша опции — считаем тем же evaluate, что и скоринг.
// Сначала по матрице финального счёта; если рынок зависит от таймов — по совместной
// матрице (1-й тайм × 2-й тайм). null → рынок не котируется (стата) → фолбэк.
export function priceProb(
  marketKey: string,
  selection: string,
  model: GoalModel,
): number | null {
  const def = MARKET_BY_KEY.get(marketKey);
  if (!def) return null;

  // 0) стат-рынки (ESPN не котирует) — по Пуассону / силе команд
  if (def.statPricing) {
    // «у кого больше» (владение/удары/угловые) — по силе команд, а не 43/43.
    if (def.statPricing.kind === "winner") {
      const op = outcomeProbs(matrix(model.lambdaHome, model.lambdaAway, FT_MAX));
      const EQ = 0.12; // шанс «поровну»
      if (selection === "home") return (1 - EQ) * (op.home + 0.5 * op.draw);
      if (selection === "away") return (1 - EQ) * (op.away + 0.5 * op.draw);
      if (selection === "equal") return EQ;
      return null;
    }
    return priceStat(def.statPricing, selection);
  }

  // 1) финальный счёт
  const ft = matrix(model.lambdaHome, model.lambdaAway, FT_MAX);
  let p = 0;
  let determined = false;
  for (let i = 0; i <= FT_MAX; i++)
    for (let j = 0; j <= FT_MAX; j++) {
      const r = def.evaluate(selection, {
        homeScore: i, awayScore: j, htHome: null, htAway: null, stats: null,
      });
      if (r === null) continue;
      determined = true;
      if (r === true) p += ft[i][j];
    }
  if (determined) return p;

  // 2) рынок зависит от таймов — совместная матрица половин
  const h1 = matrix(model.lambdaHome * H1_SHARE, model.lambdaAway * H1_SHARE, HALF_MAX);
  const h2 = matrix(model.lambdaHome * (1 - H1_SHARE), model.lambdaAway * (1 - H1_SHARE), HALF_MAX);
  let p2 = 0;
  let det2 = false;
  for (let i1 = 0; i1 <= HALF_MAX; i1++)
    for (let j1 = 0; j1 <= HALF_MAX; j1++) {
      const w1 = h1[i1][j1];
      if (w1 < 1e-6) continue;
      for (let i2 = 0; i2 <= HALF_MAX; i2++)
        for (let j2 = 0; j2 <= HALF_MAX; j2++) {
          const r = def.evaluate(selection, {
            homeScore: i1 + i2, awayScore: j1 + j2, htHome: i1, htAway: j1, stats: null,
          });
          if (r === null) continue;
          det2 = true;
          if (r === true) p2 += w1 * h2[i2][j2];
        }
    }
  return det2 ? p2 : null;
}

export function coefFromProb(p: number): number {
  if (p <= 0) return MAX_COEF;
  return Math.min(MAX_COEF, Math.max(MIN_COEF, 1 / p));
}

export interface PricedOption {
  coef: number;
  pts: number; // потенциальный выигрыш
}
export type Pricing = Record<string, Record<string, PricedOption>>;

// Цена всех опционных рынков + матрица счёта (для динамической цены точного счёта).
export function priceAll(model: GoalModel): { pricing: Pricing; scoreMatrix: number[][] } {
  const pricing: Pricing = {};
  for (const def of MARKET_BY_KEY.values()) {
    if (def.options.length === 0) continue; // exact_score — отдельно
    const row: Record<string, PricedOption> = {};
    for (const o of def.options) {
      const prob = priceProb(def.key, o.value, model);
      if (prob == null || prob <= 0) continue; // не котируется → фолбэк-очки
      const coef = coefFromProb(prob);
      row[o.value] = { coef, pts: winPoints(coef) };
    }
    if (Object.keys(row).length > 0) pricing[def.key] = row;
  }
  return { pricing, scoreMatrix: matrix(model.lambdaHome, model.lambdaAway, FT_MAX) };
}

// Кэф одной опции (для API при сохранении ставки). null → не котируется.
export function coefForPick(
  marketKey: string,
  selection: string,
  model: GoalModel,
): number | null {
  const def: MarketDef | undefined = MARKET_BY_KEY.get(marketKey);
  if (!def) return null;
  const prob = priceProb(marketKey, selection, model);
  if (prob == null || prob <= 0) return null;
  return coefFromProb(prob);
}
