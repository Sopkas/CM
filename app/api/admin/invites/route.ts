// Admin: создать/посмотреть инвайт-коды.
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) return null;
  return user;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const invites = await db.invite.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ invites });
}

const schema = z.object({ note: z.string().max(120).optional() });

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const { note } = schema.parse(body ?? {});
  const code = randomBytes(6).toString("hex"); // 12 hex-символов
  const invite = await db.invite.create({ data: { code, note } });
  return NextResponse.json({ ok: true, invite });
}
