// Admin: отмена ставок участника. Удаляет одну котировку (pickId) либо все
// рыночные ставки игрока на матч (userId+matchId). Затем пересчёт очков.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { recomputeAllPoints } from "@/lib/recompute";

const schema = z.object({
  pickId: z.string().optional(),
  userId: z.string().optional(),
  matchId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || !admin.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { pickId, userId, matchId } = parsed.data;

  let removed = 0;
  if (pickId) {
    const r = await db.marketPick.deleteMany({ where: { id: pickId } });
    removed = r.count;
  } else if (userId && matchId) {
    const r = await db.marketPick.deleteMany({ where: { userId, matchId } });
    removed = r.count;
  } else {
    return NextResponse.json({ error: "Укажи pickId или userId+matchId" }, { status: 400 });
  }

  await recomputeAllPoints();
  return NextResponse.json({ ok: true, removed });
}
