"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Перерисовывает серверные данные каждые `seconds` секунд (PRD §3.4 live ≤60с).
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
