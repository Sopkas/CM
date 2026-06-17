import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { getCurrentUser } from "@/lib/session";
import { Nav } from "@/components/Nav";
import { BetSlipProvider } from "@/components/BetSlipProvider";
import { BetSlip } from "@/components/BetSlip";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "WC2026 Predictor — прогнозы для своих",
  description: "Прогнозы, сетки и таблица лидеров на ЧМ-2026",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <BetSlipProvider initialBankroll={user?.bankroll ?? 0} loggedIn={!!user}>
          <Nav user={user ? { nickname: user.nickname, avatar: user.avatar, isAdmin: user.isAdmin } : null} />
          <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-5 pb-24 sm:pb-8">
            {children}
          </main>
          <BetSlip />
        </BetSlipProvider>
      </body>
    </html>
  );
}
