// Простая сессия по cookie (PRD §3.1 — паролей нет, это не банк).
// Храним userId в httpOnly cookie; подписи достаточно нет — доступ только по инвайту.

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import type { User } from "@prisma/client";

const COOKIE = "wc_uid";
const MAX_AGE = 60 * 60 * 24 * 90; // 90 дней

export async function setSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  if (!id) return null;
  return db.user.findUnique({ where: { id } });
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
    this.name = "UnauthorizedError";
  }
}
