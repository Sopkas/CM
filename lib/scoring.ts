// Логика начисления очков (PRD §3.5).
// Матчи: угадал исход = 2, угадал точный счёт = +3 (итого 5).
// Прогноз только по 90 минутам (PRD §10.1).

export const SCORING = {
  matchOutcome: 2,
  exactScoreBonus: 3,
  groupWinner: 3,
  groupBothQualifiers: 5,
  bracketRoundWin: 3,
  finalists: 5,
  champion: 10,
  topScorer: 5,
} as const;

// Множитель за раунд сетки (PRD §10.4)
export const BRACKET_MULTIPLIER: Record<string, number> = {
  R32: 1,
  R16: 2,
  QF: 3,
  SF: 4,
  Final: 5,
};

// Очки за прогнозы на матч теперь считаются по рынкам — см. lib/markets.ts.

/**
 * Очки за прогноз на выход из группы (PRD §3.5).
 * winner: угадал 1-е место (+3). qualifiers: угадал обе вышедшие команды (+5, порядок не важен).
 */
export function scoreGroupPick(
  predictedFirst: string,
  predictedSecond: string,
  actualFirst: string,
  actualSecond: string,
): { winnerPoints: number; qualifiersPoints: number } {
  const winnerPoints = predictedFirst === actualFirst ? SCORING.groupWinner : 0;
  const predSet = new Set([predictedFirst, predictedSecond]);
  const bothRight =
    predSet.has(actualFirst) && predSet.has(actualSecond) && predSet.size === 2;
  return {
    winnerPoints,
    qualifiersPoints: bothRight ? SCORING.groupBothQualifiers : 0,
  };
}

/**
 * Очки за прогноз победителя матча плей-офф (PRD §10.4).
 * bracketRoundWin (3) × множитель раунда.
 */
export function scoreKnockoutPick(
  predictedTeam: string,
  actualWinner: string,
  round: string,
): number {
  if (predictedTeam !== actualWinner) return 0;
  const mult = BRACKET_MULTIPLIER[round] ?? 1;
  return SCORING.bracketRoundWin * mult;
}

/** Победитель матча по счёту (90 мин). null = ничья/нет данных. */
export function matchWinner(
  homeTeam: string,
  awayTeam: string,
  homeScore: number | null,
  awayScore: number | null,
): string | null {
  if (homeScore == null || awayScore == null) return null;
  if (homeScore > awayScore) return homeTeam;
  if (awayScore > homeScore) return awayTeam;
  return null; // ничья — в плей-офф решается ОТ/пенальти, тут не определяем
}
