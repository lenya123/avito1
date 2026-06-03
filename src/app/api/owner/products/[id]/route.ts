import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { z } from "zod";
import { getOwnerSession } from "@/lib/auth/session";
import { buildSizeRowsForInsert } from "@/lib/products/one-size";
import { aggregateLoss } from "@/lib/stock/loss";
import { PRODUCT_CATEGORIES } from "@/lib/constants/product-categories";
import { sortSizeEntries } from "@/utils/sizes";
import { aggregateOwnerFinance } from "@/lib/finance/owner-revenue";
import { getLiveCoverUrl } from "@/lib/products/cover";

// GET - получить детали товара
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    // Получаем товар с размерами
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*, product_sizes(id, size, current_quantity, initial_quantity, measurements)")
      .eq("id", id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Привязки партнёров к товару (лестница) — отсортированы по priority.
    type BindingPartner = {
      id: string;
      name: string;
      tg_username: string | null;
      is_active: boolean;
      payment_requisites: unknown;
      warehouse_city: string | null;
      accepts_vibe_debt: boolean;
    };
    const { data: bindingsRaw } = await supabase
      .from("product_partner_bindings")
      .select(
        "id, partner_id, priority, warehouse_kind, commission, partners!inner(id, name, tg_username, is_active, payment_requisites, warehouse_city, accepts_vibe_debt)"
      )
      .eq("product_id", id)
      .is("deleted_at", null)
      .order("priority", { ascending: true });

    const bindingIds = (bindingsRaw ?? []).map((b) => b.id);
    const { data: stockRows } = bindingIds.length
      ? await supabase
          .from("product_partner_size_stock")
          .select("binding_id, size, current_quantity, reserved_quantity")
          .in("binding_id", bindingIds)
      : {
          data: [] as Array<{
            binding_id: string;
            size: string;
            current_quantity: number;
            reserved_quantity: number;
          }>,
        };

    const stockByBinding = new Map<
      string,
      Array<{ size: string; currentQuantity: number; reservedQuantity: number }>
    >();
    for (const row of stockRows ?? []) {
      let arr = stockByBinding.get(row.binding_id);
      if (!arr) {
        arr = [];
        stockByBinding.set(row.binding_id, arr);
      }
      arr.push({
        size: row.size,
        currentQuantity: row.current_quantity,
        reservedQuantity: row.reserved_quantity,
      });
    }

    const bindings = (bindingsRaw ?? []).map((b) => {
      const p = b.partners as unknown as BindingPartner;
      return {
        id: b.id,
        priority: b.priority,
        warehouseKind: b.warehouse_kind as "owner" | "partner",
        commission: Number(b.commission),
        partnerId: b.partner_id,
        partnerName: p?.name ?? "",
        partnerUsername: p?.tg_username ?? null,
        partnerIsActive: !!p?.is_active,
        partnerHasRequisites: !!p?.payment_requisites,
        partnerWarehouseCity: p?.warehouse_city ?? null,
        partnerAcceptsVibeDebt: !!p?.accepts_vibe_debt,
        sizes: stockByBinding.get(b.id) ?? [],
      };
    });

    // Статистика продаж
    const { data: orders } = await supabase
      .from("orders")
      .select(
        "id, status, fault_reason, client_price, purchase_price, shipper_rate_snapshot, partner_id, partner_commission_snapshot, created_at, size"
      )
      .eq("product_id", id);

    // Канон §4.2: paid → collecting → sent (финал отправки).
    // «Продан» = заказ уже учтён в обороте: paid/collecting/sent.
    // «Завершён» = успешно отправлен: sent.
    const SOLD_STATUSES = ["paid", "collecting", "sent"];
    const completedOrders = orders?.filter((o) => o.status === "sent") || [];
    const soldOrders = orders?.filter((o) => SOLD_STATUSES.includes(o.status || "")) || [];

    // «Продано» считаем по заказам (устойчиво к ресток/возвратам), а не
    // initial−current. Разбивка по размеру + темп за последние 30 дней.
    const soldBySize = new Map<string, number>();
    for (const o of soldOrders) {
      if (o.size) soldBySize.set(o.size, (soldBySize.get(o.size) ?? 0) + 1);
    }
    const THIRTY_DAYS_AGO = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const soldLast30 = soldOrders.filter(
      (o) => o.created_at && new Date(o.created_at).getTime() >= THIRTY_DAYS_AGO
    ).length;

    // Выручка/себестоимость/прибыль — единый канон §9.3/§9.4 (один
    // хелпер на все экраны): партнёрский = комиссия; свой = client_price
    // − purchase_price − shipper_rate_snapshot (часть C закрыта 18.05).
    const fin = aggregateOwnerFinance(orders ?? []);
    const sales = {
      total: orders?.length || 0,
      completed: completedOrders.length,
      sold: soldOrders.length,
      soldLast30,
      cancelled: orders?.filter((o) => o.status === "cancelled").length || 0,
      // Возвраты — то же определение, что в карточке клиента
      // (return/return_done/trash), чтобы «возвраты» считались
      // одинаково везде.
      returns:
        orders?.filter((o) => ["return", "return_done", "trash"].includes(o.status || "")).length ||
        0,
      revenue: fin.revenue,
      cost: fin.cost,
      profit: fin.profit,
      revenueCount: fin.count,
      avgPrice: 0,
      firstOrderAt: orders?.length
        ? orders.reduce(
            (earliest: string | null, o) => {
              const d = o.created_at;
              if (!d) return earliest;
              return !earliest || d < earliest ? d : earliest;
            },
            null as string | null
          )
        : null,
    };
    if (sales.revenueCount > 0) {
      sales.avgPrice = Math.round(sales.revenue / sales.revenueCount);
    }

    // Последние заказы (customer_name_snapshot/customer_tg_username_snapshot — денормализованные
    // поля, заполняются триггером orders_snapshot_customer при назначении customer_id).
    const { data: recentOrders } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, client_price, size, created_at, customer_id, customer_name_snapshot, customer_tg_username_snapshot"
      )
      .eq("product_id", id)
      .order("created_at", { ascending: false })
      .limit(10);

    const clientMap: Record<string, string | null> = {};
    recentOrders?.forEach((o) => {
      if (o.customer_id) clientMap[o.customer_id] = o.customer_tg_username_snapshot ?? null;
    });

    const sizes = sortSizeEntries(
      (product.product_sizes as Array<{
        id: string;
        size: string;
        current_quantity: number;
        initial_quantity: number;
        measurements: Record<string, number> | null;
      }>) || []
    );

    // Продажи с адаптивной гранулярностью (день / неделя / месяц)
    const CANCELLED_STATUSES = ["cancelled", "refunded"];
    const allOrders = orders || [];
    const now = new Date();
    now.setHours(23, 59, 59, 999);

    // Находим дату первого заказа (не отменённого)
    let earliestDate: Date | null = null;
    for (const o of allOrders) {
      if (!o.created_at || CANCELLED_STATUSES.includes(o.status || "")) continue;
      const d = new Date(o.created_at);
      if (!earliestDate || d < earliestDate) earliestDate = d;
    }

    let salesChart: Array<{ date: string; count: number }> = [];
    let salesGranularity: "day" | "week" | "month" = "day";

    if (earliestDate) {
      const daySpan = Math.ceil((now.getTime() - earliestDate.getTime()) / 86400000);

      if (daySpan <= 30) {
        salesGranularity = "day";
      } else if (daySpan <= 90) {
        salesGranularity = "week";
      } else {
        salesGranularity = "month";
      }

      // Локальный YYYY-MM-DD (без UTC-сдвига toISOString)
      const toLocalDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

      // Генерируем ключ бакета по дате
      const bucketKey = (date: Date): string => {
        if (salesGranularity === "day") {
          return toLocalDate(date);
        }
        if (salesGranularity === "week") {
          // Понедельник текущей недели
          const d = new Date(date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          d.setDate(diff);
          return toLocalDate(d);
        }
        // month — первое число
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
      };

      // Заполняем пустые бакеты от earliest до now
      const bucketsMap = new Map<string, number>();
      const cursor = new Date(earliestDate);
      cursor.setHours(0, 0, 0, 0);

      // Выравниваем cursor на начало первого бакета
      if (salesGranularity === "week") {
        const day = cursor.getDay();
        cursor.setDate(cursor.getDate() - day + (day === 0 ? -6 : 1));
      } else if (salesGranularity === "month") {
        cursor.setDate(1);
      }

      while (cursor <= now) {
        bucketsMap.set(bucketKey(cursor), 0);
        if (salesGranularity === "day") {
          cursor.setDate(cursor.getDate() + 1);
        } else if (salesGranularity === "week") {
          cursor.setDate(cursor.getDate() + 7);
        } else {
          cursor.setMonth(cursor.getMonth() + 1);
        }
      }

      // Распределяем заказы по бакетам
      for (const o of allOrders) {
        if (!o.created_at || CANCELLED_STATUSES.includes(o.status || "")) continue;
        const key = bucketKey(new Date(o.created_at));
        if (bucketsMap.has(key)) {
          bucketsMap.set(key, (bucketsMap.get(key) || 0) + 1);
        }
      }

      salesChart = Array.from(bucketsMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
    }

    // Недостачи/сверки инвентаризации по товару.
    // Агрегат (сумма) — по ВСЕМ сверкам (единый хелпер). Лента событий —
    // только последние 50 для показа. Раньше limit(50) стоял на агрегате
    // тоже → страница товара показывала недостачу МЕНЬШЕ, чем бейдж в
    // списке, при >50 сверках по товару.
    const [{ data: aggRows }, { data: reconRows }] = await Promise.all([
      supabase
        .from("stock_reconciliations")
        .select("delta, purchase_price_snapshot")
        .eq("product_id", id),
      supabase
        .from("stock_reconciliations")
        .select(
          "size, system_before, counted, delta, purchase_price_snapshot, created_at, reconciled_by"
        )
        .eq("product_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const agg = aggregateLoss(aggRows ?? []);
    const shipperIds = Array.from(
      new Set((reconRows ?? []).map((r) => r.reconciled_by).filter(Boolean))
    ) as string[];
    const shipperNames: Record<string, string> = {};
    if (shipperIds.length > 0) {
      const { data: us } = await supabase.from("users").select("id, name").in("id", shipperIds);
      us?.forEach((u) => {
        shipperNames[u.id] = u.name || "—";
      });
    }
    const reconciliation = {
      lossUnits: agg.units,
      lossRub: Math.round(agg.rub),
      surplusUnits: agg.surplus,
      events: (reconRows ?? []).map((r) => ({
        size: r.size,
        systemBefore: r.system_before,
        counted: r.counted,
        delta: r.delta,
        rub: r.delta > 0 ? Math.round(r.delta * (Number(r.purchase_price_snapshot) || 0)) : 0,
        createdAt: r.created_at,
        by: r.reconciled_by ? (shipperNames[r.reconciled_by] ?? null) : null,
      })),
    };

    // Партии закупок (журнал, §11.5) — по возрастанию номера.
    const { data: batchRows } = await supabase
      .from("product_batches")
      .select("id, batch_number, purchase_price, sizes, created_at")
      .eq("product_id", id)
      .order("batch_number", { ascending: true });
    const batches = (batchRows ?? []).map((b) => ({
      id: b.id,
      batchNumber: b.batch_number,
      purchasePrice: Number(b.purchase_price) || 0,
      createdAt: b.created_at,
      sizes: sortSizeEntries(
        (Array.isArray(b.sizes) ? b.sizes : []) as Array<{
          size_id: string;
          size: string;
          quantity: number;
        }>
      ),
    }));

    // Аватарка товара: живая обложка (avito_media_presets) приоритетна над
    // photo_urls[0] — единый источник, что и меню «Товары». Доп. поле coverUrl,
    // photoUrls оставляем как fallback на клиенте.
    const coverUrl = await getLiveCoverUrl(supabase, id);

    return NextResponse.json({
      product: {
        id: product.id,
        name: product.name,
        category: product.category,
        description: product.description,
        purchasePrice: product.purchase_price,
        dropPrice: product.drop_price,
        recommendedPrice: product.recommended_price,
        photoUrls: product.photo_urls || [],
        coverUrl,
        isPremium: product.is_premium,
        isActive: product.is_active,
        isInStock: product.is_in_stock,
        expectedArrivalDate: product.expected_arrival_date,
        // Замеры теперь на уровне product_sizes[].measurements (Stage 2.5).
        // Для обратной совместимости оставляем поле, но оно всегда null.
        measurements: null,
        locationCity: product.location_city,
        createdAt: product.created_at,
        updatedAt: product.updated_at,
        sizes: sizes.map((s) => ({
          id: s.id,
          size: s.size,
          currentQuantity: s.current_quantity,
          initialQuantity: s.initial_quantity,
          sold: soldBySize.get(s.size) ?? 0,
          measurements: (s.measurements ?? {}) as Record<string, number>,
        })),
        totalStock: sizes.reduce((sum, s) => sum + s.current_quantity, 0),
        totalInitial: sizes.reduce((sum, s) => sum + s.initial_quantity, 0),
        bindings,
      },
      sales,
      recentOrders:
        recentOrders?.map((o) => ({
          id: o.id,
          orderNumber: o.order_number,
          status: o.status,
          price: o.client_price,
          size: o.size,
          createdAt: o.created_at,
          clientUsername: o.customer_tg_username_snapshot ?? null,
        })) || [],
      salesChart,
      salesGranularity,
      reconciliation,
      batches,
    });
  } catch (error) {
    console.error("Product detail API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// PATCH - обновить товар
const bindingPatchSchema = z.object({
  // id привязки если она уже существует, или null/undefined для новой
  id: z.string().uuid().nullable().optional(),
  partnerId: z.string().uuid(),
  warehouseKind: z.enum(["owner", "partner"]),
  commission: z.number().min(0).max(1_000_000),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        currentQuantity: z.number().int().min(0),
      })
    )
    .default([]),
});

const updateProductSchema = z.object({
  name: z.string().min(1).optional(),
  category: z.enum(PRODUCT_CATEGORIES).nullable().optional(),
  description: z.string().nullable().optional(),
  purchasePrice: z.number().min(0).optional(),
  dropPrice: z.number().min(0).optional(),
  recommendedPrice: z.number().nullable().optional(),
  photoUrls: z.array(z.string()).optional(),
  isPremium: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isInStock: z.boolean().optional(),
  expectedArrivalDate: z.string().nullable().optional(),
  measurements: z.record(z.string(), z.string()).nullable().optional(),
  locationCity: z.string().trim().min(1, "Город обязателен").max(64).optional(),
  sizes: z
    .array(
      z.object({
        size: z.string().min(1),
        quantity: z.number().min(0),
      })
    )
    .optional(),
  oneSizeQuantity: z.number().int().min(0).optional(),
  // Замеры пер-размер (§11.6): [{ size, measurements }]. Применяется
  // ПОСЛЕ replace_product_sizes (ключ — строка размера).
  sizeMeasurements: z
    .array(
      z.object({
        size: z.string().min(1),
        measurements: z.record(z.string(), z.number()),
      })
    )
    .optional(),
  // Лестница привязок партнёров. Полное состояние — порядок в массиве = priority.
  // Если не передано — лестницу не трогаем.
  bindings: z.array(bindingPatchSchema).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const data = updateProductSchema.parse(body);

    const supabase = createServiceClient();

    // Single-tenant: все products принадлежат владельцу (seller_id дропнут в Stage 1).
    const { data: existing, error: existError } = await supabase
      .from("products")
      .select("id")
      .eq("id", id)
      .single();

    if (existError || !existing) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Формируем данные обновления
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.purchasePrice !== undefined) updateData.purchase_price = data.purchasePrice;
    if (data.dropPrice !== undefined) updateData.drop_price = data.dropPrice;
    if (data.recommendedPrice !== undefined) updateData.recommended_price = data.recommendedPrice;
    if (data.photoUrls !== undefined) updateData.photo_urls = data.photoUrls;
    if (data.isPremium !== undefined) updateData.is_premium = data.isPremium;
    if (data.isActive !== undefined) updateData.is_active = data.isActive;
    if (data.isInStock !== undefined) updateData.is_in_stock = data.isInStock;
    if (data.expectedArrivalDate !== undefined)
      updateData.expected_arrival_date = data.expectedArrivalDate;
    // measurements теперь на уровне product_sizes (Stage 2.5), на products колонки нет.
    void data.measurements;
    if (data.locationCity !== undefined) updateData.location_city = data.locationCity;

    // Обновляем товар
    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabase
        .from("products")
        .update(updateData)
        .eq("id", id);
      if (updateError) {
        console.error("Product update error:", updateError);
        return NextResponse.json({ error: "Ошибка обновления" }, { status: 500 });
      }
    }

    // Обновляем размеры (если переданы и реально изменились). RPC
    // `replace_product_sizes` v2 (миграция 20260502000040) — UPSERT по
    // (product_id, size): обновляет существующие, вставляет новые, DELETE
    // только orphan-размеров без ссылок из orders/pending_orders. FK-блока
    // при смене количества/флагов больше НЕТ (изменение существующего
    // размера = UPDATE, без DELETE). Пропуск вызова ниже — лишь оптимизация
    // (не дёргать RPC когда форма прислала набор без изменений).
    // Нюанс: buildSizeRowsForInsert ставит initial=current=qty, поэтому
    // правка количества через форму перезаписывает и initial_quantity
    // (исторический baseline). Секция «Склад и темп» это больше не ломает
    // (продано считается по заказам), но baseline сбрасывается — см. handoff.
    if (data.sizes !== undefined) {
      const { data: currentSizes } = await supabase
        .from("product_sizes")
        .select("size, initial_quantity, current_quantity")
        .eq("product_id", id);

      const fallbackQty = data.oneSizeQuantity ?? 0;
      const sizesData = buildSizeRowsForInsert(id, data.sizes, fallbackQty);

      const norm = (
        rows: Array<{ size: string; initial_quantity: number; current_quantity: number }>
      ) =>
        rows
          .map((s) => `${s.size}:${s.initial_quantity}:${s.current_quantity}`)
          .sort()
          .join("|");
      const sameSizes = norm(currentSizes ?? []) === norm(sizesData);

      if (!sameSizes) {
        const { error: rpcError } = await supabase.rpc("replace_product_sizes", {
          p_product_id: id,
          p_sizes: sizesData,
        });
        if (rpcError) {
          console.error("Sizes replace error:", rpcError);
          return NextResponse.json({ error: "Ошибка обновления размеров" }, { status: 500 });
        }

        // §11.1 фикс (#2 хвост): size-editor правит остаток через
        // replace_product_sizes (UPSERT по size). Это единственный путь
        // рестока, не подключённый к auto-resume (триггер
        // notify_size_quantity_restored шлёт pg_notify в мёртвый канал —
        // LISTEN-консьюмера нет; реальный механизм = явный
        // scheduleAutoResumeProblem, как в stock/batches-роутах). Будим
        // висящие problem(out_of_stock) ТОЛЬКО для размеров, реально
        // ушедших 0→>0 (точно условие триггера); по новым id размеров.
        const prevQtyBySize = new Map(
          (currentSizes ?? []).map((s) => [s.size, Number(s.current_quantity) || 0])
        );
        const raisedSizes = sizesData
          .filter((s) => Number(s.current_quantity) > 0 && (prevQtyBySize.get(s.size) ?? 0) <= 0)
          .map((s) => s.size);
        if (raisedSizes.length > 0) {
          const { data: postRows } = await supabase
            .from("product_sizes")
            .select("id, size, current_quantity")
            .eq("product_id", id)
            .in("size", raisedSizes);
          const toResume = (postRows ?? []).filter((r) => Number(r.current_quantity) > 0);
          if (toResume.length > 0) {
            try {
              const { scheduleAutoResumeProblem } = await import("@/lib/jobs");
              for (const r of toResume) {
                await scheduleAutoResumeProblem(r.id).catch((e) =>
                  console.error("[owner-product-sizes] scheduleAutoResumeProblem failed:", e)
                );
              }
            } catch (e) {
              console.error("[owner-product-sizes] scheduleAutoResumeProblem import failed:", e);
            }
          }
        }
      }
    }

    // Замеры пер-размер (§11.6) — ПОСЛЕ replace_product_sizes (ключ = размер).
    if (data.sizeMeasurements !== undefined) {
      const { error: mErr } = await supabase.rpc("set_product_size_measurements", {
        p_product_id: id,
        p_data: data.sizeMeasurements,
      });
      if (mErr) {
        console.error("set_product_size_measurements error:", mErr);
        return NextResponse.json({ error: "Ошибка сохранения замеров" }, { status: 500 });
      }
    }

    // Обновляем лестницу привязок партнёров (если передана).
    // Семантика: data.bindings — полное состояние; чего нет в массиве — soft-delete.
    if (data.bindings !== undefined) {
      // Уникальность партнёров.
      const partnerIds = data.bindings.map((b) => b.partnerId);
      const uniq = new Set(partnerIds);
      if (uniq.size !== partnerIds.length) {
        return NextResponse.json(
          { error: "Один партнёр указан в лестнице несколько раз" },
          { status: 400 }
        );
      }

      // Валидация партнёров.
      if (partnerIds.length > 0) {
        const { data: partners } = await supabase
          .from("partners")
          .select("id, is_active, tg_user_id, payment_requisites")
          .in("id", partnerIds);

        for (const b of data.bindings) {
          const p = (partners ?? []).find((x) => x.id === b.partnerId);
          if (!p || !p.is_active) {
            return NextResponse.json(
              { error: "Партнёр не найден или деактивирован" },
              { status: 400 }
            );
          }
          if (!p.tg_user_id) {
            return NextResponse.json(
              { error: "Партнёр ещё не привязан к Telegram-боту" },
              { status: 400 }
            );
          }
          if (b.warehouseKind === "partner" && !p.payment_requisites) {
            return NextResponse.json(
              { error: "У партнёра нет реквизитов — он не сможет получать оплату" },
              { status: 400 }
            );
          }
        }
      }

      // Текущие живые привязки.
      const { data: existingBindings } = await supabase
        .from("product_partner_bindings")
        .select("id, partner_id")
        .eq("product_id", id)
        .is("deleted_at", null);

      const existingByPartnerId = new Map(
        (existingBindings ?? []).map((b) => [b.partner_id, b.id] as const)
      );
      const incomingPartnerIds = new Set(partnerIds);
      const nowIso = new Date().toISOString();

      // Soft-delete привязок которые исчезли из массива.
      const toDelete = (existingBindings ?? [])
        .filter((b) => !incomingPartnerIds.has(b.partner_id))
        .map((b) => b.id);
      if (toDelete.length > 0) {
        const { error: delError } = await supabase
          .from("product_partner_bindings")
          .update({ deleted_at: nowIso })
          .in("id", toDelete);
        if (delError) {
          console.error("Bindings soft-delete error:", delError);
          return NextResponse.json({ error: "Ошибка удаления привязки" }, { status: 500 });
        }
      }

      // UPSERT/INSERT привязок + UPSERT стока.
      for (let i = 0; i < data.bindings.length; i++) {
        const b = data.bindings[i];
        const priority = i + 1;
        let bindingId: string | null = existingByPartnerId.get(b.partnerId) ?? null;

        if (bindingId) {
          // UPDATE существующей.
          const { error: updError } = await supabase
            .from("product_partner_bindings")
            .update({
              priority,
              warehouse_kind: b.warehouseKind,
              commission: b.commission,
              updated_at: nowIso,
            })
            .eq("id", bindingId);
          if (updError) {
            console.error("Binding update error:", updError);
            return NextResponse.json({ error: "Ошибка обновления привязки" }, { status: 500 });
          }
        } else {
          // INSERT новой.
          const { data: inserted, error: insError } = await supabase
            .from("product_partner_bindings")
            .insert({
              product_id: id,
              partner_id: b.partnerId,
              priority,
              warehouse_kind: b.warehouseKind,
              commission: b.commission,
            })
            .select("id")
            .single();
          if (insError || !inserted) {
            console.error("Binding insert error:", insError);
            return NextResponse.json({ error: "Ошибка создания привязки" }, { status: 500 });
          }
          bindingId = inserted.id;
        }

        // UPSERT стока. Размеры которых нет в data.sizes — удаляем (если на них нет
        // ссылок из orders/pending; FK-блок защитит).
        const incomingSizes = new Set(b.sizes.map((s) => s.size));
        if (incomingSizes.size > 0) {
          const stockRows = b.sizes.map((s) => ({
            binding_id: bindingId as string,
            size: s.size,
            current_quantity: s.currentQuantity,
          }));
          const { error: stockError } = await supabase
            .from("product_partner_size_stock")
            .upsert(stockRows, { onConflict: "binding_id,size" });
          if (stockError) {
            console.error("Stock upsert error:", stockError);
            return NextResponse.json({ error: "Ошибка обновления стока" }, { status: 500 });
          }
        }

        const { data: currentStock } = await supabase
          .from("product_partner_size_stock")
          .select("size")
          .eq("binding_id", bindingId);
        const orphanSizes = (currentStock ?? [])
          .map((s) => s.size)
          .filter((s) => !incomingSizes.has(s));
        if (orphanSizes.length > 0) {
          await supabase
            .from("product_partner_size_stock")
            .delete()
            .eq("binding_id", bindingId)
            .in("size", orphanSizes);
        }
      }
    }

    // Логируем
    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_updated",
      entity_type: "product",
      entity_id: id,
      details: {
        updatedFields: Object.keys(updateData),
        bindingsTouched: data.bindings !== undefined,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Неверные данные", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("Product update API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}

// DELETE - деактивировать товар
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const { id } = await params;
    const supabase = createServiceClient();

    const { data: product, error: productError } = await supabase
      .from("products")
      .select("id, name")
      .eq("id", id)
      .single();

    if (productError || !product) {
      return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
    }

    // Soft-delete — помечаем как удалённый, заказы остаются нетронутыми
    const { error: deleteError } = await supabase
      .from("products")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);

    if (deleteError) {
      console.error("Product delete error:", deleteError);
      return NextResponse.json({ error: "Ошибка удаления" }, { status: 500 });
    }

    await supabase.from("activity_log").insert({
      user_id: session.userId,
      action: "product_deleted",
      entity_type: "product",
      entity_id: id,
      details: { name: product.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Product delete API error:", error);
    return NextResponse.json({ error: "Ошибка сервера" }, { status: 500 });
  }
}
