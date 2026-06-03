/**
 * Helper: подгружает контактные данные для DM при возврате/отмене партнёрского
 * заказа. Используется и в shipper-actions (`executeCompleteReturn`), и в
 * card-actions (`cancelOrder`).
 *
 * Возвращает:
 *   • partnerLabel — то что показываем клиенту (`@username` или имя партнёра).
 *   • customerLabel — то что показываем партнёру (`@username` или имя клиента).
 *   • supportUsername — `business_settings.support_telegram_username` для
 *     обоих DM, чтобы и клиент, и партнёр имели контакт нашей поддержки на
 *     случай некорректного поведения второй стороны.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.generated";

type Supabase = SupabaseClient<Database>;

export interface PartnerRefundContext {
  partnerLabel: string;
  customerLabel: string;
  supportUsername: string | null;
}

export async function resolvePartnerRefundContext(
  supabase: Supabase,
  partnerId: string,
  customerId: string
): Promise<PartnerRefundContext | null> {
  const [{ data: partner }, { data: customer }, { data: settings }] = await Promise.all([
    supabase.from("partners").select("name, tg_username").eq("id", partnerId).maybeSingle(),
    supabase.from("customers").select("name, telegram_username").eq("id", customerId).maybeSingle(),
    supabase.from("business_settings").select("support_telegram_username").limit(1).maybeSingle(),
  ]);

  if (!partner || !customer) return null;

  const partnerLabel = partner.tg_username
    ? `@${partner.tg_username.replace(/^@/, "")}`
    : (partner.name ?? "партнёр");
  const customerLabel = customer.telegram_username
    ? `@${customer.telegram_username.replace(/^@/, "")}`
    : (customer.name ?? "клиент");
  const supportUsername = (settings?.support_telegram_username as string | null) ?? null;

  return { partnerLabel, customerLabel, supportUsername };
}
