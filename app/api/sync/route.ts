// Cron-эндпоинт синхронизации (PRD §6 — Vercel Cron каждые 60 сек).
// Защищён SYNC_SECRET: либо Authorization: Bearer <secret>, либо ?key=<secret>.
// Vercel Cron шлёт заголовок с CRON_SECRET — поддержим оба.

import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  // Принимаем SYNC_SECRET (внешний cron) и CRON_SECRET (Vercel Cron).
  const secrets = [process.env.SYNC_SECRET, process.env.CRON_SECRET].filter(
    Boolean,
  ) as string[];
  if (secrets.length === 0) return true; // не задан — локальная разработка
  const auth = req.headers.get("authorization");
  const key = req.nextUrl.searchParams.get("key");
  return secrets.some((s) => auth === `Bearer ${s}` || key === s);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync failed:", err);
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 },
    );
  }
}
