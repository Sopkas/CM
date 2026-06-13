// Сид с демо-данными: инвайты, матчи (примеры), пользователи, прогнозы.
// Реальные матчи подтянутся из API через /api/sync или вводятся admin вручную.
// Запуск: npm run db:seed

import { PrismaClient } from "@prisma/client";
import { scoreKnockoutPick, matchWinner } from "../lib/scoring";
import { scoreMarketPick } from "../lib/markets";

const db = new PrismaClient();

// helper: смещение от "сейчас" в часах
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000);

async function main() {
  console.log("🌱 seeding...");

  // --- Инвайты ---
  const adminCode = process.env.ADMIN_INVITE_CODE ?? "admin-первый-вход";
  await db.invite.deleteMany();
  await db.invite.createMany({
    data: [
      { code: "friend-1", note: "Демо-инвайт 1" },
      { code: "friend-2", note: "Демо-инвайт 2" },
      { code: "friend-3", note: "Демо-инвайт 3" },
    ],
  });

  // --- Матчи (демо: группы A и B) ---
  await db.match.deleteMany();
  type Seed = {
    ext: string;
    home: string;
    away: string;
    group: string;
    when: Date;
    hs?: number;
    as?: number;
    status: "scheduled" | "live" | "finished";
    minute?: number;
  };
  const seeds: Seed[] = [
    // Группа A — два сыгранных, один live, остальные впереди
    { ext: "1", home: "Мексика", away: "ЮАР", group: "A", when: hoursFromNow(-48), hs: 2, as: 1, status: "finished" },
    { ext: "2", home: "Канада", away: "Уругвай", group: "A", when: hoursFromNow(-46), hs: 0, as: 0, status: "finished" },
    { ext: "3", home: "Мексика", away: "Канада", group: "A", when: hoursFromNow(-1), hs: 1, as: 1, status: "live", minute: 67 },
    { ext: "4", home: "ЮАР", away: "Уругвай", group: "A", when: hoursFromNow(2), status: "scheduled" },
    { ext: "5", home: "Мексика", away: "Уругвай", group: "A", when: hoursFromNow(26), status: "scheduled" },
    { ext: "6", home: "ЮАР", away: "Канада", group: "A", when: hoursFromNow(28), status: "scheduled" },
    // Группа B
    { ext: "7", home: "США", away: "Уэльс", group: "B", when: hoursFromNow(-44), hs: 3, as: 1, status: "finished" },
    { ext: "8", home: "Англия", away: "Иран", group: "B", when: hoursFromNow(-42), hs: 2, as: 0, status: "finished" },
    { ext: "9", home: "США", away: "Англия", group: "B", when: hoursFromNow(4), status: "scheduled" },
    { ext: "10", home: "Уэльс", away: "Иран", group: "B", when: hoursFromNow(6), status: "scheduled" },
  ];

  const matches = [];
  for (const s of seeds) {
    const m = await db.match.create({
      data: {
        externalId: s.ext,
        homeTeam: s.home,
        awayTeam: s.away,
        group: s.group,
        stage: "group",
        matchDate: s.when,
        homeScore: s.hs ?? null,
        awayScore: s.as ?? null,
        status: s.status,
        minute: s.minute ?? null,
      },
    });
    matches.push(m);
  }

  // --- Пользователи ---
  await db.user.deleteMany();
  const admin = await db.user.create({
    data: { nickname: "Админ", avatar: "👑", isAdmin: true },
  });
  const alex = await db.user.create({ data: { nickname: "Лёха", avatar: "🦁" } });
  const masha = await db.user.create({ data: { nickname: "Маша", avatar: "🐱" } });
  const dima = await db.user.create({ data: { nickname: "Дима", avatar: "🐻" } });
  const users = [admin, alex, masha, dima];

  // --- Рыночные прогнозы на сыгранные матчи (для лидерборда) ---
  const finished = matches.filter((m) => m.status === "finished");
  // у каждого пользователя свой "вкус" прогнозов (предсказанный счёт → набор рынков)
  const guesses: Record<string, [number, number][]> = {
    [admin.id]: [[2, 1], [1, 0], [2, 1], [1, 1]], // часть точных
    [alex.id]: [[1, 0], [0, 0], [2, 0], [3, 0]],
    [masha.id]: [[2, 1], [0, 0], [3, 1], [2, 0]], // много точных
    [dima.id]: [[0, 2], [1, 1], [1, 1], [0, 1]],
  };

  // из предсказанного счёта собираем выборы по нескольким рынкам
  function picksFromScore(ph: number, pa: number): { market: string; selection: string }[] {
    const outcome = ph > pa ? "home" : ph < pa ? "away" : "draw";
    const total = ph + pa > 2.5 ? "over" : "under";
    const btts = ph > 0 && pa > 0 ? "yes" : "no";
    return [
      { market: "outcome", selection: outcome },
      { market: "total_2_5", selection: total },
      { market: "btts", selection: btts },
      { market: "exact_score", selection: `${ph}:${pa}` },
    ];
  }

  await db.marketPick.deleteMany();
  const totals: Record<string, number> = {};
  for (const u of users) {
    let total = 0;
    for (let i = 0; i < finished.length; i++) {
      const m = finished[i];
      const g = guesses[u.id]?.[i];
      if (!g) continue;
      const [ph, pa] = g;
      for (const pick of picksFromScore(ph, pa)) {
        const pts = scoreMarketPick(pick.market, pick.selection, {
          homeScore: m.homeScore!,
          awayScore: m.awayScore!,
          htHome: null,
          htAway: null,
          stats: null,
        });
        total += pts;
        await db.marketPick.create({
          data: {
            userId: u.id,
            matchId: m.id,
            market: pick.market,
            selection: pick.selection,
            pointsEarned: pts,
          },
        });
      }
    }
    // прогноз на live-матч (ещё не залочен, без очков)
    const live = matches.find((m) => m.status === "live");
    if (live && u.id !== admin.id) {
      for (const pick of picksFromScore(2, 1)) {
        await db.marketPick.create({
          data: {
            userId: u.id,
            matchId: live.id,
            market: pick.market,
            selection: pick.selection,
            pointsEarned: 0,
          },
        });
      }
    }
    totals[u.id] = total;
  }

  // отметим сыгранные матчи как посчитанные
  await db.match.updateMany({
    where: { status: "finished" },
    data: { scoredAt: new Date() },
  });

  // --- Матчи плей-офф (демо: 1/4 → финал) ---
  type KO = {
    ext: string;
    home: string;
    away: string;
    stage: string;
    when: Date;
    hs?: number;
    as?: number;
    status: "scheduled" | "live" | "finished";
  };
  const ko: KO[] = [
    { ext: "qf1", home: "Аргентина", away: "Нидерланды", stage: "QF", when: hoursFromNow(-20), hs: 2, as: 1, status: "finished" },
    { ext: "qf2", home: "Франция", away: "Англия", stage: "QF", when: hoursFromNow(-18), hs: 1, as: 2, status: "finished" },
    { ext: "qf3", home: "Бразилия", away: "Хорватия", stage: "QF", when: hoursFromNow(3), status: "scheduled" },
    { ext: "qf4", home: "Испания", away: "Португалия", stage: "QF", when: hoursFromNow(5), status: "scheduled" },
    { ext: "sf1", home: "Аргентина", away: "Англия", stage: "SF", when: hoursFromNow(30), status: "scheduled" },
    { ext: "sf2", home: "TBD", away: "TBD", stage: "SF", when: hoursFromNow(32), status: "scheduled" },
    { ext: "final", home: "TBD", away: "TBD", stage: "Final", when: hoursFromNow(54), status: "scheduled" },
  ];
  const koMatches = [];
  for (const k of ko) {
    const m = await db.match.create({
      data: {
        externalId: k.ext,
        homeTeam: k.home,
        awayTeam: k.away,
        stage: k.stage,
        round: k.stage,
        matchDate: k.when,
        homeScore: k.hs ?? null,
        awayScore: k.as ?? null,
        status: k.status,
        scoredAt: k.status === "finished" ? new Date() : null,
      },
    });
    koMatches.push(m);
  }

  // --- Демо-прогнозы на сетку (по сыгранным 1/4 + открытым) ---
  await db.knockoutPick.deleteMany();
  const koGuess: Record<string, Record<string, string>> = {
    [admin.id]: { qf1: "Аргентина", qf2: "Англия", qf3: "Бразилия", sf1: "Аргентина" }, // qf1/qf2 верно
    [alex.id]: { qf1: "Нидерланды", qf2: "Франция", qf4: "Испания" }, // мимо
    [masha.id]: { qf1: "Аргентина", qf2: "Англия", qf3: "Бразилия", qf4: "Португалия", sf1: "Англия" },
    [dima.id]: { qf1: "Аргентина", qf2: "Франция" }, // половина
  };
  for (const u of users) {
    const picks = koGuess[u.id] ?? {};
    for (const m of koMatches) {
      const team = picks[m.externalId];
      if (!team) continue;
      const winner = matchWinner(m.homeTeam, m.awayTeam, m.homeScore, m.awayScore);
      const pts =
        m.status === "finished" && winner
          ? scoreKnockoutPick(team, winner, m.stage)
          : 0;
      totals[u.id] = (totals[u.id] ?? 0) + pts;
      await db.knockoutPick.create({
        data: { userId: u.id, matchId: m.id, predictedTeam: team, pointsEarned: pts },
      });
    }
  }

  // --- Демо-бонусы (турнир «начался» — дедлайн в прошлом, факт задан) ---
  await db.bonusPrediction.deleteMany();
  await db.setting.deleteMany();
  await db.setting.create({ data: { key: "actualChampion", value: "Аргентина" } });
  await db.setting.create({ data: { key: "actualTopScorer", value: "Месси" } });
  const bonusGuess: Record<string, { champ: string; scorer: string }> = {
    [admin.id]: { champ: "Аргентина", scorer: "Месси" }, // оба верно (+15)
    [alex.id]: { champ: "Франция", scorer: "Мбаппе" },
    [masha.id]: { champ: "Аргентина", scorer: "Холанд" }, // чемпион верно (+10)
    [dima.id]: { champ: "Бразилия", scorer: "Месси" }, // бомбардир верно (+5)
  };
  for (const u of users) {
    const b = bonusGuess[u.id];
    if (!b) continue;
    const champPts = b.champ === "Аргентина" ? 10 : 0;
    const scorerPts = b.scorer === "Месси" ? 5 : 0;
    totals[u.id] = (totals[u.id] ?? 0) + champPts + scorerPts;
    await db.bonusPrediction.create({
      data: { userId: u.id, type: "champion", value: b.champ, pointsEarned: champPts },
    });
    await db.bonusPrediction.create({
      data: { userId: u.id, type: "top_scorer", value: b.scorer, pointsEarned: scorerPts },
    });
  }

  // финальные итоги по очкам
  for (const u of users) {
    await db.user.update({
      where: { id: u.id },
      data: { totalPoints: totals[u.id] ?? 0 },
    });
  }

  console.log(`✅ готово. Админ-код для входа: "${adminCode}" (или используй friend-1..3)`);
  console.log("   Демо-юзеры: Админ/Лёха/Маша/Дима");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
