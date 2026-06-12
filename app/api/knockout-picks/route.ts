// Прогноз на победителя матча плей-офф. Лок — за 15 мин до матча.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { isLocked } from "@/lib/deadline";

const schema = z.object({
  matchId: z.string().min(1),
  predictedTeam: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { matchId, predictedTeam } = parsed.data;

  const match = await db.match.findUnique({ where: { id: matchId } });
  if (!match) return NextResponse.json({ error: "Матч не найден" }, { status: 404 });
  if (match.stage === "group") {
    return NextResponse.json({ error: "Это не матч плей-офф" }, { status: 400 });
  }
  if (predictedTeam !== match.homeTeam && predictedTeam !== match.awayTeam) {
    return NextResponse.json(
      { error: "Команда не из этого матча" },
      { status: 400 },
    );
  }
  if (isLocked(match.matchDate)) {
    return NextResponse.json({ error: "Дедлайн прошёл" }, { status: 423 });
  }

  const pick = await db.knockoutPick.upsert({
    where: { userId_matchId: { userId: user.id, matchId } },
    update: { predictedTeam },
    create: { userId: user.id, matchId, predictedTeam },
  });
  return NextResponse.json({ ok: true, pick });
}
