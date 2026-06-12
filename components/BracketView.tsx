"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { flagOf } from "@/lib/flags";

export interface BracketMatch {
  id: string;
  code: string; // M73…M104
  order: number; // числовой externalId — индекс внутри раунда
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  stage: string;
  locked: boolean;
  actualWinner: string | null;
  myPick: string | null;
  pickPoints: number;
}

const ROUND_LABEL: Record<string, string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
  Final: "FINAL",
  Third: "BRONZE",
};

// ── Геометрия канваса ───────────────────────────────────────────────
const CARD_W = 190;
const HGAP = 56; // зазор между колонками
const COLSTEP = CARD_W + HGAP;
const MARGIN = 16;
const VSTEP = 104; // вертикальный шаг между листьями (R32)
const PAD = 24;
const CW = 244; // ширина центральной колонки (финал / чемпион / бронза)

const LEAVES = 8; // листьев на сторону
const HEIGHT = PAD * 2 + LEAVES * VSTEP;
const MID_Y = PAD + (LEAVES * VSTEP) / 2;

// x-координаты левых колонок: R32, R16, QF, SF
const LEFT_X = [0, 1, 2, 3].map((c) => MARGIN + c * COLSTEP);
const CENTER_X = MARGIN + 4 * COLSTEP;
// x-координаты правых колонок: SF, QF, R16, R32 (от центра наружу)
const RIGHT_X = [0, 1, 2, 3].map((c) => CENTER_X + CW + HGAP + c * COLSTEP);
const TOTAL_W = RIGHT_X[3] + CARD_W + MARGIN;

// ── Дерево из строк-плейсхолдеров ───────────────────────────────────
// Каждый матч плей-офф ссылается на питающие его матчи в названиях команд:
//   "Round of 32 1 Winner", "Quarterfinal 3 Winner", "Semifinal 1 Loser" …
const REF_STAGE: Record<string, string> = {
  "round of 32": "R32",
  "round of 16": "R16",
  quarterfinal: "QF",
  semifinal: "SF",
};

function parseRef(team: string): { stage: string; idx: number } | null {
  const m = team.match(/^(round of 32|round of 16|quarterfinal|semifinal)\s+(\d+)\s+(winner|loser)$/i);
  if (!m) return null;
  return { stage: REF_STAGE[m[1].toLowerCase()], idx: Number(m[2]) };
}

type Disp =
  | { kind: "team"; name: string; flag: string }
  | { kind: "seed"; text: string }
  | { kind: "feed"; text: string };

function describe(team: string, byRefIdx: Map<string, Map<number, BracketMatch>>): Disp {
  const flag = flagOf(team);
  if (flag !== "🏳️") return { kind: "team", name: team, flag };

  const ref = parseRef(team);
  if (ref) {
    const child = byRefIdx.get(ref.stage)?.get(ref.idx);
    const loser = /loser$/i.test(team);
    return {
      kind: "feed",
      text: child ? `${loser ? "проигр." : "поб."} ${child.code}` : team,
    };
  }

  // Групповые сиды: "Group A Winner" / "Group B 2nd Place" / "Third Place Group A/B/C/D/F"
  let mm = team.match(/^Group ([A-L]) Winner$/i);
  if (mm) return { kind: "seed", text: `гр. ${mm[1]} · 1` };
  mm = team.match(/^Group ([A-L]) 2nd Place$/i);
  if (mm) return { kind: "seed", text: `гр. ${mm[1]} · 2` };
  mm = team.match(/^Third Place Group (.+)$/i);
  if (mm) return { kind: "seed", text: `3-е ${mm[1].replace(/\//g, "/")}` };

  return { kind: "seed", text: team };
}

interface Laid {
  m: BracketMatch;
  x: number;
  y: number; // центр карточки по вертикали
  home: Disp;
  away: Disp;
}

