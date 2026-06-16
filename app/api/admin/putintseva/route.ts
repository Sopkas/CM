// Admin: включить/выключить «правило Путинцева» для конкретного участника.
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { recomputeAllPoints } from "@/lib/recompute";

const schema = z.object({ userId: z.string().min(1), on: z.boolean() });

export async function POST(req: NextRequest) {
  const admin = await getCurrentUser();
  if (!admin || !admin.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  }
  await db.user.update({
    where: { id: parsed.data.userId },
    data: { putintseva: parsed.data.on },
  });
  await recomputeAllPoints(); // наказание применяется сразу
  return NextResponse.json({ ok: true });
}
