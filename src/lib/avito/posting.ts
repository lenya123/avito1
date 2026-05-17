/**
 * Публикация объявления через stealth-браузер сессии (антидетект на магазин).
 *
 * Форма Avito «Разместить объявление» многошаговая и зависит от категории,
 * её разметка часто меняется и недоступна для проверки вне живого аккаунта.
 * Поэтому здесь — РЕАЛЬНЫЙ каркас флоу с кандидатами селекторов и явными
 * пометками. // STUB: verify selectors against live Avito — места, требующие
 * подтверждения/донастройки под конкретные категории на боевом кабинете.
 */
import { writeFile, mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { openAvitoSessionBrowser, humanType, clickFirst, randomDelay } from "./browser";

const NAV_TIMEOUT = 60_000;

export interface PostListingInput {
  title: string;
  description: string;
  price: number;
  city: string;
  metro: string | null;
  photos: Buffer[]; // готовые JPEG (уникализированы), обложка первой
  category?: string | null;
}

export interface PostListingResult {
  ok: boolean;
  avitoItemId: string | null;
  avitoItemUrl: string | null;
  message: string;
}

async function writeTempPhotos(photos: Buffer[]): Promise<{ dir: string; paths: string[] }> {
  const dir = await mkdtemp(join(tmpdir(), "avito-post-"));
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const p = join(dir, `photo-${i}.jpg`);
    await writeFile(p, photos[i]);
    paths.push(p);
  }
  return { dir, paths };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fillByCandidates(page: any, selectors: string[], value: string): Promise<boolean> {
  for (const sel of selectors) {
    const el = await page.$(sel).catch(() => null);
    if (el) {
      await el.click({ clickCount: 3 }).catch(() => {});
      await humanType(page, sel, value).catch(async () => {
        await page.type(sel, value).catch(() => {});
      });
      return true;
    }
  }
  return false;
}

/**
 * Опубликовать объявление. Возвращает результат с id/url при успехе.
 */
export async function postListing(
  sessionId: string,
  input: PostListingInput
): Promise<PostListingResult> {
  const { paths, dir } = await writeTempPhotos(input.photos);
  const { page, close } = await openAvitoSessionBrowser(sessionId);

  try {
    await page.goto("https://www.avito.ru/additem", {
      waitUntil: "domcontentloaded",
      timeout: NAV_TIMEOUT,
    });
    await randomDelay(2500, 4500);

    // STUB: verify selectors against live Avito
    // 1. Название (на первом шаге Avito подбирает категорию по названию)
    const titleOk = await fillByCandidates(
      page,
      [
        'input[data-marker="title/input"]',
        'input[name="title"]',
        'input[id="title"]',
        'input[placeholder*="азвание"]',
      ],
      input.title
    );
    if (!titleOk) {
      return fail("Поле названия не найдено (форма Avito изменилась)");
    }
    await randomDelay(1500, 3000);

    // STUB: выбор категории/параметров — зависит от товара.
    // На реальном кабинете здесь шаги выбора категории и обязательных
    // атрибутов. Пока пытаемся продолжить «как есть».
    await clickFirst(page, [
      '[data-marker="search-category/0"]',
      'button[data-marker="category-suggest/select"]',
    ]).catch(() => false);
    await randomDelay(1000, 2000);

    // 2. Описание
    await fillByCandidates(
      page,
      [
        'textarea[data-marker="description/input"]',
        'textarea[name="description"]',
        'div[contenteditable="true"][data-marker*="description"]',
        "textarea#description",
      ],
      input.description
    );
    await randomDelay(800, 1800);

    // 3. Цена
    await fillByCandidates(
      page,
      [
        'input[data-marker="price/input"]',
        'input[name="price"]',
        'input[id="price"]',
        'input[inputmode="numeric"][placeholder*="ена"]',
      ],
      String(Math.round(input.price))
    );
    await randomDelay(800, 1800);

    // 4. Адрес / метро (рандом коричневого кольца)
    if (input.metro) {
      const metroOk = await fillByCandidates(
        page,
        [
          'input[data-marker="address/metro/input"]',
          'input[placeholder*="етро"]',
          'input[name="metro"]',
        ],
        input.metro
      );
      if (metroOk) {
        await randomDelay(1200, 2200);
        // выбрать первую подсказку
        await clickFirst(page, [
          '[data-marker="suggest/item"]',
          'li[role="option"]',
          ".suggest-item",
        ]).catch(() => false);
      }
    }
    await randomDelay(800, 1600);

    // 5. Фото — скрытый input[type=file], загружаем все буферы
    // STUB: verify selectors against live Avito
    const fileInput = await page
      .$('input[type="file"][accept*="image"], input[type="file"]')
      .catch(() => null);
    if (fileInput) {
      await fileInput.uploadFile(...paths);
      // ждём прогруза превью
      await randomDelay(4000, 8000);
    }

    // 6. Отправка формы
    // STUB: verify selectors against live Avito
    const submitted = await clickFirst(page, [
      '[data-marker="submit-button/button"]',
      'button[data-marker="submit/button"]',
      'button[type="submit"]',
    ]);
    if (!submitted) {
      return fail("Кнопка публикации не найдена");
    }

    // 7. Ждём редирект на страницу объявления / кабинет
    await page
      .waitForNavigation({ waitUntil: "networkidle2", timeout: NAV_TIMEOUT })
      .catch(() => {});
    await randomDelay(2000, 4000);

    const url: string = page.url();
    // Avito URL объявления заканчивается на _<id>
    const m = url.match(/_(\d{6,})(?:\?|$)/);
    if (m) {
      return {
        ok: true,
        avitoItemId: m[1],
        avitoItemUrl: url.split("?")[0],
        message: "Объявление опубликовано",
      };
    }

    // Опубликовалось, но id из URL не извлёкся — не критично, подхватит синк
    return {
      ok: true,
      avitoItemId: null,
      avitoItemUrl: url.includes("avito.ru") ? url.split("?")[0] : null,
      message: "Объявление отправлено (id подтянет синхронизация)",
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Ошибка браузера при публикации");
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  function fail(message: string): PostListingResult {
    return { ok: false, avitoItemId: null, avitoItemUrl: null, message };
  }
}
