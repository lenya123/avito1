import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { z } from "zod";
import ExcelJS from "exceljs";

// --- Zod schema ---

const exportSchema = z.object({
  period: z.enum(["all", "month", "3months", "custom"]).default("all"),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

// --- Label maps ---

const ORDER_STATUS_MAP: Record<string, string> = {
  awaiting_shipment: "ЖДЁТ ОТПРАВКИ",
  collecting: "СОБИРАЕТСЯ",
  in_transit: "В ПУТИ",
  completed: "ЗАВЕРШЁН",
  return_in_transit: "ВОЗВРАТ В ПУТИ",
  return_arrived: "ВОЗВРАТ ПРИБЫЛ",
  return_completed: "ВОЗВРАТ",
  cancelled: "ОТМЕНА",
  problem: "ПРОБЛЕМА",
  trash: "В КОРЗИНЕ",
  disposed: "УТИЛИЗИРОВАН",
};

const DELIVERY_SERVICE_MAP: Record<string, string> = {
  avito: "Авито",
  yandex: "Яндекс",
  cdek: "СДЭК",
  pochta: "Почта России",
  "5post": "5Post",
};

const PERIOD_LABELS: Record<string, string> = {
  all: "За всё время",
  month: "За последний месяц",
  "3months": "За последние 3 месяца",
  custom: "Свой период",
};

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

// --- Colors (matching reference file style) ---

const C = {
  headerBg: "00FF00", // Bright green header
  sectionBg: "00FFFF", // Cyan section labels
  pinkBg: "FF00FF", // Magenta for special totals
  black: "000000",
  white: "FFFFFF",
  green: "008000",
  red: "FF0000",
  orange: "FF6600",
  borderColor: "000000",
};

const FONT_NAME = "Arial";

// --- Statuses grouping ---

const ACTIVE_STATUSES = ["awaiting_shipment", "collecting", "in_transit", "problem"];
const RETURN_STATUSES = ["return_in_transit", "return_arrived", "return_completed"];
const NEGATIVE_STATUSES = ["cancelled", "disposed", "trash"];

// --- POST handler ---

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
    }

    const body = await request.json();
    const result = exportSchema.safeParse(body);
    if (!result.success) {
      return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
    }

    const { period, dateFrom: customFrom, dateTo: customTo } = result.data;
    const supabase = createServiceClient();

    // Fetch user info
    const { data: user } = await supabase
      .from("users")
      .select(
        "name, telegram_username, level, discount_percent, is_vibe_plus, deposit, referral_deposit"
      )
      .eq("id", session.userId)
      .single();

    const userName = user?.name || user?.telegram_username || "Клиент";
    const deposit = user?.deposit ?? 0;
    const referralDeposit = user?.referral_deposit ?? 0;

    // Fetch all orders (no pagination)
    let query = supabase
      .from("orders")
      .select(
        `
        *,
        product:products(id, name, brand, drop_price),
        product_size:product_sizes(id, size)
      `
      )
      .eq("client_id", session.userId)
      .order("created_at", { ascending: false });

    if (period === "custom") {
      if (customFrom) {
        query = query.gte("created_at", new Date(customFrom).toISOString());
      }
      if (customTo) {
        const to = new Date(customTo);
        to.setHours(23, 59, 59, 999);
        query = query.lte("created_at", to.toISOString());
      }
    } else if (period === "month") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      query = query.gte("created_at", d.toISOString());
    } else if (period === "3months") {
      const d = new Date();
      d.setDate(d.getDate() - 90);
      query = query.gte("created_at", d.toISOString());
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error("Export orders fetch error:", error);
      return NextResponse.json({ error: "Ошибка загрузки заказов" }, { status: 500 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allOrders: any[] = orders || [];
    const stats = calculateStats(allOrders);

    // --- Build workbook ---
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AvitoFam";
    workbook.created = new Date();

    // Build period label for custom range
    let periodLabel = PERIOD_LABELS[period] || period;
    if (period === "custom") {
      const fromStr = customFrom ? new Date(customFrom).toLocaleDateString("ru-RU") : "...";
      const toStr = customTo ? new Date(customTo).toLocaleDateString("ru-RU") : "...";
      periodLabel = `${fromStr} — ${toStr}`;
    }

    buildSheet(workbook, allOrders, stats, userName, periodLabel, deposit, referralDeposit);

    // --- Return xlsx ---
    const buffer = await workbook.xlsx.writeBuffer();

    const date = new Date()
      .toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
      .replace(/\./g, "-");

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="export_${date}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export error:", error);
    return NextResponse.json({ error: "Ошибка экспорта" }, { status: 500 });
  }
}

