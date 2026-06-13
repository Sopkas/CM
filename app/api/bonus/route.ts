// Бонусные прогнозы: чемпион и лучший бомбардир. Лок — старт турнира.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { tournamentDeadline } from "@/lib/tournament";
import { predictionsWindowOpen } from "@/lib/windows";

const schema = z.object({
  type: z.enum(["champion", "top_scorer"]),
  value: z.string().trim().min(1).max(60),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { type, value } = parsed.data;

  // Окно прогнозов (админ) перекрывает обычный дедлайн старта турнира.
  if (!(await predictionsWindowOpen())) {
    const deadline = await tournamentDeadline();
    if (deadline && Date.now() >= deadline.getTime()) {
      return NextResponse.json(
        { error: "Бонусы закрыты — турнир начался" },
        { status: 423 },
      );
    }
  }

  const pick = await db.bonusPrediction.upsert({
    where: { userId_type: { userId: user.id, type } },
    update: { value },
    create: { userId: user.id, type, value },
  });
  return NextResponse.json({ ok: true, pick });
}
