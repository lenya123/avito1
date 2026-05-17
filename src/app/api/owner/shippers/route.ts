import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import bcrypt from "bcryptjs";

async function getOwnerSession(request: NextRequest) {
  const sessionCookie = request.cookies.get("session");
  if (!sessionCookie?.value) return null;

  try {
    const session = JSON.parse(Buffer.from(sessionCookie.value, "base64").toString());
    if (session.role !== "owner") return null;
    return session;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    // Получаем всех отправщиков
    const { data: shippers, error } = await supabase
      .from("users")
      .select(
        `
        id,
        telegram_id,
        telegram_username,
        name,
        phone,
        shipper_login,
        work_days,
        created_at
      `
      )
      .eq("role", "shipper")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Shippers fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки отправщиков" }, { status: 500 });
    }

    // Получаем статистику для каждого отправщика
    const shipperIds = shippers?.map((s) => s.id) || [];

    // Статистика за сегодня
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayStats } = await supabase
      .from("shipper_stats")
      .select("shipper_id, orders_shipped, returns_collected")
      .in("shipper_id", shipperIds)
      .gte("date", todayStart.toISOString().split("T")[0]);

    // Статистика за месяц
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthStats } = await supabase
      .from("shipper_stats")
      .select("shipper_id, orders_shipped, returns_collected, earnings")
      .in("shipper_id", shipperIds)
      .gte("date", monthStart.toISOString().split("T")[0]);

    // Группируем статистику
    const todayStatsMap: Record<string, { shipped: number; returned: number }> = {};
    const monthStatsMap: Record<string, { shipped: number; returned: number; earnings: number }> =
      {};

    todayStats?.forEach((stat) => {
      if (!todayStatsMap[stat.shipper_id]) {
        todayStatsMap[stat.shipper_id] = { shipped: 0, returned: 0 };
      }
      todayStatsMap[stat.shipper_id].shipped += stat.orders_shipped || 0;
      todayStatsMap[stat.shipper_id].returned += stat.returns_collected || 0;
    });

    monthStats?.forEach((stat) => {
      if (!monthStatsMap[stat.shipper_id]) {
        monthStatsMap[stat.shipper_id] = { shipped: 0, returned: 0, earnings: 0 };
      }
      monthStatsMap[stat.shipper_id].shipped += stat.orders_shipped || 0;
      monthStatsMap[stat.shipper_id].returned += stat.returns_collected || 0;
      monthStatsMap[stat.shipper_id].earnings += stat.earnings || 0;
    });

    // Формируем ответ
    const shippersFormatted = shippers?.map((shipper) => ({
      id: shipper.id,
      telegramId: shipper.telegram_id,
      telegramUsername: shipper.telegram_username,
      name: shipper.name,
      phone: shipper.phone,
      login: shipper.shipper_login,
      workDays: shipper.work_days || null,
      createdAt: shipper.created_at,
      today: todayStatsMap[shipper.id] || { shipped: 0, returned: 0 },
      month: monthStatsMap[shipper.id] || { shipped: 0, returned: 0, earnings: 0 },
    }));

    // Общая статистика за сегодня
    const totalToday = {
      shipped: Object.values(todayStatsMap).reduce((sum, s) => sum + s.shipped, 0),
      earnings: Object.values(monthStatsMap).reduce((sum, s) => sum + s.earnings, 0),
    };

    return NextResponse.json({
      shippers: shippersFormatted,
      totalToday,
    });
  } catch (error) {
    console.error("Shippers API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const createShipperSchema = z.object({
  name: z.string().min(2, "Имя слишком короткое"),
  telegramUsername: z.string().optional(),
  phone: z.string().optional(),
  login: z.string().min(3, "Логин слишком короткий"),
  password: z.string().min(6, "Пароль слишком короткий"),
});

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = createShipperSchema.parse(body);

    const supabase = createServiceClient();

    // Проверяем, не занят ли логин
    const { data: existingLogin } = await supabase
      .from("users")
      .select("id")
      .eq("shipper_login", data.login)
      .single();

    if (existingLogin) {
      return NextResponse.json({ error: "Логин уже занят" }, { status: 400 });
    }

    // Хешируем пароль
    const passwordHash = await bcrypt.hash(data.password, 10);

    // Создаём отправщика
    // Генерируем уникальный telegram_id для отправщика (отрицательное число, т.к. реальные telegram_id положительные)
    const fakeTelegramId = -Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 1000);

    const { data: newShipper, error } = await supabase
      .from("users")
      .insert({
        telegram_id: fakeTelegramId,
        name: data.name,
        telegram_username: data.telegramUsername || null,
        phone: data.phone || null,
        shipper_login: data.login,
        shipper_password_hash: passwordHash,
        role: "shipper",
      })
      .select()
      .single();

    if (error) {
      console.error("Create shipper error:", error);
      return NextResponse.json({ error: "Ошибка создания отправщика" }, { status: 500 });
    }

    return NextResponse.json({
      shipper: {
        id: newShipper.id,
        name: newShipper.name,
        telegramUsername: newShipper.telegram_username,
        phone: newShipper.phone,
        login: newShipper.shipper_login,
        createdAt: newShipper.created_at,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Create shipper API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