// ============================================================
// Stats calculation
// ============================================================

interface Stats {
  totalAll: number;
  totalActive: number;
  totalCompleted: number;
  totalReturns: number;
  totalCancelled: number;
  totalProblem: number;
  totalInvested: number;
  totalRevenue: number;
  totalProfit: number;
  roi: number;
  avgOrderValue: number;
  avgProfit: number;
  bestProfit: number;
  worstProfit: number;
  byStatus: Record<string, number>;
  byDelivery: Record<string, number>;
  byMonth: { month: string; orders: number; invested: number; revenue: number; profit: number }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateStats(orders: any[]): Stats {
  const byStatus: Record<string, number> = {};
  const byDelivery: Record<string, number> = {};
  const byMonthMap: Record<
    string,
    { orders: number; invested: number; revenue: number; profit: number }
  > = {};

  let totalAll = 0;
  let totalActive = 0;
  let totalCompleted = 0;
  let totalReturns = 0;
  let totalCancelled = 0;
  let totalProblem = 0;
  let totalInvested = 0;
  let totalRevenue = 0;
  let totalProfit = 0;
  let bestProfit = 0;
  let worstProfit = 0;

  for (const order of orders) {
    totalAll++;
    const status = order.status || "unknown";
    byStatus[status] = (byStatus[status] || 0) + 1;

    const ds = order.delivery_service || "unknown";
    byDelivery[ds] = (byDelivery[ds] || 0) + 1;

    if (order.created_at) {
      const d = new Date(order.created_at);
      const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!byMonthMap[monthKey]) {
        byMonthMap[monthKey] = { orders: 0, invested: 0, revenue: 0, profit: 0 };
      }
      byMonthMap[monthKey].orders++;
      if (!NEGATIVE_STATUSES.includes(status)) {
        byMonthMap[monthKey].invested += order.client_price || 0;
      }
      if (status === "completed") {
        byMonthMap[monthKey].revenue += order.sale_price || 0;
        byMonthMap[monthKey].profit += order.client_profit || 0;
      }
    }

    if (ACTIVE_STATUSES.includes(status)) totalActive++;
    if (status === "completed") totalCompleted++;
    if (RETURN_STATUSES.includes(status)) totalReturns++;
    if (NEGATIVE_STATUSES.includes(status)) totalCancelled++;
    if (status === "problem") totalProblem++;

    if (!NEGATIVE_STATUSES.includes(status)) {
      totalInvested += order.client_price || 0;
    }
    if (status === "completed") {
      totalRevenue += order.sale_price || 0;
      totalProfit += order.client_profit || 0;
      const p = order.client_profit || 0;
      if (p > bestProfit) bestProfit = p;
      if (p < worstProfit) worstProfit = p;
    }
  }

  const roi = totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 100) : 0;
  const avgOrderValue = totalCompleted > 0 ? Math.round(totalRevenue / totalCompleted) : 0;
  const avgProfit = totalCompleted > 0 ? Math.round(totalProfit / totalCompleted) : 0;

  const byMonth = Object.entries(byMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({ month, ...data }));

  return {
    totalAll,
    totalActive,
    totalCompleted,
    totalReturns,
    totalCancelled,
    totalProblem,
    totalInvested,
    totalRevenue,
    totalProfit,
    roi,
    avgOrderValue,
    avgProfit,
    bestProfit,
    worstProfit,
    byStatus,
    byDelivery,
    byMonth,
  };
}

// ============================================================
// Shared style helpers
// ============================================================

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: C.borderColor } },
  bottom: { style: "thin", color: { argb: C.borderColor } },
  left: { style: "thin", color: { argb: C.borderColor } },
  right: { style: "thin", color: { argb: C.borderColor } },
};

function greenHeaderCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.headerBg } };
  cell.font = { name: FONT_NAME, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function cyanCell(cell: ExcelJS.Cell, fontSize?: number) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sectionBg } };
  cell.font = { name: FONT_NAME, size: fontSize || 14, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function pinkValueCell(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.pinkBg } };
  cell.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

