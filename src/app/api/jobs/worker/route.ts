/**
 * API Route для управления BullMQ Worker
 *
 * GET /api/jobs/worker — статус воркера
 * POST /api/jobs/worker — запуск воркера (для dev)
 * DELETE /api/jobs/worker — остановка воркера
 *
 * В production воркер запускается отдельным процессом
 */

import { NextRequest, NextResponse } from "next/server";
import { startWorker, stopWorker, isWorkerRunning, getWorkerStats } from "@/lib/jobs";

// Защита endpoint — только для внутреннего использования
function isAuthorized(request: NextRequest): boolean {
  // В production требуем секретный ключ
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.JOBS_API_SECRET;

    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return false;
    }
  }

  return true;
}

// GET — статус воркера
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const stats = await getWorkerStats();

  return NextResponse.json({
    running: isWorkerRunning(),
    stats,
    env: process.env.NODE_ENV,
    redisConfigured: !!process.env.REDIS_URL,
  });
}

// POST — запуск воркера
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ error: "REDIS_URL not configured" }, { status: 500 });
  }

  if (isWorkerRunning()) {
    return NextResponse.json({
      success: true,
      message: "Worker already running",
      running: true,
    });
  }

  try {
    startWorker();

    return NextResponse.json({
      success: true,
      message: "Worker started",
      running: true,
    });
  } catch (error) {
    console.error("[Jobs API] Failed to start worker:", error);
    return NextResponse.json(
      { error: "Failed to start worker", details: String(error) },
      { status: 500 }
    );
  }
}

// DELETE — остановка воркера
export async function DELETE(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isWorkerRunning()) {
    return NextResponse.json({
      success: true,
      message: "Worker not running",
      running: false,
    });
  }

  try {
    await stopWorker();

    return NextResponse.json({
      success: true,
      message: "Worker stopped",
      running: false,
    });
  } catch (error) {
    console.error("[Jobs API] Failed to stop worker:", error);
    return NextResponse.json(
      { error: "Failed to stop worker", details: String(error) },
      { status: 500 }
    );
  }
}
