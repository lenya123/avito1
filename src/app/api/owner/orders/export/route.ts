import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import ExcelJS from "exceljs";
import { getOwnerSession } from "@/lib/auth/session";
import { applyOrderFilters, type OrdersServiceFilters } from "@/lib/services/orders";
import { ownerRevenue, ownerCost, ownerProfit } from "@/lib/finance/owner-revenue";
import { isRevenueCounted } from "@/lib/constants/pricing";
import { DELIVERY_SERVICE_LABELS } from "@/lib/constants/order-status";

// --- Auth ---

// --- Label maps ---

// Канон §4.2: paid → collecting → sent + return → return_done + cancelled/problem/trash.
const STATUS_MAP: Record<string, string> = {
  paid: "ОПЛАЧЕН",
  collecting: "СОБИРАЕТСЯ",
  sent: "ОТПРАВЛЕН",
  return: "ВОЗВРАТ",
  return_done: "ВОЗВРАТ ПРИНЯТ",
  cancelled: "ОТМЕНА",
  problem: "ПРОБЛЕМА",
  trash: "В КОРЗИНЕ",
};

// Лейблы служб доставки — единый источник §справочник (был локальный
// DELIVERY_MAP с расхождениями: «Авито» vs «Авито Доставка»).
const DELIVERY_MAP = DELIVERY_SERVICE_LABELS;

const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

// --- Colors ---

const C = {
  headerBg: "00FF00",
  sectionBg: "00FFFF",
  pinkBg: "FF00FF",
  black: "000000",
  green: "008000",
  red: "FF0000",
  borderColor: "000000",
};

const FONT = "Arial";

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: C.borderColor } },
  bottom: { style: "thin", color: { argb: C.borderColor } },
  left: { style: "thin", color: { argb: C.borderColor } },
  right: { style: "thin", color: { argb: C.borderColor } },
};

function headerCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
  cell.font = { name: FONT, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function cyanCell(cell: ExcelJS.Cell, fontSize?: number) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sectionBg } };
  cell.font = { name: FONT, size: fontSize || 14, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function pinkCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.pinkBg } };
  cell.font = { name: FONT, size: 14, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function boldCell(cell: ExcelJS.Cell, color?: string) {
  cell.font = { name: FONT, bold: true, color: { argb: color || C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

function formatRub(v: number) {
  return new Intl.NumberFormat("ru-RU").format(v) + " ₽";
}

// --- Columns ---

const COLUMNS = [
  { header: "№", width: 8 },
  { header: "ДАТА", width: 12 },
  { header: "МОДЕЛЬ", width: 22 },
  { header: "РАЗМЕР", width: 10 },
  { header: "КЛИЕНТ", width: 16 },
  { header: "ЗАКУПКА", width: 13 },
  { header: "ЦЕНА КЛИЕНТА", width: 13 },
  { header: "МАРЖА", width: 13 },
  { header: "СТАТУС", width: 17 },
  { header: "ДОСТАВКА", width: 14 },
  { header: "ТРЕК-НОМЕР", width: 22 },
  { header: "ДЕДЛАЙН", width: 12 },
];

const COL = {
  PURCHASE: 6,
  CLIENT_PRICE: 7,
  MARGIN: 8,
};

// --- Statuses ---

// Канон §4.2. sent — финал успешной отправки, не «активный».
const ACTIVE_STATUSES = ["paid", "collecting", "problem"];
const RETURN_STATUSES = ["return", "return_done"];
const NEGATIVE_STATUSES = ["cancelled", "trash"];

// --- POST handler ---

export async function POST(request: NextRequest) {
  try {
    const session = await getOwnerSession(request);
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    // Экспорт выгружает ровно то, что отфильтровано на странице «Заказы»
    // (статус/служба/даты/поиск/клиент/товар) — единый хелпер с listOrders.
    // orderIds оставлен опциональным fallback'ом (legacy-совместимость).
    const orderIds: string[] | undefined = Array.isArray(body.orderIds) ? body.orderIds : undefined;
    const filters: OrdersServiceFilters = {
      status: typeof body.status === "string" ? body.status : undefined,
      search: typeof body.search === "string" ? body.search : undefined,
      clientId: typeof body.clientId === "string" ? body.clientId : undefined,
      productId: typeof body.productId === "string" ? body.productId : undefined,
      deliveryService: typeof body.deliveryService === "string" ? body.deliveryService : undefined,
      payment: typeof body.payment === "string" ? body.payment : undefined,
      dateFrom: typeof body.dateFrom === "string" ? body.dateFrom : undefined,
      dateTo: typeof body.dateTo === "string" ? body.dateTo : undefined,
    };

    const supabase = createServiceClient();

    // Single-tenant: все products принадлежат владельцу, фильтр по seller_id удалён
    // (колонка сама дропнута в Stage 1). Customer-данные — через snapshot-поля
    // на orders (shipper и любой не-owner не увидит customers через RLS).
    let query = supabase
      .from("orders")
      .select(
        `
        *,
        product:products(id, name)
      `
      )
      .order("created_at", { ascending: false });

    if (orderIds && orderIds.length > 0) {
      query = query.in("id", orderIds);
    } else {
      query = applyOrderFilters(query, filters);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Export fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders: any[] = orders || [];

    // --- Stats ---
    let totalAll = 0,
      totalActive = 0,
      totalCompleted = 0,
      totalReturns = 0,
      totalCancelled = 0;
    let totalInvested = 0,
      totalRevenue = 0,
      totalProfit = 0,
      totalCountedOrders = 0;
    const byStatus: Record<string, number> = {};
    const byDelivery: Record<string, number> = {};
    const byMonthMap: Record<
      string,
      { orders: number; invested: number; revenue: number; profit: number }
    > = {};

    for (const o of allOrders) {
      totalAll++;
      const status = o.status || "unknown";
      byStatus[status] = (byStatus[status] || 0) + 1;
      const ds = o.delivery_service || "unknown";
      byDelivery[ds] = (byDelivery[ds] || 0) + 1;

      if (o.created_at) {
        const d = new Date(o.created_at);
        const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (!byMonthMap[mk]) byMonthMap[mk] = { orders: 0, invested: 0, revenue: 0, profit: 0 };
        byMonthMap[mk].orders++;
      }

      // Деньги — единый канон §9.3/§9.4 (гейт по статусу; партнёрский
      // = комиссия; свой = client − purchase − ставка отправщика).
      // Было: margin = client − purchase только для «sent», invested по
      // !NEGATIVE — занижало выручку и искажало прибыль/ROI экспорта.
      const counted = isRevenueCounted(status);
      const revenue = ownerRevenue(o);
      const cost = ownerCost(o);
      const profit = ownerProfit(o);

      if (ACTIVE_STATUSES.includes(status)) totalActive++;
      if (status === "sent") totalCompleted++;
      if (RETURN_STATUSES.includes(status)) totalReturns++;
      if (NEGATIVE_STATUSES.includes(status)) totalCancelled++;

      if (counted) {
        totalCountedOrders++;
        totalRevenue += revenue;
        totalProfit += profit;
        totalInvested += cost;
        if (o.created_at) {
          const d = new Date(o.created_at);
          const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
          if (byMonthMap[mk]) {
            byMonthMap[mk].revenue += revenue;
            byMonthMap[mk].profit += profit;
            byMonthMap[mk].invested += cost;
          }
        }
      }
    }

    const roi = totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 100) : 0;
    const avgMargin = totalCountedOrders > 0 ? Math.round(totalProfit / totalCountedOrders) : 0;

    // --- Build workbook ---
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AvitoFam Owner";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("ЗАКАЗЫ");

    // Column widths
    COLUMNS.forEach((col, i) => {
      sheet.getColumn(i + 1).width = col.width;
    });
    // Gap column
    sheet.getColumn(13).width = 3;
    // Stats columns (14-16)
    const S = 14;
    const E = S + 2;
    for (let c = S; c <= E; c++) sheet.getColumn(c).width = 20;

    // ===== ORDERS TABLE =====

    const headerRow = sheet.getRow(1);
    COLUMNS.forEach((col, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = col.header;
      headerCell(cell);
    });

    allOrders.forEach((o, index) => {
      const rowNum = index + 2;
      const row = sheet.getRow(rowNum);
      const purchase = o.purchase_price || 0;
      const clientPrice = o.client_price || 0;
      // Колонка «Маржа» = прибыль по канону §9.4 (свой − ставка
      // отправщика; партнёрский = комиссия; не в выручке → 0).
      const margin = ownerProfit(o);

      const dateStr = o.created_at
        ? new Date(o.created_at).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          })
        : "";
      const deadlineStr = o.send_by
        ? new Date(o.send_by).toLocaleDateString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
          })
        : "";

      const clientName = o.customer_tg_username_snapshot
        ? `@${o.customer_tg_username_snapshot}`
        : o.customer_name_snapshot || "";

      const values = [
        o.order_number || "",
        dateStr,
        o.product?.name || "—",
        o.size || "",
        clientName,
        purchase,
        clientPrice,
        margin,
        STATUS_MAP[o.status] || o.status || "",
        DELIVERY_MAP[o.delivery_service] || o.delivery_service || "",
        o.tracking_number || "",
        deadlineStr,
      ];

      values.forEach((v, i) => {
        const cell = row.getCell(i + 1);
        cell.value = v;
        boldCell(cell);

        // Margin coloring
        if (i + 1 === COL.MARGIN && typeof v === "number") {
          if (v > 0) cell.font = { name: FONT, bold: true, color: { argb: C.green } };
          else if (v < 0) cell.font = { name: FONT, bold: true, color: { argb: C.red } };
          cell.border = thinBorder;
        }

        // Number format
        if ([COL.PURCHASE, COL.CLIENT_PRICE, COL.MARGIN].includes(i + 1) && typeof v === "number") {
          cell.numFmt = "#,##0";
        }
      });
    });

    // Totals row
    if (allOrders.length > 0) {
      const lastRow = allOrders.length + 1;
      const totalsRow = sheet.getRow(allOrders.length + 2);
      COLUMNS.forEach((_, i) => {
        const col = i + 1;
        const cell = totalsRow.getCell(col);
        if (col === 5) {
          cell.value = "ИТОГО:";
        } else if (col === COL.PURCHASE) {
          cell.value = { formula: `SUM(F2:F${lastRow})` };
        } else if (col === COL.CLIENT_PRICE) {
          cell.value = { formula: `SUM(G2:G${lastRow})` };
        } else if (col === COL.MARGIN) {
          cell.value = { formula: `SUM(H2:H${lastRow})` };
        } else {
          cell.value = "";
        }
        headerCell(cell);
      });
    }

    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

    // ===== STATS DASHBOARD (right side) =====

    let r = 1;

    // Title
    r = mergedCyan(sheet, r, S, E, "ОТЧЁТ ВЛАДЕЛЬЦА");
    r = mergedCyan(
      sheet,
      r,
      S,
      E,
      new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    );
    r++;

    // Финансы
    r = mergedCyan(sheet, r, S, E, "ФИНАНСЫ");
    r = statRow(sheet, r, S, "Вложено (закупка)", formatRub(totalInvested));
    r = statRow(sheet, r, S, "Выручка (клиенты)", formatRub(totalRevenue));
    r = statRow(sheet, r, S, "Маржа", formatRub(totalProfit), totalProfit >= 0 ? C.green : C.red);
    r = statRow(sheet, r, S, "ROI", `${roi}%`, roi >= 0 ? C.green : C.red);
    r = statRow(sheet, r, S, "Ср. маржа/заказ", formatRub(avgMargin));
    r++;

    // Заказы
    r = mergedCyan(sheet, r, S, E, "ЗАКАЗЫ");
    ["ТИП", "КОЛ-ВО", "%"].forEach((h, i) => {
      const cell = sheet.getRow(r).getCell(S + i);
      cell.value = h;
      headerCell(cell);
    });
    r++;

    const breakdown = [
      { label: "Завершённых", value: totalCompleted },
      { label: "В работе", value: totalActive },
      { label: "Возвраты", value: totalReturns },
      { label: "Отмена", value: totalCancelled },
    ];
    for (const b of breakdown) {
      const pct = totalAll > 0 ? Math.round((b.value / totalAll) * 100) : 0;
      [b.label, b.value, `${pct}%`].forEach((v, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = v;
        boldCell(cell);
      });
      r++;
    }
    // Всего
    const lc = sheet.getRow(r).getCell(S);
    lc.value = "Всего";
    pinkCell(lc);
    sheet.mergeCells(`${colLetter(S + 1)}${r}:${colLetter(E)}${r}`);
    const vc = sheet.getRow(r).getCell(S + 1);
    vc.value = totalAll;
    pinkCell(vc);
    sheet.getRow(r).getCell(E).border = thinBorder;
    r += 2;

    // По доставке
    if (Object.keys(byDelivery).length > 0) {
      r = mergedCyan(sheet, r, S, E, "ПО ДОСТАВКЕ");
      ["СЛУЖБА", "КОЛ-ВО", "%"].forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        headerCell(cell);
      });
      r++;
      for (const [ds, count] of Object.entries(byDelivery).sort(([, a], [, b]) => b - a)) {
        const pct = totalAll > 0 ? Math.round((count / totalAll) * 100) : 0;
        [DELIVERY_MAP[ds] || ds, count, `${pct}%`].forEach((v, i) => {
          const cell = sheet.getRow(r).getCell(S + i);
          cell.value = v;
          boldCell(cell);
        });
        r++;
      }
      r++;
    }

    // По статусам
    if (Object.keys(byStatus).length > 0) {
      r = mergedCyan(sheet, r, S, E, "ПО СТАТУСАМ");
      ["СТАТУС", "КОЛ-ВО", "%"].forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        headerCell(cell);
      });
      r++;
      for (const [status, count] of Object.entries(byStatus).sort(([, a], [, b]) => b - a)) {
        const pct = totalAll > 0 ? Math.round((count / totalAll) * 100) : 0;
        [STATUS_MAP[status] || status, count, `${pct}%`].forEach((v, i) => {
          const cell = sheet.getRow(r).getCell(S + i);
          cell.value = v;
          boldCell(cell);
        });
        r++;
      }
      r++;
    }

    // Динамика по месяцам
    const byMonth = Object.entries(byMonthMap).sort(([a], [b]) => a.localeCompare(b));
    if (byMonth.length > 0) {
      r = mergedCyan(sheet, r, S, S + 4, "ДИНАМИКА ПО МЕСЯЦАМ");
      // Need wider columns for this section
      sheet.getColumn(S + 3).width = 20;
      sheet.getColumn(S + 4).width = 20;

      ["МЕСЯЦ", "ЗАКАЗОВ", "ВЛОЖЕНО", "ВЫРУЧКА", "МАРЖА"].forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        headerCell(cell);
      });
      r++;
      for (const [mk, data] of byMonth) {
        const [year, monthNum] = mk.split("-");
        const label = `${MONTH_NAMES[parseInt(monthNum) - 1]} ${year}`;
        [
          label,
          data.orders,
          formatRub(data.invested),
          formatRub(data.revenue),
          formatRub(data.profit),
        ].forEach((v, i) => {
          const cell = sheet.getRow(r).getCell(S + i);
          cell.value = v;
          boldCell(cell);
          if (i === 4)
            cell.font = {
              name: FONT,
              bold: true,
              color: { argb: data.profit >= 0 ? C.green : C.red },
            };
        });
        r++;
      }
      // Totals
      const totalRow = sheet.getRow(r);
      [
        "ИТОГО",
        totalAll,
        formatRub(totalInvested),
        formatRub(totalRevenue),
        formatRub(totalProfit),
      ].forEach((v, i) => {
        const cell = totalRow.getCell(S + i);
        cell.value = v;
        headerCell(cell);
      });
    }

    // --- Return xlsx ---
    const buffer = await workbook.xlsx.writeBuffer();
    const date = new Date()
      .toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      .replace(/\./g, "-");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="orders_${date}.xlsx"`,
      },
    });
  } catch (err) {
    console.error("Owner export error:", err);
    return NextResponse.json({ error: "Ошибка экспорта" }, { status: 500 });
  }
}

// --- Helpers ---

function mergedCyan(sheet: ExcelJS.Worksheet, row: number, s: number, e: number, text: string) {
  sheet.mergeCells(`${colLetter(s)}${row}:${colLetter(e)}${row}`);
  const cell = sheet.getCell(`${colLetter(s)}${row}`);
  cell.value = text;
  cyanCell(cell);
  for (let c = s + 1; c <= e; c++) {
    const mc = sheet.getRow(row).getCell(c);
    mc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sectionBg } };
    mc.border = thinBorder;
  }
  return row + 1;
}

function statRow(
  sheet: ExcelJS.Worksheet,
  row: number,
  s: number,
  label: string,
  value: string,
  color?: string
) {
  const lc = sheet.getRow(row).getCell(s);
  lc.value = label;
  boldCell(lc);
  sheet.mergeCells(`${colLetter(s + 1)}${row}:${colLetter(s + 2)}${row}`);
  const vc = sheet.getRow(row).getCell(s + 1);
  vc.value = value;
  boldCell(vc, color);
  sheet.getRow(row).getCell(s + 2).border = thinBorder;
  return row + 1;
}
