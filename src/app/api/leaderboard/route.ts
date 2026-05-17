import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";

// GET /api/leaderboard — рейтинг клиентов за текущую неделю
export async function GET() {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    // Проверка premium доступа
    const isPremium =
      session.isVibePlus ||
      session.subscriptionTier === "premium" ||
      session.subscriptionTier === "top_floor_boss";

    if (!isPremium) {
      return NextResponse.json({ error: "Доступно только для Premium" }, { status: 403 });
    }

    const supabase = createServiceClient();

    // Определяем начало и конец текущей недели (понедельник - воскресенье)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    const periodStart = new Date(now);
    periodStart.setDate(now.getDate() + diffToMonday);
    periodStart.setHours(0, 0, 0, 0);

    const periodEnd = new Date(periodStart);
    periodEnd.setDate(periodStart.getDate() + 6);
    periodEnd.setHours(23, 59, 59, 999);

    // Получаем заказы за текущую неделю, сгруппированные по клиентам
    // Используем SQL для эффективной агрегации
    const { data: orderStats, error: ordersError } = await supabase
      .from("orders")
      .select("client_id, client_price")
      .gte("created_at", periodStart.toISOString())
      .lte("created_at", periodEnd.toISOString())
      .not("status", "in", "(cancelled,disposed)");

    if (ordersError) {
      console.error("Leaderboard orders error:", ordersError);
      return NextResponse.json({ error: "Ошибка загрузки данных" }, { status: 500 });
    }

    // Агрегируем данные по клиентам
    const clientStats: Record<string, { ordersCount: number; totalRevenue: number }> = {};

    for (const order of orderStats || []) {
      if (!clientStats[order.client_id]) {
        clientStats[order.client_id] = { ordersCount: 0, totalRevenue: 0 };
      }
      clientStats[order.client_id].ordersCount += 1;
      clientStats[order.client_id].totalRevenue += order.client_price || 0;
    }

    // Получаем информацию о клиентах
    const clientIds = Object.keys(clientStats);

    if (clientIds.length === 0) {
      return NextResponse.json({
        leaderboard: [],
        currentUserRank: null,
        currentUserEntry: null,
        totalParticipants: 0,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id, name, telegram_username")
      .in("id", clientIds);

    if (usersError) {
      console.error("Leaderboard users error:", usersError);
      return NextResponse.json({ error: "Ошибка загрузки пользователей" }, { status: 500 });
    }

    // Создаём карту пользователей
    const usersMap: Record<string, { name: string | null; telegramUsername: string | null }> = {};
    for (const user of users || []) {
      usersMap[user.id] = {
        name: user.name,
        telegramUsername: user.telegram_username,
      };
    }

    // Формируем и сортируем рейтинг
    const leaderboardEntries = clientIds
      .map((clientId) => ({
        userId: clientId,
        name: usersMap[clientId]?.name || usersMap[clientId]?.telegramUsername || "Клиент",
        telegramUsername: usersMap[clientId]?.telegramUsername || undefined,
        ordersCount: clientStats[clientId].ordersCount,
        totalRevenue: clientStats[clientId].totalRevenue,
        isCurrentUser: clientId === session.userId,
      }))
      .sort((a, b) => {
        // Сначала по количеству заказов, потом по выручке
        if (b.ordersCount !== a.ordersCount) {
          return b.ordersCount - a.ordersCount;
        }
        return b.totalRevenue - a.totalRevenue;
      });

    // Добавляем ранги
    const leaderboard = leaderboardEntries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Находим текущего пользователя
    const currentUserEntry = leaderboard.find((e) => e.isCurrentUser) || null;
    const currentUserRank = currentUserEntry?.rank || null;

    // Берём топ-5 для отображения
    const topLeaderboard = leaderboard.slice(0, 5);

    // Если текущий пользователь не в топ-5, добавляем его в конец
    const hasCurrentUserInTop = topLeaderboard.some((e) => e.isCurrentUser);

    return NextResponse.json({
      leaderboard: topLeaderboard,
      currentUserRank,
      currentUserEntry: hasCurrentUserInTop ? null : currentUserEntry,
      totalParticipants: leaderboard.length,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    });
  } catch (error) {
    console.error("Leaderboard API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
