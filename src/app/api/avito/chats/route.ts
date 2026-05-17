import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  unread_only: z.coerce.boolean().default(false),
});

// GET — список чатов из кеша
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
      return NextResponse.json({
        chats: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
    }

    const supabase = createServiceClient();

    const { searchParams } = new URL(request.url);
    const params = querySchema.parse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      unread_only: searchParams.get("unread_only") ?? undefined,
    });

    const from = (params.page - 1) * params.limit;
    const to = from + params.limit - 1;

    let query = supabase
      .from("avito_chats")
      .select("*", { count: "exact" })
      .eq("session_id", session.id)
      .order("last_message_at", { ascending: false });

    if (params.unread_only) {
      query = query.gt("unread_count", 0);
    }

    const { data: chats, count, error } = await query.range(from, to);

    if (error) {
      console.error("Avito chats fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({
      chats: chats || [],
      pagination: {
        page: params.page,
        limit: params.limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / params.limit),
      },
    });
  } catch (error) {
    console.error("Avito chats error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
