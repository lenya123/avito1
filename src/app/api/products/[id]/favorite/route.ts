import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type SessionData = {
  userId: string;
};

async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session");

  if (!sessionCookie?.value) {
    return null;
  }

  try {
    const decoded = Buffer.from(sessionCookie.value, "base64").toString("utf-8");
    return JSON.parse(decoded) as SessionData;
  } catch {
    return null;
  }
}

// Добавить в избранное
export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase.from("favorites").insert({
      user_id: session.userId,
      product_id: params.id,
    });

    if (error) {
      if (error.code === "23505") {
        // Уже в избранном
        return NextResponse.json({ success: true, isFavorite: true });
      }
      console.error("Favorite add error:", error);
      return NextResponse.json({ error: "Ошибка добавления в избранное" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isFavorite: true });
  } catch (error) {
    console.error("Favorite API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// Удалить из избранного
export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("user_id", session.userId)
      .eq("product_id", params.id);

    if (error) {
      console.error("Favorite remove error:", error);
      return NextResponse.json({ error: "Ошибка удаления из избранного" }, { status: 500 });
    }

    return NextResponse.json({ success: true, isFavorite: false });
  } catch (error) {
    console.error("Favorite API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
