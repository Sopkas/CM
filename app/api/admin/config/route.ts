// Admin: окна прогнозов. predictionsOpenUntil (бонусы+группы) и bracketLocked (сетка).
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { setSetting } from "@/lib/recompute";
import { SETTING_KEYS } from "@/lib/windows";

const schema = z.object({
  predictionsOpenUntil: z.string().nullable().optional(), // ISO-дата или "" для очистки
  bracketLocked: z.boolean().optional(),
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
  const { predictionsOpenUntil, bracketLocked } = parsed.data;

  if (predictionsOpenUntil !== undefined) {
    await setSetting(SETTING_KEYS.predictionsOpenUntil, predictionsOpenUntil ?? "");
  }
  if (bracketLocked !== undefined) {
    await setSetting(SETTING_KEYS.bracketLocked, bracketLocked ? "true" : "false");
  }
  return NextResponse.json({ ok: true });
}
