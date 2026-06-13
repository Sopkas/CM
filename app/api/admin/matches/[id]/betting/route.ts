// Admin: анлок/лок ставок на матч (обходит дедлайн и одноразовость).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

const schema = z.object({ open: z.boolean() });

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

  const match = await db.match.findUnique({ where: { id } });
  if (!match) return NextResponse.json({ error: "Матч не найден" }, { status: 404 });

  await db.match.update({ where: { id }, data: { bettingOpen: parsed.data.open } });
  return NextResponse.json({ ok: true });
}
