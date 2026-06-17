"use client";

// Купон (bet slip): набор ног, переживает переходы между матчами (localStorage).
// Одна нога на матч — добавление нового выбора по матчу заменяет прежний.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface SlipLeg {
  matchId: string;
  matchLabel: string; // «Бразилия — Сербия»
  market: string;
  marketLabel: string; // «Исход · Основное время»
  selection: string;
  selectionLabel: string; // «П1»
  coef: number;
}

interface SlipCtx {
  legs: SlipLeg[];
  add: (leg: SlipLeg) => void;
  remove: (matchId: string) => void;
  clear: () => void;
  has: (matchId: string, market: string, selection: string) => boolean;
  bankroll: number;
  setBankroll: (n: number) => void;
  loggedIn: boolean;
}

const Ctx = createContext<SlipCtx | null>(null);
const KEY = "betslip:v1";

export function useBetSlip(): SlipCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useBetSlip must be used within BetSlipProvider");
  return c;
}

export function BetSlipProvider({
  initialBankroll,
  loggedIn,
  children,
}: {
  initialBankroll: number;
  loggedIn: boolean;
  children: ReactNode;
}) {
  const [legs, setLegs] = useState<SlipLeg[]>([]);
  const [bankroll, setBankroll] = useState(initialBankroll);

  // Гидрация из localStorage на маунте (SSR не знает про localStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- одноразовая загрузка из внешнего хранилища
      if (raw) setLegs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(legs));
    } catch {
      /* ignore */
    }
  }, [legs]);

  const add = (leg: SlipLeg) =>
    setLegs((prev) => [...prev.filter((l) => l.matchId !== leg.matchId), leg]);
  const remove = (matchId: string) =>
    setLegs((prev) => prev.filter((l) => l.matchId !== matchId));
  const clear = () => setLegs([]);
  const has = (matchId: string, market: string, selection: string) =>
    legs.some((l) => l.matchId === matchId && l.market === market && l.selection === selection);

  return (
    <Ctx.Provider value={{ legs, add, remove, clear, has, bankroll, setBankroll, loggedIn }}>
      {children}
    </Ctx.Provider>
  );
}
