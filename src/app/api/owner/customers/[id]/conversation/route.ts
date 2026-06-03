import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/session";

// GET /api/owner/customers/[id]/conversation — последние N сообщений истории диалога.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { id } = await params;
    const supabase = createServiceClient();
    const limit = Math.min(Number(request.nextUrl.searchParams.get("limit") ?? 50), 200);

    const { data: rows, error } = await supabase
      .from("customer_conversations")
      .select("id, role, content, metadata, created_at")
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Conversation fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    return NextResponse.json({
      messages: (rows || []).reverse().map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        metadata: m.metadata,
        createdAt: m.created_at,
      })),
    });
  } catch (error) {
    console.error("Conversation API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
