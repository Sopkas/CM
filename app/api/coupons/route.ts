// Размещение купона (парлей/одиночка) из виртуального банка.
// Кэфы фиксируются на сервере, ставка резервируется из банка (атомарно).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/deadline";
import { MARKET_BY_KEY } from "@/lib/markets";
import { buildModel, coefForPick } from "@/lib/odds";
import { MAX_LEGS, MIN_STAKE } from "@/lib/bankroll";

const legSchema = z.object({
  matchId: z.string().min(1),
  market: z.string().min(1),
  selection: z.string().min(1).max(40),
});
const schema = z.object({
  stake: z.number().positive().max(1_000_000),
  legs: z.array(legSchema).min(1).max(MAX_LEGS),
});

function validSelection(market: string, selection: string): boolean {
  const def = MARKET_BY_KEY.get(market);
  if (!def) return false;
  if (def.key === "exact_score") return /^\d{1,2}:\d{1,2}$/.test(selection);
  return def.options.some((o) => o.value === selection);
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  const { stake, legs } = parsed.data;

  if (stake < MIN_STAKE) {
    return NextResponse.json({ error: `Минимальная ставка — ${MIN_STAKE}` }, { status: 400 });
  }
  // Одна нога на матч (запрет очевидно коррелированных парлеев).
  const matchIds = legs.map((l) => l.matchId);
  if (new Set(matchIds).size !== matchIds.length) {
    return NextResponse.json({ error: "В купоне не может быть двух ставок на один матч" }, { status: 400 });
  }

  const matches = await db.match.findMany({ where: { id: { in: matchIds } } });
  const matchById = new Map(matches.map((m) => [m.id, m]));

  const rows: { matchId: string; market: string; selection: string; coef: number }[] = [];
  for (const l of legs) {
    const m = matchById.get(l.matchId);
    if (!m) return NextResponse.json({ error: "Матч не найден" }, { status: 404 });
    if (isLocked(m.matchDate) && !m.bettingOpen) {
      return NextResponse.json({ error: `Дедлайн прошёл: ${m.homeTeam} — ${m.awayTeam}` }, { status: 423 });
    }
    if (!validSelection(l.market, l.selection)) {
      return NextResponse.json({ error: `Неверный выбор по рынку ${l.market}` }, { status: 400 });
    }
    if (m.pHome == null || m.pDraw == null || m.pAway == null || m.goalLine == null) {
      return NextResponse.json(
        { error: `Нет кэфов для матча ${m.homeTeam} — ${m.awayTeam}` },
        { status: 400 },
      );
    }
    const model = buildModel({
      pHome: m.pHome, pDraw: m.pDraw, pAway: m.pAway, goalLine: m.goalLine, pOver: m.pOver ?? undefined,
    });
    const coef = coefForPick(l.market, l.selection, model);
    if (coef == null) {
      return NextResponse.json(
        { error: `Этот рынок нельзя добавить в купон: ${l.market}` },
        { status: 400 },
      );
    }
    rows.push({ matchId: l.matchId, market: l.market, selection: l.selection, coef });
  }

  // Резервируем ставку из банка атомарно (защита от овердрафта при гонке).
  try {
    const coupon = await db.$transaction(async (tx) => {
      const u = await tx.user.findUnique({ where: { id: user.id }, select: { bankroll: true } });
      if (!u || u.bankroll < stake) throw new InsufficientFundsError();
      const created = await tx.coupon.create({
        data: { userId: user.id, stake, legs: { create: rows } },
        include: { legs: true },
      });
      await tx.user.update({ where: { id: user.id }, data: { bankroll: { decrement: stake } } });
      return created;
    });
    return NextResponse.json({ ok: true, couponId: coupon.id });
  } catch (e) {
    if (e instanceof InsufficientFundsError) {
      return NextResponse.json({ error: "Недостаточно средств в банке" }, { status: 400 });
    }
    throw e;
  }
}

class InsufficientFundsError extends Error {}
