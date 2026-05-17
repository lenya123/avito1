/**
 * Управление объявлением через браузер (официальный API не даёт удаление/
 * снятие без ИП-аккаунта): включить/выключить (снять с публикации) и удалить.
 *
 * Avito часто меняет вёрстку кабинета, поэтому используются СПИСКИ
 * селекторов-кандидатов + текстовый поиск кнопок. Реальные селекторы нужно
 * подтвердить на живом аккаунте.
 *
 * // STUB: verify selectors against live Avito — пометки ниже отмечают места,
 * требующие проверки/уточнения на реальном кабинете.
 */
import { openAvitoSessionBrowser, clickFirst, randomDelay } from "./browser";

const NAV_TIMEOUT = 45_000;

export interface ItemActionResult {
  ok: boolean;
  message: string;
}

/** Клик по кнопке/ссылке по видимому тексту (регистронезависимо, по подстроке). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function clickByText(page: any, texts: string[]): Promise<boolean> {
  const lowered = texts.map((t) => t.toLowerCase());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handle = await page.evaluateHandle((needles: string[]) => {
    const nodes = Array.from(
      document.querySelectorAll("button, a, span[role='button'], div[role='button']")
    );
    return (
      nodes.find((n) => {
        const t = (n.textContent || "").trim().toLowerCase();
        return t && needles.some((needle) => t.includes(needle));
      }) || null
    );
  }, lowered);
  const el = handle.asElement();
  if (!el) return false;
  await el.click().catch(() => {});
  return true;
}

/**
 * Включить/выключить объявление (снять с публикации / опубликовать снова).
 * @param itemUrl полный URL объявления на avito.ru
 */
export async function setAvitoItemActive(
  sessionId: string,
  itemUrl: string,
  active: boolean
): Promise<ItemActionResult> {
  if (!itemUrl) return { ok: false, message: "Нет URL объявления" };
  const { page, close } = await openAvitoSessionBrowser(sessionId);
  try {
    await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await randomDelay(1500, 3000);

    if (active) {
      // Активировать снова
      // STUB: verify selectors against live Avito
      const clicked =
        (await clickFirst(page, [
          '[data-marker="item-actions/activate"]',
          'button[data-marker="activate"]',
        ])) ||
        (await clickByText(page, [
          "опубликовать снова",
          "активировать",
          "восстановить",
          "вернуть в продажу",
        ]));
      if (!clicked) return { ok: false, message: "Кнопка активации не найдена" };
    } else {
      // Снять с публикации
      // STUB: verify selectors against live Avito
      const clicked =
        (await clickFirst(page, [
          '[data-marker="item-actions/deactivate"]',
          'button[data-marker="deactivate"]',
        ])) ||
        (await clickByText(page, [
          "снять с публикации",
          "снять с продажи",
          "снять объявление",
          "деактивировать",
        ]));
      if (!clicked) return { ok: false, message: "Кнопка снятия не найдена" };
    }

    await randomDelay(1200, 2500);
    // Подтверждение в модалке (если есть)
    await clickByText(page, ["подтвердить", "снять", "да", "продолжить"]).catch(() => false);
    await randomDelay(1500, 3000);

    return {
      ok: true,
      message: active ? "Объявление активировано" : "Объявление снято с публикации",
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка браузера" };
  } finally {
    await close();
  }
}

/** Удалить объявление. */
export async function deleteAvitoItem(
  sessionId: string,
  itemUrl: string
): Promise<ItemActionResult> {
  if (!itemUrl) return { ok: false, message: "Нет URL объявления" };
  const { page, close } = await openAvitoSessionBrowser(sessionId);
  try {
    await page.goto(itemUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await randomDelay(1500, 3000);

    // STUB: verify selectors against live Avito
    const clicked =
      (await clickFirst(page, [
        '[data-marker="item-actions/delete"]',
        'button[data-marker="delete"]',
      ])) || (await clickByText(page, ["удалить объявление", "удалить"]));
    if (!clicked) return { ok: false, message: "Кнопка удаления не найдена" };

    await randomDelay(1000, 2200);
    // Часто Avito спрашивает причину + подтверждение
    await clickByText(page, ["продал на авито", "больше не актуально", "другая причина"]).catch(
      () => false
    );
    await randomDelay(600, 1400);
    await clickByText(page, ["удалить", "подтвердить", "да"]).catch(() => false);
    await randomDelay(1500, 3000);

    return { ok: true, message: "Объявление удалено" };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ошибка браузера" };
  } finally {
    await close();
  }
}
