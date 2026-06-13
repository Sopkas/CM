// Повторный вход в существующий аккаунт: ник + PIN. (Регистрация — /api/join.)
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSession } from "@/lib/session";
import { verifyPin } from "@/lib/auth";

const schema = z.object({
  nickname: z.string().trim().min(2).max(24),
  pin: z.string().regex(/^\d{4,6}$/),
});

export async function POST(req: NextRequest) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Введи ник и PIN (4–6 цифр)" }, { status: 400 });
  }
  const { nickname, pin } = parsed.data;

  const user = await db.user.findUnique({ where: { nickname } });
  // одинаковый ответ при отсутствии юзера и неверном PIN — не палим, какие ники есть
  if (!user || !user.pinHash || !verifyPin(pin, user.pinHash)) {
    return NextResponse.json({ error: "Неверный ник или PIN" }, { status: 401 });
  }

  await setSession(user.id);
  return NextResponse.json({ ok: true });
}
