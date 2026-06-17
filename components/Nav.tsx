"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavUser = { nickname: string; avatar: string | null; isAdmin: boolean } | null;

// Нижний таб-бар (моб.) — самое частое
const links = [
  { href: "/", label: "Главная", icon: "🏠" },
  { href: "/matches", label: "Матчи", icon: "⚽" },
  { href: "/bracket", label: "Сетка", icon: "🗂️" },
  { href: "/groups", label: "Группы", icon: "📊" },
  { href: "/leaderboard", label: "Лидеры", icon: "🏆" },
];
// Доп. пункты в десктоп-меню
const extraLinks = [
  { href: "/tours", label: "Туры" },
  { href: "/coupons", label: "Купоны" },
  { href: "/bonus", label: "Бонусы" },
];

export function Nav({ user }: { user: NavUser }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      {/* Верхняя панель */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/" className="font-extrabold tracking-widest text-base uppercase">
            <span className="text-accent">WC</span>2026
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive(l.href)
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {extraLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive(l.href)
                    ? "bg-surface-2 text-foreground"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            ))}
            {user?.isAdmin && (
              <Link
                href="/admin"
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  isActive("/admin") ? "bg-surface-2 text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Admin
              </Link>
            )}
          </nav>
          {user ? (
            <Link
              href="/me"
              className="flex items-center gap-2 text-sm bg-surface px-2.5 py-1.5 rounded-lg border border-border"
            >
              <span>{avatarOf(user.avatar)}</span>
              <span className="font-medium max-w-24 truncate">{user.nickname}</span>
            </Link>
          ) : (
            <Link
              href="/join"
              className="text-sm bg-accent text-background font-semibold px-3 py-1.5 rounded-lg"
            >
              Войти
            </Link>
          )}
        </div>
      </header>

      {/* Нижний таб-бар на мобиле */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-20 border-t border-border bg-surface/95 backdrop-blur">
        <div className="grid grid-cols-5 max-w-3xl mx-auto">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`flex flex-col items-center py-2 text-[11px] ${
                isActive(l.href) ? "text-accent" : "text-muted"
              }`}
            >
              <span className="text-lg leading-none">{l.icon}</span>
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}

function avatarOf(avatar: string | null): string {
  if (!avatar) return "🙂";
  return avatar;
}
