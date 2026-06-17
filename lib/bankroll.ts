// Виртуальный банк + расчёт купонов (парлеи/экспрессы). Параллельно очкам.
// Идемпотентный пересчёт, как lib/recompute.ts: считаем состояние всех купонов
// и банк каждого юзера заново из завершённых матчей.
//
// Экономика: ставка резервируется из банка при размещении (User.bankroll —
// это ДОСТУПНЫЙ баланс, ставки pending-купонов уже вычтены). При расчёте:
//   bankroll = STARTING + rebuys*REBUY + Σ payout(settled) − Σ stake(pending)
// payout (нетто в банк): won = stake*(Πcoef−1), lost = −stake, void/pending = 0.

import type { CouponStatus, Match } from "@prisma/client";
import { db } from "@/lib/db";
import { MARKET_BY_KEY, type ResultContext } from "@/lib/markets";

export const STARTING_BANKROLL = 1000;
export const REBUY = 1000;
export const MIN_STAKE = 1;
export const MAX_LEGS = 12;

const round2 = (x: number) => Math.round(x * 100) / 100;

type LegResult = "pending" | "won" | "lost" | "void";

function ctxOf(m: Match): ResultContext | null {
  if (m.status !== "finished" || m.homeScore == null || m.awayScore == null) return null;
  return {
    homeScore: m.homeScore,
    awayScore: m.awayScore,
    htHome: m.homeHt ?? null,
    htAway: m.awayHt ?? null,
    stats:
      (m.stats as { home: Record<string, string>; away: Record<string, string> } | null) ?? null,
  };
}

// Результат ноги по матчу. pending — матч ещё не сыгран; void — рынок не определить.
function legResultOf(market: string, selection: string, m: Match | undefined): LegResult {
  if (!m) return "pending";
  const ctx = ctxOf(m);
  if (!ctx) return "pending";
  const def = MARKET_BY_KEY.get(market);
  if (!def) return "void";
  const r = def.evaluate(selection, ctx);
  if (r === null) return "void";
  return r ? "won" : "lost";
}

interface CouponState {
  id: string;
  userId: string;
  stake: number;
  status: CouponStatus;
  payout: number;
  legs: { id: string; prev: LegResult; result: LegResult }[];
}

// Считает целевое состояние купона из текущих результатов матчей.
function settleCouponState(
  c: { id: string; userId: string; stake: number; legs: { id: string; market: string; selection: string; coef: number; result: string }[] },
  matchById: Map<string, Match>,
  matchOf: Map<string, string>, // legId -> matchId
): CouponState {
  const legs = c.legs.map((l) => ({
    id: l.id,
    prev: l.result as LegResult,
    result: legResultOf(l.market, l.selection, matchById.get(matchOf.get(l.id)!)),
    coef: l.coef,
  }));

  const anyLost = legs.some((l) => l.result === "lost");
  const anyPending = legs.some((l) => l.result === "pending");

  let status: CouponStatus;
  let payout: number;
  if (anyLost) {
    status = "lost";
    payout = -c.stake;
  } else if (anyPending) {
    status = "pending";
    payout = 0;
  } else {
    const won = legs.filter((l) => l.result === "won");
    if (won.length === 0) {
      status = "void";
      payout = 0;
    } else {
      const prod = won.reduce((p, l) => p * l.coef, 1);
      status = "won";
      payout = round2(c.stake * (prod - 1));
    }
  }

  return {
    id: c.id,
    userId: c.userId,
    stake: c.stake,
    status,
    payout,
    legs: legs.map((l) => ({ id: l.id, prev: l.prev, result: l.result })),
  };
}