export function BracketView({
  matches,
  editable,
}: {
  matches: BracketMatch[];
  editable: boolean;
}) {
  const byStage = new Map<string, BracketMatch[]>();
  for (const m of matches) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  for (const arr of byStage.values()) arr.sort((a, b) => a.order - b.order);

  const r32 = byStage.get("R32") ?? [];
  const r16 = byStage.get("R16") ?? [];
  const qf = byStage.get("QF") ?? [];
  const sf = byStage.get("SF") ?? [];
  const finalM = (byStage.get("Final") ?? [])[0];
  const thirdM = (byStage.get("Third") ?? [])[0];

  const isFull =
    r32.length === 16 && r16.length === 8 && qf.length === 4 && sf.length === 2 && !!finalM;

  // refIdx: для каждого раунда idx(1-based по order) → матч
  const byRefIdx = new Map<string, Map<number, BracketMatch>>();
  for (const [stage, arr] of byStage) {
    const map = new Map<number, BracketMatch>();
    arr.forEach((m, i) => map.set(i + 1, m));
    byRefIdx.set(stage, map);
  }

  if (!isFull) {
    return <Fallback matches={matches} byRefIdx={byRefIdx} editable={editable} />;
  }

  const D = (t: string) => describe(t, byRefIdx);
  const card = (m: BracketMatch, x: number, y: number): Laid => ({
    m,
    x,
    y,
    home: D(m.homeTeam),
    away: D(m.awayTeam),
  });

  // Делим раунды на левую/правую половины по индексам, на которые ссылаются
  // следующие раунды (DFS-порядок «дома-первым» даёт правильное спаривание).
  const childIdx = (m: BracketMatch, slot: 0 | 1): number | null => {
    const ref = parseRef(slot === 0 ? m.homeTeam : m.awayTeam);
    return ref ? ref.idx : null;
  };

  // Восстанавливаем порядок листьев через дерево, начиная с финала.
  const sfIdx = [childIdx(finalM, 0), childIdx(finalM, 1)];
  const sf1 = sfIdx[0] ? byRefIdx.get("SF")!.get(sfIdx[0])! : sf[0];
  const sf2 = sfIdx[1] ? byRefIdx.get("SF")!.get(sfIdx[1])! : sf[1];

  const qfUnder = (s: BracketMatch) =>
    [childIdx(s, 0), childIdx(s, 1)].map((i) => byRefIdx.get("QF")!.get(i!)!);
  const r16Under = (q: BracketMatch) =>
    [childIdx(q, 0), childIdx(q, 1)].map((i) => byRefIdx.get("R16")!.get(i!)!);
  const r32Under = (q: BracketMatch) =>
    [childIdx(q, 0), childIdx(q, 1)].map((i) => byRefIdx.get("R32")!.get(i!)!);

  function side(sfNode: BracketMatch, xs: number[]) {
    const qfs = qfUnder(sfNode); // 2
    const r16s = qfs.flatMap(r16Under); // 4
    const r32s = r16s.flatMap(r32Under); // 8

    const y32 = r32s.map((_, k) => PAD + (k + 0.5) * VSTEP);
    const y16 = r16s.map((_, j) => (y32[2 * j] + y32[2 * j + 1]) / 2);
    const yqf = qfs.map((_, j) => (y16[2 * j] + y16[2 * j + 1]) / 2);
    const ysf = (yqf[0] + yqf[1]) / 2;

    const laid = {
      r32: r32s.map((m, k) => card(m, xs[0], y32[k])),
      r16: r16s.map((m, j) => card(m, xs[1], y16[j])),
      qf: qfs.map((m, j) => card(m, xs[2], yqf[j])),
      sf: card(sfNode, xs[3], ysf),
    };
    return laid;
  }

  const left = side(sf1, LEFT_X);
  const right = side(sf2, RIGHT_X);

  // Центральная колонка
  const finalY = PAD + LEAVES * VSTEP * 0.24;
  const champY = MID_Y;
  const thirdY = PAD + LEAVES * VSTEP * 0.76;
  const finalCard = card(finalM, CENTER_X, finalY);
  const thirdCard = thirdM
    ? { ...card(thirdM, CENTER_X, thirdY) }
    : null;
  const champion = finalM.actualWinner;

  // ── Соединительные линии ──────────────────────────────────────────
  const lines: string[] = [];
  const elbow = (cx: number, cy: number, px: number, py: number, toRight: boolean) => {
    const childEdge = toRight ? cx + CARD_W : cx;
    const parentEdge = toRight ? px : px + CARD_W;
    const midX = (childEdge + parentEdge) / 2;
    lines.push(`M ${childEdge} ${cy} H ${midX} V ${py} H ${parentEdge}`);
  };
  function connect(s: typeof left, toRight: boolean) {
    s.r16.forEach((p, j) => {
      elbow(s.r32[2 * j].x, s.r32[2 * j].y, p.x, p.y, toRight);
      elbow(s.r32[2 * j + 1].x, s.r32[2 * j + 1].y, p.x, p.y, toRight);
    });
    s.qf.forEach((p, j) => {
      elbow(s.r16[2 * j].x, s.r16[2 * j].y, p.x, p.y, toRight);
      elbow(s.r16[2 * j + 1].x, s.r16[2 * j + 1].y, p.x, p.y, toRight);
    });
    elbow(s.qf[0].x, s.qf[0].y, s.sf.x, s.sf.y, toRight);
    elbow(s.qf[1].x, s.qf[1].y, s.sf.x, s.sf.y, toRight);
  }
  connect(left, true);
  connect(right, false);
  // SF → Final
  elbow(left.sf.x, left.sf.y, finalCard.x, finalCard.y, true);
  elbow(right.sf.x, right.sf.y, finalCard.x, finalCard.y, false);

  const allCards = [
    ...left.r32,
    ...left.r16,
    ...left.qf,
    left.sf,
    ...right.r32,
    ...right.r16,
    ...right.qf,
    right.sf,
    finalCard,
    ...(thirdCard ? [thirdCard] : []),
  ];

  return (
    <FitToWidth canvasW={TOTAL_W} canvasH={HEIGHT}>
      <div className="relative" style={{ width: TOTAL_W, height: HEIGHT }}>
        <svg
          className="absolute inset-0 pointer-events-none"
          width={TOTAL_W}
          height={HEIGHT}
        >
          {lines.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          ))}
        </svg>

        {/* Центральная «вывеска» финала */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
          style={{ left: CENTER_X + CW / 2, top: finalY - 62 }}
        >
          <div className="text-[11px] font-extrabold tracking-[0.18em] text-foreground">
            THE FINAL · METLIFE
          </div>
          <div className="text-[10px] tracking-[0.18em] text-muted">
            STADIUM · JULY 19
          </div>
        </div>

        {/* Карточки */}
        {allCards.map((c) => (
          <Card key={c.m.id} laid={c} editable={editable} width={c.x === CENTER_X ? CW : CARD_W} />
        ))}

        {/* Печать чемпиона */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: CENTER_X + CW / 2, top: champY }}
        >
          <div className="rotate-[-3deg] rounded-md border-[2.5px] border-danger/70 px-6 py-3 text-center bg-surface/60">
            <div className="text-[22px] leading-none font-black tracking-wide text-danger">
              {champion ? champion.toUpperCase() : "ЧЕМПИОН ?"}
            </div>
            <div className="mt-1 text-[10px] tracking-[0.25em] text-danger/80">
              WORLD CHAMPIONS 2026
            </div>
          </div>
        </div>

        {/* Бронза — подпись */}
        {thirdCard && (
          <div
            className="absolute -translate-x-1/2 text-center text-[11px] font-extrabold tracking-[0.18em] text-muted"
            style={{ left: CENTER_X + CW / 2, top: thirdY - 30 }}
          >
            THIRD PLACE
          </div>
        )}
      </div>
    </FitToWidth>
  );
}

