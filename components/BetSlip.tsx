"use client";

// Плавающий купон: список ног, ставка, суммарный кэф, потенц. выплата → POST /api/coupons.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useBetSlip } from "@/components/BetSlipProvider";

const fmtCoef = (c: number) => (c >= 100 ? String(Math.round(c)) : c.toFixed(2));
const fmtMoney = (n: number) => (Math.round(n * 100) / 100).toLocaleString("ru-RU");

export function BetSlip() {
  const { legs, remove, clear, bankroll, setBankroll, loggedIn } = useBetSlip();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stake, setStake] = useState(10);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!loggedIn || legs.length === 0) return null;

  const totalCoef = legs.reduce((p, l) => p * l.coef, 1);
  const potential = stake * totalCoef;
  const tooMuch = stake > bankroll;
  const badStake = !(stake >= 1) || Number.isNaN(stake);

  async function place() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stake,
          legs: legs.map((l) => ({ matchId: l.matchId, market: l.market, selection: l.selection })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? "Ошибка");
        return;
      }
      setBankroll(bankroll - stake);
      clear();
      setOpen(false);
      router.refresh();
    } catch {
      setMsg("Сеть недоступна");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed right-3 bottom-20 sm:bottom-4 z-30 w-[min(92vw,22rem)]">
      {open ? (
        <div className="rounded-2xl border border-border bg-surface shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-border">
            <span className="font-bold text-sm">🧾 Купон · {legs.length}</span>
            <div className="flex items-center gap-3 text-xs">
              <button onClick={clear} className="text-danger hover:underline">Очистить</button>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-foreground">Свернуть</button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-border">
            {legs.map((l) => (
              <div key={l.matchId} className="px-3 py-2 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted truncate">{l.matchLabel}</div>
                  <div className="text-sm truncate">
                    <span className="text-muted">{l.marketLabel}:</span> {l.selectionLabel}
                  </div>
                </div>
                <span className="font-mono font-bold text-accent text-sm">{fmtCoef(l.coef)}</span>
                <button
                  onClick={() => remove(l.matchId)}
                  className="text-muted hover:text-danger text-sm leading-none"
                  aria-label="Убрать"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="px-3 py-2.5 space-y-2 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted">{legs.length > 1 ? "Кэф экспресса" : "Кэф"}</span>
              <span className="font-mono font-bold text-accent">{fmtCoef(totalCoef)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={stake}
                onChange={(e) => setStake(parseFloat(e.target.value))}
                className="w-24 bg-background border border-border rounded-lg px-2 py-1.5 text-sm font-mono"
              />
              <div className="flex gap-1">
                {[10, 50, 100].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStake(v)}
                    className="text-xs px-2 py-1 rounded bg-surface-2 hover:bg-border"
                  >
                    {v}
                  </button>
                ))}
                <button
                  onClick={() => setStake(Math.floor(bankroll))}
                  className="text-xs px-2 py-1 rounded bg-surface-2 hover:bg-border"
                >
                  макс
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Банк: <span className="font-mono">{fmtMoney(bankroll)}</span></span>
              <span>Выплата: <span className="font-mono text-foreground">{fmtMoney(potential)}</span></span>
            </div>
            {msg && <div className="text-xs text-danger">{msg}</div>}
            <button
              onClick={place}
              disabled={busy || tooMuch || badStake}
              className="w-full bg-accent text-background font-semibold rounded-lg py-2 text-sm disabled:opacity-50"
            >
              {tooMuch ? "Не хватает банка" : busy ? "Ставлю…" : `Поставить ${fmtMoney(stake)}`}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-full bg-accent text-background font-bold px-4 py-2.5 shadow-xl"
        >
          🧾 Купон · {legs.length}
          <span className="font-mono">{fmtCoef(totalCoef)}</span>
        </button>
      )}
    </div>
  );
}