// Полный идемпотентный расчёт купонов + банка всех юзеров. Зовётся из recomputeAllPoints.
export async function settleCoupons(): Promise<void> {
  const [coupons, matches, users] = await Promise.all([
    db.coupon.findMany({ include: { legs: true } }),
    db.match.findMany(),
    db.user.findMany({ select: { id: true, bankroll: true, rebuys: true } }),
  ]);
  const matchById = new Map(matches.map((m) => [m.id, m]));
  const matchOf = new Map<string, string>();
  for (const c of coupons) for (const l of c.legs) matchOf.set(l.id, l.matchId);

  const states = coupons.map((c) => settleCouponState(c, matchById, matchOf));

  // Банк по юзерам из новых состояний.
  const rebuyOf = new Map(users.map((u) => [u.id, u.rebuys]));
  const bank = new Map<string, number>();
  const hasPending = new Map<string, boolean>();
  for (const u of users) {
    bank.set(u.id, STARTING_BANKROLL + u.rebuys * REBUY);
    hasPending.set(u.id, false);
  }
  for (const s of states) {
    if (s.status === "pending") {
      bank.set(s.userId, (bank.get(s.userId) ?? STARTING_BANKROLL) - s.stake);
      hasPending.set(s.userId, true);
    } else {
      bank.set(s.userId, (bank.get(s.userId) ?? STARTING_BANKROLL) + s.payout);
    }
  }
  // Авто-ребай: банк в ноль и нет открытых купонов → докупаемся.
  for (const u of users) {
    if (!hasPending.get(u.id) && (bank.get(u.id) ?? 0) < MIN_STAKE) {
      rebuyOf.set(u.id, u.rebuys + 1);
      bank.set(u.id, (bank.get(u.id) ?? 0) + REBUY);
    }
  }

  // Дельты.
  const now = new Date();
  const couponUpdates = states.filter((s) => {
    const orig = coupons.find((c) => c.id === s.id)!;
    return orig.status !== s.status || orig.payout !== s.payout;
  });
  const legUpdates = states.flatMap((s) => s.legs.filter((l) => l.prev !== l.result));
  const userUpdates = users.filter(
    (u) => round2(bank.get(u.id) ?? 0) !== round2(u.bankroll) || (rebuyOf.get(u.id) ?? 0) !== u.rebuys,
  );

  if (couponUpdates.length === 0 && legUpdates.length === 0 && userUpdates.length === 0) return;

  await db.$transaction([
    ...couponUpdates.map((s) =>
      db.coupon.update({
        where: { id: s.id },
        data: {
          status: s.status,
          payout: s.payout,
          settledAt: s.status === "pending" ? null : now,
        },
      }),
    ),
    ...legUpdates.map((l) =>
      db.couponLeg.update({ where: { id: l.id }, data: { result: l.result } }),
    ),
    ...userUpdates.map((u) =>
      db.user.update({
        where: { id: u.id },
        data: { bankroll: round2(bank.get(u.id) ?? 0), rebuys: rebuyOf.get(u.id) ?? 0 },
      }),
    ),
  ]);
}

export interface BankStat {
  staked: number; // суммарно поставлено (settled-купоны)
  netResult: number; // суммарный профит/убыток (settled)
  roi: number | null; // netResult / staked, %
  settled: number;
  pending: number;
}

// Сводка по банку всех юзеров (для лидерборда/профиля). Read-only.
export async function getBankStats(): Promise<Map<string, BankStat>> {
  const coupons = await db.coupon.findMany({
    select: { userId: true, stake: true, payout: true, status: true },
  });
  const map = new Map<string, BankStat>();
  const get = (u: string) => {
    let s = map.get(u);
    if (!s) {
      s = { staked: 0, netResult: 0, roi: null, settled: 0, pending: 0 };
      map.set(u, s);
    }
    return s;
  };
  for (const c of coupons) {
    const s = get(c.userId);
    if (c.status === "pending") {
      s.pending++;
    } else {
      s.staked += c.stake;
      s.netResult += c.payout;
      s.settled++;
    }
  }
  for (const s of map.values()) {
    s.staked = round2(s.staked);
    s.netResult = round2(s.netResult);
    s.roi = s.staked > 0 ? Math.round((s.netResult / s.staked) * 1000) / 10 : null;
  }
  return map;
}
