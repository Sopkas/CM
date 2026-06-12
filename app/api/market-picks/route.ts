// Прогноз по рынку матча. Серверный лок за 15 мин до старта (PRD §3.2).
// Ставка делается один раз: после первого сохранения выборы на матч менять нельзя.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/deadline";
import { MARKET_BY_KEY } from "@/lib/markets";

const pickSchema = z.object({
  market: z.string().min(1),
  selection: z.string().min(1).max(20),
});
const schema = z.object({
  matchId: z.string().min(1),
  picks: z.array(pickSchema).min(1).max(20),
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
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { matchId, picks } = parsed.data;

  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Матч не найден" }, { status: 404 });
  if (isLocked(match.matchDate)) {
    return NextResponse.json({ error: "Дедлайн прошёл — прогноз закрыт" }, { status: 423 });
  }

  for (const p of picks) {
    if (!validSelection(p.market, p.selection)) {
      return NextResponse.json(
        { error: `Неверный выбор по рынку ${p.market}` },
        { status: 400 },
      );
    }
  }

  // Ставка одноразовая: если по матчу уже есть хоть один выбор — менять нельзя.
  // Проверка и вставка в одной транзакции, чтобы исключить гонку двойного сабмита.
  try {
    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.marketPick.count({
        where: { userId: user.id, matchId },
      });
      if (existing > 0) throw new AlreadyBetError();
      await tx.marketPick.createMany({
        data: picks.map((p) => ({
          userId: user.id,
          matchId,
          market: p.market,
          selection: p.selection,
        })),
        skipDuplicates: true,
      });
      return picks.length;
    });
    return NextResponse.json({ ok: true, saved });
  } catch (e) {
    if (e instanceof AlreadyBetError) {
      return NextResponse.json(
        { error: "Ты уже сделал ставку на этот матч — изменить нельзя" },
        { status: 409 },
      );
    }
    throw e;
  }
}

class AlreadyBetError extends Error {}
