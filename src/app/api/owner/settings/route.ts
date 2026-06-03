import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";

const ALL_FIELDS = [
  "first_order_discount",
  "reservation_timeout_minutes",
  "return_to_trash_days",
  "trash_to_disposed_days",
  "stats_window_days",
  "daily_goal",
  "daily_goal_bonus",
  "streak_multiplier_3",
  "streak_multiplier_7",
  "streak_keep_threshold",
  "shipper_rate",
  "shipper_fixed_rate",
  "shipper_payment_mode",
  "shipper_penalty_rate",
  "pendulum_rate_min",
  "pendulum_rate_base",
  "pendulum_rate_max",
  "pendulum_speed_target_hours",
  "pendulum_avg_window_days",
  "min_work_days",
  "owner_telegram_username",
  "support_telegram_username",
  "monthly_profit_target",
  "default_location_city",
  "payout_cadence",
  "payout_weekday",
  "payout_reserve_days",
  "updated_at",
].join(", ");

/** GET — owner gets all settings */
export async function GET(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const supabase = createServiceClient();
    const [settingsRes, businessRes] = await Promise.all([
      supabase.from("settings").select(ALL_FIELDS).single(),
      // Из business_settings UI показывает +ВАЙБ-поля и расписание digest'ов.
      // business_name / payment_requisites_message / licence_expires_at живут в БД
      // без UI (customer-bot в Stage 3 читает их напрямую).
      supabase
        .from("business_settings")
        .select(
          "vibe_credit_default_limit, vibe_receipt_confirm_threshold, " +
            "director_notify_window_start, director_notify_window_end, director_digest_step_hours, " +
            "partner_notify_window_start, partner_notify_window_end, partner_digest_step_hours"
        )
        .limit(1)
        .maybeSingle(),
    ]);

    if (settingsRes.error) {
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    const s = settingsRes.data as unknown as Record<string, unknown>;
    const b = (businessRes.data ?? {}) as unknown as Record<string, unknown>;
    // Канон §9.5/9.6 — 2 режима. Нормализуем любое не-fixed → pendulum
    // (защита от хвостов dynamic/per_order; миграция данных — ..120).
    const paymentModeNorm: "pendulum" | "fixed" =
      (s.shipper_payment_mode as string) === "fixed" ? "fixed" : "pendulum";
    return NextResponse.json({
      // Orders & clients
      firstOrderDiscount: (s.first_order_discount as number) ?? 500,
      reservationTimeoutMinutes: (s.reservation_timeout_minutes as number) ?? 10,
      // Returns
      returnToTrashDays: (s.return_to_trash_days as number) ?? 14,
      trashToDisposedDays: (s.trash_to_disposed_days as number) ?? 30,
      // Shipper streaks
      dailyGoal: (s.daily_goal as number) ?? 5,
      dailyGoalBonus: (s.daily_goal_bonus as number) ?? 100,
      streakMultiplier3: (s.streak_multiplier_3 as number) ?? 1.2,
      streakMultiplier7: (s.streak_multiplier_7 as number) ?? 1.5,
      streakKeepThreshold: (s.streak_keep_threshold as number) ?? 3,
      // Shipper payment
      shipperRate: (s.shipper_rate as number) ?? 150,
      shipperFixedRate: (s.shipper_fixed_rate as number) ?? 100,
      fixedRate: (s.shipper_fixed_rate as number) ?? 100,
      shipperPaymentMode: paymentModeNorm,
      paymentMode: paymentModeNorm,
      penaltyRate: (s.shipper_penalty_rate as number) ?? 0,
      // Pendulum
      rateMin: (s.pendulum_rate_min as number) ?? 100,
      rateBase: (s.pendulum_rate_base as number) ?? 150,
      rateMax: (s.pendulum_rate_max as number) ?? 250,
      speedTargetHours: (s.pendulum_speed_target_hours as number) ?? 24,
      avgWindowDays: (s.pendulum_avg_window_days as number) ?? 7,
      minWorkDays: (s.min_work_days as number) ?? 4,
      // Analytics
      statsWindowDays: (s.stats_window_days as number) ?? 30,
      // Goals
      monthlyProfitTarget: (s.monthly_profit_target as number) ?? 500000,
      // Contacts
      ownerTelegramUsername: (s.owner_telegram_username as string) ?? "",
      supportTelegramUsername: (s.support_telegram_username as string) ?? "",
      // Location
      defaultLocationCity: (s.default_location_city as string) ?? "",
      // Payouts
      payoutCadence: (s.payout_cadence as string) ?? "weekly",
      payoutWeekday: (s.payout_weekday as number) ?? 1,
      payoutReserveDays: (s.payout_reserve_days as number) ?? 0,
      // Business (business_settings).
      vibeCreditDefaultLimit: Number(b.vibe_credit_default_limit ?? 0),
      vibeReceiptConfirmThreshold:
        b.vibe_receipt_confirm_threshold != null ? Number(b.vibe_receipt_confirm_threshold) : null,
      // Расписание digest-уведомлений (handler решает каждый час).
      directorNotifyWindowStart: ((b.director_notify_window_start as string) ?? "10:00:00").slice(
        0,
        5
      ),
      directorNotifyWindowEnd: ((b.director_notify_window_end as string) ?? "22:00:00").slice(0, 5),
      directorDigestStepHours: Number(b.director_digest_step_hours ?? 3),
      partnerNotifyWindowStart: ((b.partner_notify_window_start as string) ?? "10:00:00").slice(
        0,
        5
      ),
      partnerNotifyWindowEnd: ((b.partner_notify_window_end as string) ?? "22:00:00").slice(0, 5),
      partnerDigestStepHours: Number(b.partner_digest_step_hours ?? 3),
      trumpetNotifyWindowStart: ((b.trumpet_notify_window_start as string) ?? "10:00:00").slice(
        0,
        5
      ),
      trumpetNotifyWindowEnd: ((b.trumpet_notify_window_end as string) ?? "21:00:00").slice(0, 5),
      // Meta
      updatedAt: s.updated_at as string | null,
    });
  } catch (error) {
    console.error("Owner settings GET error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

const updateSchema = z.object({
  firstOrderDiscount: z.number().min(0).optional(),
  reservationTimeoutMinutes: z.number().int().min(1).max(120).optional(),
  returnToTrashDays: z.number().int().min(1).max(90).optional(),
  trashToDisposedDays: z.number().int().min(1).max(365).optional(),
  dailyGoal: z.number().int().min(1).max(100).optional(),
  dailyGoalBonus: z.number().min(0).optional(),
  streakMultiplier3: z.number().min(1).max(5).optional(),
  streakMultiplier7: z.number().min(1).max(5).optional(),
  streakKeepThreshold: z.number().int().min(1).max(30).optional(),
  shipperRate: z.number().min(0).optional(),
  shipperFixedRate: z.number().min(0).optional(),
  fixedRate: z.number().min(0).optional(),
  shipperPaymentMode: z.enum(["pendulum", "fixed"]).optional(),
  paymentMode: z.enum(["pendulum", "fixed"]).optional(),
  shipperPenaltyRate: z.number().min(0).optional(),
  penaltyRate: z.number().min(0).optional(),
  rateMin: z.number().positive().optional(),
  rateBase: z.number().positive().optional(),
  rateMax: z.number().positive().optional(),
  speedTargetHours: z.number().min(24).max(168).optional(),
  avgWindowDays: z.number().int().min(1).max(30).optional(),
  minWorkDays: z.number().int().min(1).max(7).optional(),
  statsWindowDays: z.number().int().min(1).max(365).optional(),
  monthlyProfitTarget: z.number().int().min(0).max(100000000).optional(),
  ownerTelegramUsername: z.string().max(64).optional(),
  supportTelegramUsername: z.string().max(64).optional(),
  defaultLocationCity: z.string().max(100).optional(),
  payoutCadence: z.enum(["weekly", "biweekly", "monthly"]).optional(),
  payoutWeekday: z.number().int().min(1).max(7).optional(),
  payoutReserveDays: z.number().int().min(0).max(60).optional(),
  // business_settings.
  vibeCreditDefaultLimit: z.number().min(0).max(10_000_000).optional(),
  vibeReceiptConfirmThreshold: z.number().min(0).max(10_000_000).nullable().optional(),
  // Расписание digest-уведомлений. Принимаем "HH:MM" из time-input UI.
  directorNotifyWindowStart: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
  directorNotifyWindowEnd: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
  directorDigestStepHours: z.number().int().min(1).max(12).optional(),
  partnerNotifyWindowStart: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
  partnerNotifyWindowEnd: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
  partnerDigestStepHours: z.number().int().min(1).max(12).optional(),
  trumpetNotifyWindowStart: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
  trumpetNotifyWindowEnd: z
    .string()
    .regex(/^([0-1]\d|2[0-3]):[0-5]\d$/, "Время в формате ЧЧ:ММ")
    .optional(),
});

const settingsFieldMap: Record<string, string> = {
  firstOrderDiscount: "first_order_discount",
  reservationTimeoutMinutes: "reservation_timeout_minutes",
  returnToTrashDays: "return_to_trash_days",
  trashToDisposedDays: "trash_to_disposed_days",
  dailyGoal: "daily_goal",
  dailyGoalBonus: "daily_goal_bonus",
  streakMultiplier3: "streak_multiplier_3",
  streakMultiplier7: "streak_multiplier_7",
  streakKeepThreshold: "streak_keep_threshold",
  shipperRate: "shipper_rate",
  shipperFixedRate: "shipper_fixed_rate",
  fixedRate: "shipper_fixed_rate",
  shipperPaymentMode: "shipper_payment_mode",
  paymentMode: "shipper_payment_mode",
  shipperPenaltyRate: "shipper_penalty_rate",
  penaltyRate: "shipper_penalty_rate",
  rateMin: "pendulum_rate_min",
  rateBase: "pendulum_rate_base",
  rateMax: "pendulum_rate_max",
  speedTargetHours: "pendulum_speed_target_hours",
  avgWindowDays: "pendulum_avg_window_days",
  minWorkDays: "min_work_days",
  statsWindowDays: "stats_window_days",
  monthlyProfitTarget: "monthly_profit_target",
  ownerTelegramUsername: "owner_telegram_username",
  supportTelegramUsername: "support_telegram_username",
  defaultLocationCity: "default_location_city",
  payoutCadence: "payout_cadence",
  payoutWeekday: "payout_weekday",
  payoutReserveDays: "payout_reserve_days",
};

const businessFieldMap: Record<string, string> = {
  vibeCreditDefaultLimit: "vibe_credit_default_limit",
  vibeReceiptConfirmThreshold: "vibe_receipt_confirm_threshold",
  directorNotifyWindowStart: "director_notify_window_start",
  directorNotifyWindowEnd: "director_notify_window_end",
  directorDigestStepHours: "director_digest_step_hours",
  partnerNotifyWindowStart: "partner_notify_window_start",
  partnerNotifyWindowEnd: "partner_notify_window_end",
  partnerDigestStepHours: "partner_digest_step_hours",
  trumpetNotifyWindowStart: "trumpet_notify_window_start",
  trumpetNotifyWindowEnd: "trumpet_notify_window_end",
};

/** PATCH — owner updates settings */
export async function PATCH(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const supabase = createServiceClient();
    const settingsUpdate: Record<string, unknown> = {};
    const businessUpdate: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue;
      if (settingsFieldMap[key]) settingsUpdate[settingsFieldMap[key]] = value;
      else if (businessFieldMap[key]) businessUpdate[businessFieldMap[key]] = value;
    }

    if (Object.keys(settingsUpdate).length === 0 && Object.keys(businessUpdate).length === 0) {
      return NextResponse.json({ error: "Нет данных" }, { status: 400 });
    }

    if (Object.keys(settingsUpdate).length > 0) {
      settingsUpdate.updated_at = new Date().toISOString();
      const { error } = await supabase
        .from("settings")
        .update(settingsUpdate)
        .not("id", "is", null);
      if (error) {
        console.error("Owner settings update error:", error);
        return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
      }
    }

    if (Object.keys(businessUpdate).length > 0) {
      const { error } = await supabase
        .from("business_settings")
        .update(businessUpdate)
        .not("id", "is", null);
      if (error) {
        console.error("Owner business_settings update error:", error);
        return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error("Owner settings PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