// ── Масштабирование канваса под ширину контейнера ───────────────────
function FitToWidth({
  canvasW,
  canvasH,
  children,
}: {
  canvasW: number;
  canvasH: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const MIN_SCALE = 0.5; // ниже — включаем горизонтальный скролл (мобила)

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () =>
      setScale(Math.max(MIN_SCALE, Math.min(1, el.clientWidth / canvasW)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [canvasW]);

  return (
    <div ref={ref} className="w-full overflow-x-auto pb-4">
      <div
        className="mx-auto"
        style={{ width: canvasW * scale, height: canvasH * scale }}
      >
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Карточка матча ──────────────────────────────────────────────────
function Card({
  laid,
  editable,
  width,
}: {
  laid: Laid;
  editable: boolean;
  width: number;
}) {
  const { m, x, y, home, away } = laid;
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState(m.myPick);

  const tbd = home.kind !== "team" || away.kind !== "team";
  const canPick = editable && !m.locked && !tbd;
  const showScore = m.status === "live" || m.status === "finished";
  const isFinal = m.stage === "Final";

  async function choose(disp: Disp) {
    if (disp.kind !== "team" || !canPick || busy) return;
    setBusy(true);
    const res = await fetch("/api/knockout-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: m.id, predictedTeam: disp.name }),
    });
    setBusy(false);
    if (res.ok) {
      setPick(disp.name);
      router.refresh();
    } else {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Ошибка");
    }
  }

  return (
    <div
      className={`absolute rounded-[3px] border bg-surface shadow-sm ${
        isFinal ? "border-foreground/70" : "border-border"
      }`}
      style={{ left: x, top: y, width, transform: "translateY(-50%)" }}
    >
      {/* Заголовок: код матча + раунд */}
      <div className="flex items-center justify-between px-2.5 pt-1.5 text-[9px] font-bold tracking-widest text-muted">
        <span>{m.code}</span>
        <span>{ROUND_LABEL[m.stage] ?? m.stage}</span>
      </div>

      <div className="px-1 pb-1 pt-0.5">
        <Row
          disp={home}
          score={showScore ? m.homeScore : null}
          picked={pick === (home.kind === "team" ? home.name : "")}
          winner={!!m.actualWinner && home.kind === "team" && m.actualWinner === home.name}
          canPick={canPick}
          onPick={() => choose(home)}
        />
        <Row
          disp={away}
          score={showScore ? m.awayScore : null}
          picked={pick === (away.kind === "team" ? away.name : "")}
          winner={!!m.actualWinner && away.kind === "team" && m.actualWinner === away.name}
          canPick={canPick}
          onPick={() => choose(away)}
        />
      </div>

      {/* Подвал: статус прогноза */}
      {(canPick || (m.status === "finished" && pick)) && (
        <div className="flex items-center justify-between border-t border-border/60 px-2.5 py-1 text-[9px]">
          <span className="text-muted truncate">
            {canPick ? "выбери, кто пройдёт" : pick ? `прогноз: ${pick}` : ""}
          </span>
          {m.status === "finished" && pick && (
            <span
              className={`shrink-0 rounded px-1 font-bold ${
                m.pickPoints > 0 ? "bg-accent/20 text-accent" : "bg-danger/20 text-danger"
              }`}
            >
              {m.pickPoints > 0 ? `+${m.pickPoints}` : "0"}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Row({
  disp,
  score,
  picked,
  winner,
  canPick,
  onPick,
}: {
  disp: Disp;
  score: number | null;
  picked: boolean;
  winner: boolean;
  canPick: boolean;
  onPick: () => void;
}) {
  const isTeam = disp.kind === "team";
  return (
    <button
      disabled={!canPick}
      onClick={onPick}
      className={`flex w-full items-center gap-1.5 rounded-[2px] px-1.5 py-1 text-left text-[13px] transition ${
        picked ? "bg-accent/15 ring-1 ring-accent" : ""
      } ${canPick ? "cursor-pointer hover:bg-surface-2" : "cursor-default"}`}
    >
      {isTeam ? (
        <span className="text-[13px] leading-none">{(disp as { flag: string }).flag}</span>
      ) : (
        <span className="text-[10px] text-faint">·</span>
      )}
      <span
        className={`min-w-0 flex-1 truncate ${
          isTeam ? (winner ? "font-bold text-foreground" : "text-foreground") : "italic text-muted"
        }`}
      >
        {isTeam ? (disp as { name: string }).name : (disp as { text: string }).text}
      </span>
      <span
        className={`score shrink-0 text-[13px] ${winner ? "" : "opacity-80"}`}
      >
        {score ?? ""}
      </span>
    </button>
  );
}

// ── Фолбэк: простой стек, если данные не образуют полную сетку ───────
function Fallback({
  matches,
  byRefIdx,
  editable,
}: {
  matches: BracketMatch[];
  byRefIdx: Map<string, Map<number, BracketMatch>>;
  editable: boolean;
}) {
  const order = ["R32", "R16", "QF", "SF", "Final", "Third"];
  const byStage = new Map<string, BracketMatch[]>();
  for (const m of matches) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  const stages = order.filter((s) => byStage.has(s));
  return (
    <div className="space-y-6">
      {stages.map((s) => (
        <section key={s}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="h-[7px] w-[7px] shrink-0 bg-accent" />
            <h2 className="shrink-0 text-[13px] font-extrabold uppercase tracking-widest">
              {ROUND_LABEL[s] ?? s}
            </h2>
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {byStage
              .get(s)!
              .sort((a, b) => a.order - b.order)
              .map((m) => {
                const laid: Laid = {
                  m,
                  x: 0,
                  y: 0,
                  home: describe(m.homeTeam, byRefIdx),
                  away: describe(m.awayTeam, byRefIdx),
                };
                return (
                  <div key={m.id} className="relative">
                    <FallbackCard laid={laid} editable={editable} />
                  </div>
                );
              })}
          </div>
        </section>
      ))}
    </div>
  );
}

function FallbackCard({ laid, editable }: { laid: Laid; editable: boolean }) {
  // Переиспользуем Card, но в потоке (без абсолютного позиционирования).
  return (
    <div className="[&>div]:!static [&>div]:!translate-y-0 [&>div]:!w-full">
      <Card laid={laid} editable={editable} width={CARD_W} />
    </div>
  );
}
