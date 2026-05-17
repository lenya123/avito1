import { NextRequest, NextResponse } from "next/server";
import { createAvitoClientForSession } from "@/lib/avito";
import { getUserIdFromSession, resolveSession } from "@/lib/avito/resolve-session";

// GET — профиль автозагрузки + последний отчёт
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
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const [profileResult, reportsResult] = await Promise.all([
      client.getAutoloadProfile(),
      client.getAutoloadReports(),
    ]);

    return NextResponse.json({
      profile: profileResult.success ? profileResult.data : null,
      reports: reportsResult.success ? reportsResult.data : null,
      errors: {
        profile: profileResult.success ? null : "Не удалось загрузить профиль",
        reports: reportsResult.success ? null : "Не удалось загрузить отчёты",
      },
    });
  } catch (error) {
    console.error("Avito autoload GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// POST — загрузить файл автозагрузки (XML/CSV)
export async function POST(request: NextRequest) {
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "Файл обязателен" }, { status: 400 });
    }

    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "Максимальный размер файла 50 МБ" }, { status: 400 });
    }

    const client = await createAvitoClientForSession(session.id);
    if (!client) {
      return NextResponse.json({ error: "Avito клиент недоступен" }, { status: 500 });
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await client.uploadAutoloadFile(fileBuffer, file.name);

    if (!result.success) {
      console.error("[Avito Autoload] Upload error:", result.error);
      return NextResponse.json(
        { error: "Не удалось загрузить файл автозагрузки" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Avito autoload POST error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
