import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const replySchema = z.object({
  reviewId: z.number().int().positive(),
  text: z.string().min(1).max(2000),
});

// GET — получить отзывы и рейтинг
export async function GET(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      // Нет OAuth (standalone через cookies) — пустой ответ вместо 500
      return NextResponse.json({
        rating: null,
        reviews: null,
        errors: { rating: null, reviews: null },
      });
    }

    const { searchParams } = new URL(request.url);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const [ratingResult, reviewsResult] = await Promise.all([
      client.getRatingInfo(),
      client.getReviews(offset, Math.min(limit, 50)),
    ]);

    return NextResponse.json({
      rating: ratingResult.success ? ratingResult.data : null,
      reviews: reviewsResult.success ? reviewsResult.data : null,
      errors: {
        rating: ratingResult.success ? null : "Не удалось загрузить рейтинг",
        reviews: reviewsResult.success ? null : "Не удалось загрузить отзывы",
      },
    });
  } catch (error) {
    console.error("Avito reviews GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — ответить на отзыв
export async function POST(request: NextRequest) {
  try {
    const userId = getUserIdFromSession(request);
    if (!userId) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = replySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Укажите ID отзыва и текст ответа (макс. 2000 символов)" },
        { status: 400 }
      );
    }

    const sessionOrError = await resolveSession(request, userId);
    if (sessionOrError instanceof NextResponse) return sessionOrError;
    const session = sessionOrError;

    if (!session.id) {
      return NextResponse.json({ error: "Avito не подключен" }, { status: 400 });
    }

    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const result = await client.replyToReview(parsed.data.reviewId, parsed.data.text);

    if (!result.success) {
      console.error("[Avito Reviews] Reply error:", result.error);
      return NextResponse.json({ error: "Не удалось отправить ответ на отзыв" }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avito reviews POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
