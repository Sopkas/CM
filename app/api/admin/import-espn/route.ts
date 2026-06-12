// Admin: полный импорт всех матчей ЧМ-2026 из ESPN.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { importAllFromEspn } from "@/lib/sync";

export const maxDuration = 120;

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await importAllFromEspn();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
