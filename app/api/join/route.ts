// Вход по инвайт-коду (PRD §3.1, §10.3).
// Код одноразовый. Код, равный ADMIN_INVITE_CODE, даёт роль admin.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { setSession } from "@/lib/session";
import { hashPin } from "@/lib/auth";

const schema = z.object({
  code: z.string().min(1).max(200),
  nickname: z.string().trim().min(2).max(24),
  avatar: z.string().max(2000).optional(),
  pin: z.string().regex(/^\d{4,6}$/),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Проверь ник (2–24 символа), код и PIN (4–6 цифр)" },
      { status: 400 },
    );
  }
  const { code, nickname, avatar, pin } = parsed.data;
  const pinHash = hashPin(pin);

  const isAdminCode =
    !!process.env.ADMIN_INVITE_CODE && code === process.env.ADMIN_INVITE_CODE;

  // Ник занят?
  const existingNick = await db.user.findUnique({ where: { nickname } });
  if (existingNick) {
    return NextResponse.json({ error: "Ник уже занят" }, { status: 409 });
  }

  // Админ-код — особый путь, не требует записи в invites.
  if (isAdminCode) {
    const user = await db.user.create({
      data: { nickname, avatar, isAdmin: true, pinHash },
    });
    await setSession(user.id);
    return NextResponse.json({ ok: true, user: publicUser(user) });
  }

  // Обычный инвайт: должен существовать и быть неиспользованным.
  const invite = await db.invite.findUnique({ where: { code } });
  if (!invite) {
    return NextResponse.json({ error: "Неверный код" }, { status: 404 });
  }
  if (invite.usedAt) {
    return NextResponse.json({ error: "Код уже использован" }, { status: 409 });
  }

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { nickname, avatar, pinHash } });
    await tx.invite.update({
      where: { id: invite.id },
      data: { usedAt: new Date(), usedBy: u.id },
    });
    return u;
  });

  await setSession(user.id);
  return NextResponse.json({ ok: true, user: publicUser(user) });
}

function publicUser(u: {
  id: string;
  nickname: string;
  avatar: string | null;
  isAdmin: boolean;
}) {
  return {
    id: u.id,
    nickname: u.nickname,
    avatar: u.avatar,
    isAdmin: u.isAdmin,
  };
}
