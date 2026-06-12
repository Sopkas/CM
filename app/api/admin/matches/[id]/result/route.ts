// Admin: ручной ввод/откат результата матча (PRD §10.2 fallback).
// Пишет счёт+статус и делает полный идемпотентный пересчёт очков.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { recomputeAllPoints } from "@/lib/recompute";

const schema = z.object({
  homeScore: z.number().int().min(0).max(50),
  awayScore: z.number().int().min(0).max(50),
  status: z.enum(["scheduled", "live", "finished"]).default("finished"),
  minute: z.number().int().min(0).max(130).nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  const { homeScore, awayScore, status, minute } = parsed.data;

  const match = await db.match.findUnique({ where: { id } });
  if (!match) {
    return NextResponse.json({ error: "Матч не найден" }, { status: 404 });
  }

  await db.match.update({
    where: { id },
    data: {
      homeScore,
      awayScore,
      status,
      minute: minute ?? null,
      scoredAt: status === "finished" ? new Date() : null,
    },
  });

  await recomputeAllPoints();
  return NextResponse.json({ ok: true });
}
