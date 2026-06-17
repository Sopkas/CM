import Link from "next/link";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { AutoRefresh } from "@/components/AutoRefresh";
import { MARKET_BY_KEY, selectionLabel } from "@/lib/markets";
import { getBankStats } from "@/lib/bankroll";
import type { CouponStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const fmtCoef = (c: number) => (c >= 100 ? String(Math.round(c)) : c.toFixed(2));
const fmtMoney = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ru-RU");

const STATUS: Record<CouponStatus, { label: string; cls: string }> = {
  pending: { label: "В игре", cls: "bg-surface-2 text-muted" },
  won: { label: "Выигрыш", cls: "bg-accent/20 text-accent" },
  lost: { label: "Проигрыш", cls: "bg-danger/15 text-danger" },
  void: { label: "Возврат", cls: "bg-surface-2 text-muted" },
};

const LEG_MARK: Record<string, string> = { won: "✅", lost: "❌", void: "↩️", pending: "⏳" };

export default async function CouponsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
        <Link href="/join" className="text-accent underline">Войди</Link>, чтобы ставить купоны из банка.
      </div>
    );
  }

  const [coupons, bankStats] = await Promise.all([
    db.coupon.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        legs: { include: { match: { select: { homeTeam: true, awayTeam: true } } } },
      },
    }),
    getBankStats(),
  ]);
  const stat = bankStats.get(user.id);

  return (
    <div className="space-y-4">
      <AutoRefresh seconds={60} />
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">🧾 Мои купоны</h1>
        <Link href="/matches" className="text-sm text-accent">+ ставить</Link>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Банк" value={fmtMoney(user.bankroll)} />
        <Stat label="ROI" value={stat?.roi == null ? "—" : `${stat.roi > 0 ? "+" : ""}${stat.roi}%`} />
        <Stat label="Ребаи" value={String(user.rebuys)} />
      </div>

      {coupons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-muted text-sm">
          Купонов пока нет. Открой матч, выбери рынок и жми 🧾 «в купон».
        </div>
      ) : (
        <div className="space-y-2">
          {coupons.map((c) => {
            const prod = c.legs.reduce((p, l) => p * l.coef, 1);
            const st = STATUS[c.status];
            return (
              <section key={c.id} className="rounded-xl border border-border bg-surface overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-surface-2 text-xs">
                  <span className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                    <span className="text-muted">
                      {c.legs.length > 1 ? `Экспресс ×${c.legs.length}` : "Одиночка"} · кэф{" "}
                      <span className="font-mono">{fmtCoef(prod)}</span>
                    </span>
                  </span>
                  <span className="text-muted">
                    Ставка <span className="font-mono text-foreground">{fmtMoney(c.stake)}</span>
                    {c.status !== "pending" && (
                      <>
                        {" · "}
                        <span className={`font-mono ${c.payout >= 0 ? "text-accent" : "text-danger"}`}>
                          {c.payout >= 0 ? "+" : ""}
                          {fmtMoney(c.payout)}
                        </span>
                      </>
                    )}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {c.legs.map((l) => {
                    const def = MARKET_BY_KEY.get(l.market);
                    return (
                      <div key={l.id} className="px-3 py-2 flex items-center gap-2 text-sm">
                        <span>{LEG_MARK[l.result] ?? "⏳"}</span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-muted truncate">
                            {l.match.homeTeam} — {l.match.awayTeam}
                          </div>
                          <div className="truncate">
                            <span className="text-muted">{def?.label ?? l.market}:</span>{" "}
                            {selectionLabel(l.market, l.selection)}
                          </div>
                        </div>
                        <span className="font-mono font-bold text-accent text-sm">{fmtCoef(l.coef)}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface py-2">
      <div className="text-[11px] text-muted">{label}</div>
      <div className="font-mono font-bold text-accent">{value}</div>
    </div>
  );
}
