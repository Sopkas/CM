// Прогноз на выход из группы (1-е и 2-е место). Лок — старт первого матча группы.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { groupDeadline } from "@/lib/tournament";

const schema = z.object({
  group: z.string().min(1).max(2),
  firstTeam: z.string().min(1),
  secondTeam: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { group, firstTeam, secondTeam } = parsed.data;

  if (firstTeam === secondTeam) {
    return NextResponse.json(
      { error: "1-е и 2-е место — разные команды" },
      { status: 400 },
    );
  }

  const deadline = await groupDeadline(group);
  if (deadline && Date.now() >= deadline.getTime()) {
    return NextResponse.json({ error: "Дедлайн по группе прошёл" }, { status: 423 });
  }

  const pick = await db.groupPick.upsert({
    where: { userId_group: { userId: user.id, group } },
    update: { firstTeam, secondTeam },
    create: { userId: user.id, group, firstTeam, secondTeam },
  });
  return NextResponse.json({ ok: true, pick });
}