function boldCenteredCell(cell: ExcelJS.Cell, color?: string) {
  cell.font = { name: FONT_NAME, bold: true, color: { argb: color || C.black } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  cell.border = thinBorder;
}

// ============================================================
// Single sheet: orders table + stats dashboard to the right
// ============================================================

// Orders columns A-J
const COLUMNS: { header: string; width: number }[] = [
  { header: "№", width: 8 },
  { header: "ДАТА", width: 12 },
  { header: "МОДЕЛЬ", width: 22 },
  { header: "РАЗМЕР", width: 10 },
  { header: "ПРАЙС", width: 13 },
  { header: "ПРИБЫЛЬ", width: 13 },
  { header: "СТАТУС", width: 17 },
  { header: "ДОСТАВКА", width: 14 },
  { header: "ТРЕК-НОМЕР", width: 22 },
  { header: "КОММЕНТАРИИ", width: 22 },
];

const COL = {
  NUM: 1,
  DATE: 2,
  MODEL: 3,
  SIZE: 4,
  PRICE: 5,
  PROFIT: 6,
  STATUS: 7,
  DELIVERY: 8,
  TRACK: 9,
  COMMENT: 10,
};

// Stats dashboard starts at column L (12), gap column K (11)
const S = 12; // stats start column

function buildSheet(
  workbook: ExcelJS.Workbook,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  orders: any[],
  stats: Stats,
  userName: string,
  periodLabel: string,
  deposit: number,
  referralDeposit: number
) {
  const sheet = workbook.addWorksheet("СЧИТАЕМ");

  // Standard width: all stats sections use 3 columns (S, S+1, S+2)
  const E = S + 2; // end column for standard sections

  // --- Column widths for orders ---
  COLUMNS.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width;
  });
  // Gap column
  sheet.getColumn(11).width = 3;
  // Stats columns L-P (12-16) — equal widths
  for (let c = S; c <= S + 4; c++) {
    sheet.getColumn(c).width = 20;
  }

  // ===== ORDERS TABLE (left side) =====

  // Header row
  const headerRow = sheet.getRow(1);
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    greenHeaderCell(cell);
  });

  // Data rows
  orders.forEach((order, index) => {
    const rowNum = index + 2;
    const row = sheet.getRow(rowNum);
    const profit = order.client_profit || 0;
    const salePrice = order.sale_price || 0;

    const dateStr = order.created_at
      ? new Date(order.created_at).toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
        })
      : "";

    const values = [
      order.order_number || "",
      dateStr,
      order.product?.name || "—",
      order.size || "",
      salePrice || "",
      profit || "",
      (order.status && ORDER_STATUS_MAP[order.status]) || order.status || "",
      (order.delivery_service && DELIVERY_SERVICE_MAP[order.delivery_service]) ||
        order.delivery_service ||
        "",
      order.tracking_number || "",
      order.client_comment || (order.cancel_reason ? `Отмена: ${order.cancel_reason}` : ""),
    ];

    values.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      boldCenteredCell(cell);

      // Profit coloring
      if (i + 1 === COL.PROFIT && typeof v === "number") {
        if (v > 0) cell.font = { name: FONT_NAME, bold: true, color: { argb: C.green } };
        else if (v < 0) cell.font = { name: FONT_NAME, bold: true, color: { argb: C.red } };
        cell.border = thinBorder;
      }

      // Number format for price/profit
      if ((i + 1 === COL.PRICE || i + 1 === COL.PROFIT) && typeof v === "number") {
        cell.numFmt = "#,##0";
      }
    });
  });

  // Totals row
  if (orders.length > 0) {
    const lastDataRow = orders.length + 1;
    const totalsRowNum = orders.length + 2;
    const totalsRow = sheet.getRow(totalsRowNum);

    COLUMNS.forEach((_, i) => {
      const col = i + 1;
      const cell = totalsRow.getCell(col);
      if (col === COL.SIZE) {
        cell.value = "ИТОГО:";
      } else if (col === COL.PRICE) {
        cell.value = { formula: `SUM(E2:E${lastDataRow})` };
      } else if (col === COL.PROFIT) {
        cell.value = { formula: `SUM(F2:F${lastDataRow})` };
      } else {
        cell.value = "";
      }
      greenHeaderCell(cell);
    });
  }

  // Auto-filter + freeze
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  sheet.views = [{ state: "frozen", ySplit: 1, xSplit: 0 }];

  // ===== STATS DASHBOARD (right side, starting at col S=12) =====
  // All sections standardized to 3 columns (S to S+2 = E)

  let r = 1;

  // ─── Title ───
  r = mergedCyan(sheet, r, S, E, `ОТЧЁТ — ${userName.toUpperCase()}`);
  r = mergedCyan(
    sheet,
    r,
    S,
    E,
    `${new Date().toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}  |  ${periodLabel}`
  );
  r++; // spacer

  // ─── БАЛАНС ───
  r = mergedCyan(sheet, r, S, E, "БАЛАНС");
  r = statRow3(sheet, r, S, "Депозит", formatRub(deposit));
  r = statRow3(sheet, r, S, "Реферальный", formatRub(referralDeposit));
  r = statRow3(sheet, r, S, "Итого", formatRub(deposit + referralDeposit), C.green);
  r++; // spacer

  // ─── ФИНАНСЫ ───
  r = mergedCyan(sheet, r, S, E, "ФИНАНСЫ");
  r = statRow3(sheet, r, S, "Вложено", formatRub(stats.totalInvested));
  r = statRow3(sheet, r, S, "Продано", formatRub(stats.totalRevenue));
  r = statRow3(
    sheet,
    r,
    S,
    "Прибыль",
    formatRub(stats.totalProfit),
    stats.totalProfit >= 0 ? C.green : C.red
  );
  r = statRow3(sheet, r, S, "ROI", `${stats.roi}%`, stats.roi >= 0 ? C.green : C.red);
  r++; // spacer

  // ─── ЗАКАЗЫ ───
  r = mergedCyan(sheet, r, S, E, "ЗАКАЗЫ");
  {
    const headers = ["ТИП", "КОЛ-ВО", "%"];
    headers.forEach((h, i) => {
      const cell = sheet.getRow(r).getCell(S + i);
      cell.value = h;
      greenHeaderCell(cell);
    });
    r++;
  }
  const breakdownRows = [
    { label: "Завершённых", value: stats.totalCompleted },
    { label: "В работе", value: stats.totalActive },
    { label: "Возвраты", value: stats.totalReturns },
    { label: "Отмена", value: stats.totalCancelled },
  ];
  if (stats.totalProblem > 0) {
    breakdownRows.push({ label: "Проблема", value: stats.totalProblem });
  }
  for (const br of breakdownRows) {
    const pct = stats.totalAll > 0 ? Math.round((br.value / stats.totalAll) * 100) : 0;
    r = tableRow3(sheet, r, S, br.label, br.value, `${pct}%`);
  }
  // "Всего" at the bottom with pink
  {
    const lc = sheet.getRow(r).getCell(S);
    lc.value = "Всего";
    pinkValueCell(lc);
    // Merge value across S+1:S+2
    const s1 = colLetter(S + 1);
    const s2 = colLetter(S + 2);
    sheet.mergeCells(`${s1}${r}:${s2}${r}`);
    const vc = sheet.getRow(r).getCell(S + 1);
    vc.value = stats.totalAll;
    pinkValueCell(vc);
    sheet.getRow(r).getCell(S + 2).border = thinBorder;
    r++;
  }
  r++; // spacer

  // ─── СРЕДНИЕ ПОКАЗАТЕЛИ ───
  r = mergedCyan(sheet, r, S, E, "СРЕДНИЕ ПОКАЗАТЕЛИ");
  r = statRow3(sheet, r, S, "Средний чек", formatRub(stats.avgOrderValue));
  r = statRow3(sheet, r, S, "Средняя прибыль", formatRub(stats.avgProfit));
  if (stats.bestProfit > 0) {
    r = statRow3(sheet, r, S, "Лучшая прибыль", formatRub(stats.bestProfit), C.green);
  }
  if (stats.worstProfit < 0) {
    r = statRow3(sheet, r, S, "Худшая прибыль", formatRub(stats.worstProfit), C.red);
  }
  r++; // spacer

  // ─── ПО ДОСТАВКЕ ───
  if (Object.keys(stats.byDelivery).length > 0) {
    r = mergedCyan(sheet, r, S, E, "ПО ДОСТАВКЕ");
    {
      const headers = ["СЛУЖБА", "КОЛ-ВО", "%"];
      headers.forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        greenHeaderCell(cell);
      });
      r++;
    }
    const deliveryEntries = Object.entries(stats.byDelivery).sort(([, a], [, b]) => b - a);
    for (const [ds, count] of deliveryEntries) {
      const pct = stats.totalAll > 0 ? Math.round((count / stats.totalAll) * 100) : 0;
      r = tableRow3(sheet, r, S, DELIVERY_SERVICE_MAP[ds] || ds, count, `${pct}%`);
    }
    r++; // spacer
  }

  // ─── ПО СТАТУСАМ ───
  if (Object.keys(stats.byStatus).length > 0) {
    r = mergedCyan(sheet, r, S, E, "ПО СТАТУСАМ");
    {
      const headers = ["СТАТУС", "КОЛ-ВО", "%"];
      headers.forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        greenHeaderCell(cell);
      });
      r++;
    }
    const statusEntries = Object.entries(stats.byStatus).sort(([, a], [, b]) => b - a);
    for (const [status, count] of statusEntries) {
      const pct = stats.totalAll > 0 ? Math.round((count / stats.totalAll) * 100) : 0;
      r = tableRow3(sheet, r, S, ORDER_STATUS_MAP[status] || status, count, `${pct}%`);
    }
    r++; // spacer
  }

  // ─── ДИНАМИКА ПО МЕСЯЦАМ ───
  if (stats.byMonth.length > 0) {
    r = mergedCyan(sheet, r, S, S + 4, "ДИНАМИКА ПО МЕСЯЦАМ");
    {
      const headers = ["МЕСЯЦ", "ЗАКАЗОВ", "ВЛОЖЕНО", "ПРОДАНО", "ПРИБЫЛЬ"];
      headers.forEach((h, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = h;
        greenHeaderCell(cell);
      });
      r++;
    }
    for (const m of stats.byMonth) {
      const [year, monthNum] = m.month.split("-");
      const monthLabel = `${MONTH_NAMES[parseInt(monthNum) - 1]} ${year}`;
      const vals = [
        monthLabel,
        m.orders,
        formatRub(m.invested),
        formatRub(m.revenue),
        formatRub(m.profit),
      ];
      vals.forEach((v, i) => {
        const cell = sheet.getRow(r).getCell(S + i);
        cell.value = v;
        boldCenteredCell(cell);
        if (i === 4 && typeof m.profit === "number") {
          cell.font = {
            name: FONT_NAME,
            bold: true,
            color: { argb: m.profit >= 0 ? C.green : C.red },
          };
        }
      });
      r++;
    }

    // Totals for months
    const totalMonthRow = sheet.getRow(r);
    const totals = [
      "ИТОГО",
      stats.totalAll,
      formatRub(stats.totalInvested),
      formatRub(stats.totalRevenue),
      formatRub(stats.totalProfit),
    ];
    totals.forEach((v, i) => {
      const cell = totalMonthRow.getCell(S + i);
      cell.value = v;
      greenHeaderCell(cell);
    });
  }
}

