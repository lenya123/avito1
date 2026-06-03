/**
 * API Route для просмотра состояния очереди
 *
 * GET /api/jobs/queue — статистика очереди
 * GET /api/jobs/queue?action=pending — список ожидающих job'ов
 * GET /api/jobs/queue?action=failed — список неудачных job'ов
 */

import { NextRequest, NextResponse } from "next/server";
import { getAutomationQueue } from "@/lib/jobs";

// Защита endpoint
function isAuthorized(request: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const expectedKey = process.env.JOBS_API_SECRET;

    if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
      return false;
    }
  }

  return true;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.REDIS_URL) {
    return NextResponse.json({ error: "REDIS_URL not configured" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    const queue = getAutomationQueue();

    // Базовая статистика
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    const stats = {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };

    // Если запрошен список job'ов
    if (action === "pending" || action === "delayed") {
      const jobs = await queue.getDelayed(0, 50);
      return NextResponse.json({
        stats,
        jobs: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          delay: job.opts.delay,
          processAt: job.opts.delay ? new Date(job.timestamp + job.opts.delay).toISOString() : null,
          attempts: job.attemptsMade,
        })),
      });
    }

    if (action === "failed") {
      const jobs = await queue.getFailed(0, 50);
      return NextResponse.json({
        stats,
        jobs: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attempts: job.attemptsMade,
          finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        })),
      });
    }

    if (action === "active") {
      const jobs = await queue.getActive(0, 50);
      return NextResponse.json({
        stats,
        jobs: jobs.map((job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          attempts: job.attemptsMade,
        })),
      });
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[Jobs Queue API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get queue stats", details: String(error) },
      { status: 500 }
    );
  }
}
