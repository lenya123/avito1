import { NextRequest, NextResponse } from "next/server";
import { createDeliveryClient } from "@/lib/delivery";

// Хелпер для получения сессии владельца
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

/**
 * GET /api/owner/delivery/tracking?track=xxx
 *
 * Ручная проверка статуса доставки по трек-номеру через Track.global
 *
 * Параметры:
 * - track: трек-номер (обязательный)
 *
 * Track.global автоматически определяет службу доставки.
 * Yandex-треки не поддерживаются через API.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const track = searchParams.get("track");

    if (!track) {
      return NextResponse.json({ error: "Параметр track обязателен" }, { status: 400 });
    }

    const rapidApiKey = process.env.TRACK_GLOBAL_RAPIDAPI_KEY;
    const bearerToken = process.env.TRACK_GLOBAL_BEARER_TOKEN;

    if (!rapidApiKey || !bearerToken) {
      return NextResponse.json({ error: "Track.global API не настроен" }, { status: 500 });
    }

    const client = createDeliveryClient();
    const result = await client.getStatus(track);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Не удалось получить статус" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      trackingNumber: result.data?.trackingNumber,
      courier: {
        slug: result.data?.courierSlug,
        name: result.data?.courierName,
      },
      status: {
        code: result.data?.currentStatus,
        text: result.data?.currentStatusText,
        mapped: result.data?.mappedStatus,
      },
      lastUpdate: result.data?.lastUpdate,
      checkpoints: result.data?.checkpoints || [],
    });
  } catch (error) {
    console.error("[Tracking API] Error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
