// Admin: задать факт турнира (чемпион/бомбардир) → пересчёт бонусных очков.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { setSetting } from "@/lib/recompute";
import { recomputeAllPoints } from "@/lib/recompute";

const schema = z.object({
  champion: z.string().trim().max(60).optional(),
  topScorer: z.string().trim().max(60).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { champion, topScorer } = parsed.data;
  if (champion !== undefined) await setSetting("actualChampion", champion);
  if (topScorer !== undefined) await setSetting("actualTopScorer", topScorer);
  await recomputeAllPoints();
  return NextResponse.json({ ok: true });
}
