// Admin-триггер синка (кнопка в панели). Гейт по admin-сессии.
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { runSync } from "@/lib/sync";

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