// ============================================================
// Stats dashboard helpers
// ============================================================

function mergedCyan(
  sheet: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  colEnd: number,
  text: string
): number {
  const colStartLetter = colLetter(colStart);
  const colEndLetter = colLetter(colEnd);
  sheet.mergeCells(`${colStartLetter}${row}:${colEndLetter}${row}`);
  const cell = sheet.getCell(`${colStartLetter}${row}`);
  cell.value = text;
  cyanCell(cell);
  // Fill merged cells
  for (let c = colStart + 1; c <= colEnd; c++) {
    const mc = sheet.getRow(row).getCell(c);
    mc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.sectionBg } };
    mc.border = thinBorder;
  }
  return row + 1;
}

// 3-col stat row: label in col S, value merged across S+1:S+2
function statRow3(
  sheet: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  label: string,
  value: string,
  color?: string
): number {
  const lc = sheet.getRow(row).getCell(colStart);
  lc.value = label;
  boldCenteredCell(lc);

  // Merge value across 2 cells
  const s1 = colLetter(colStart + 1);
  const s2 = colLetter(colStart + 2);
  sheet.mergeCells(`${s1}${row}:${s2}${row}`);
  const vc = sheet.getRow(row).getCell(colStart + 1);
  vc.value = value;
  boldCenteredCell(vc, color);
  // Border on merged cell
  sheet.getRow(row).getCell(colStart + 2).border = thinBorder;

  return row + 1;
}

// 3-col table data row: 3 separate cells
function tableRow3(
  sheet: ExcelJS.Worksheet,
  row: number,
  colStart: number,
  c1: string | number,
  c2: string | number,
  c3: string | number
): number {
  const cells = [c1, c2, c3];
  cells.forEach((v, i) => {
    const cell = sheet.getRow(row).getCell(colStart + i);
    cell.value = v;
    boldCenteredCell(cell);
  });
  return row + 1;
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

function formatRub(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value) + " ₽";
}
