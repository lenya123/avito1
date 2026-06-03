import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWebSessionForUser } from "@/lib/avito";
import { fetchAvitoOrderProfileDetail } from "@/lib/avito/web-client";
import { parseAvitoOrderDetail } from "@/lib/avito/order-detail-parser";
import { getUserIdFromSession } from "@/lib/avito/resolve-session";

/**
 * POST /api/avito/orders/{avitoOrderId}/refresh-detail
 *
 * В рантайме идёт за свежим состоянием заказа в Avito BeduinUI
 * (m.avito.ru/api/2/profile/order), парсит код отправки / штрихкод / трек
 * возврата / даты — и перезаписывает соответствующие колонки в нашем
 * orders. Затем возвращает только эти поля.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ avitoOrderId: string }> }
) {
  try {
    const userId = await getUserIdFromSession(request);
    if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

    const { avitoOrderId } = await params;
    if (!avitoOrderId) {
      return NextResponse.json({ error: "Нет avito_order_id" }, { status: 400 });
    }

    const webSession = await getWebSessionForUser(userId);
    if (!webSession?.apiKey) {
      return NextResponse.json(
        { error: "Нет apiKey BeduinUI. Сделайте Sync чтобы извлечь токен." },
        { status: 400 }
      );
    }

    const detailRaw = await fetchAvitoOrderProfileDetail(webSession, avitoOrderId);
    if (!detailRaw) {
      return NextResponse.json(
        { error: "Avito не вернул детали заказа (сессия/прокси не отвечают)" },
        { status: 502 }
      );
    }

    const parsed = parseAvitoOrderDetail(detailRaw);

    const supabase = createServiceClient();
    const fields = {
      avito_dispatch_code: parsed.dispatchCode,
      avito_dispatch_barcode_url: parsed.dispatchBarcodeUrl,
      avito_send_till_text: parsed.sellerSendTill,
      avito_delivery_provider_name: parsed.deliveryProviderName,
      avito_return_track: parsed.returnTrackingCode,
      avito_return_barcode_url: parsed.returnBarcodeUrl,
      avito_return_receive_by_text: parsed.returnReceiveBy,
      avito_return_destroy_by_text: parsed.returnDestroyBy,
      avito_return_tracking_url: parsed.returnTrackingUrl,
      avito_return_provider_name: parsed.returnProviderName,
      avito_return_confirm_code_enabled: parsed.returnConfirmCodeEnabled,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("orders")
      .update(fields)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq("avito_order_id", avitoOrderId as any);

    if (error) {
      console.error("[avito/orders/refresh-detail] update error:", error);
      return NextResponse.json({ error: "Не удалось записать обновление" }, { status: 500 });
    }

    return NextResponse.json({ success: true, fields });
  } catch (e) {
    console.error("[avito/orders/refresh-detail] exception:", e);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
