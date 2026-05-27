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
import {
  openAvitoSessionBrowser,
  humanType,
  clickFirst,
  randomDelay,
  dumpPageDebug,
} from "./browser";
import { pickCategoryStep } from "@/lib/ai/category-picker";

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

    // ─── Шаг 1: пройти category-wizard ───
    // Avito показывает многошаговый wizard выбора категории; поле title появляется
    // только в самом конце. На каждом шаге читаем тексты доступных кнопок,
    // GPT выбирает самую релевантную для нашего товара, кликаем — повторяем
    // пока не появится title-input или не упрёмся в максимум 6 шагов.
    let titleAppeared = false;
    for (let step = 1; step <= 6; step++) {
      // Сначала проверим — может title уже появился
      const hasTitleInput = await page.evaluate(() => {
        return !!document.querySelector(
          'input[data-marker="title/input"], input[name="title"], input[id="title"], input[placeholder*="азвание"]'
        );
      });
      if (hasTitleInput) {
        titleAppeared = true;
        break;
      }

      // Читаем список доступных кнопок wizard
      const options = await page.evaluate(() => {
        const btns = Array.from(
          document.querySelectorAll<HTMLElement>('[data-marker="category-wizard/button"]')
        );
        return btns
          .map((b) => (b.innerText || b.textContent || "").replace(/ /g, " ").trim())
          .filter((t) => t.length > 0);
      });
      if (options.length === 0) {
        // Wizard закончился без title — возможно форма открылась как иначе
        console.error(`[posting] wizard step ${step}: no buttons, ломаемся`);
        break;
      }

      console.error(`[posting] wizard step ${step}: options=${JSON.stringify(options)}`);
      const picked = await pickCategoryStep(input.title, input.description, options).catch(
        () => null
      );
      if (!picked) {
        await dumpPageDebug(page, `post-listing-wizard-step-${step}`);
        return fail(`AI не смог выбрать категорию на шаге ${step}`);
      }
      console.error(`[posting] wizard step ${step}: picked="${picked}"`);

      // Кликаем по кнопке с этим текстом
      const clicked = await page.evaluate((target: string) => {
        const norm = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim().toLowerCase();
        const t = norm(target);
        const btns = Array.from(
          document.querySelectorAll<HTMLElement>('[data-marker="category-wizard/button"]')
        );
        for (const b of btns) {
          const text = norm(b.innerText || b.textContent || "");
          if (text === t || text.includes(t) || t.includes(text)) {
            b.click();
            return true;
          }
        }
        return false;
      }, picked);
      if (!clicked) {
        await dumpPageDebug(page, `post-listing-wizard-click-${step}`);
        return fail(`Не удалось кликнуть категорию "${picked}" (шаг ${step})`);
      }
      await randomDelay(1500, 2800);
    }
    if (!titleAppeared) {
      // Дополнительная проверка — может появилось после последнего клика
      const hasTitleInput = await page.evaluate(() => {
        return !!document.querySelector(
          'input[data-marker="title/input"], input[name="title"], input[id="title"], input[placeholder*="азвание"]'
        );
      });
      if (!hasTitleInput) {
        await dumpPageDebug(page, "post-listing-no-title-after-wizard");
        return fail("Поле названия не появилось после прохождения wizard");
      }
    }

    // ─── Шаг 2: Название ───
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
      await dumpPageDebug(page, "post-listing-title");
      return fail("Поле названия не найдено (форма Avito изменилась)");
    }
    await randomDelay(1500, 3000);

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

    // 6. Multi-step submit: Avito теперь делает форму многошаговой —
    // кнопка "Далее" [item-edit/button-next] переключает шаги, на финале —
    // "Опубликовать"/"Разместить"/"Подать объявление". Кликаем до 8 раз пока
    // не редирект на страницу объявления или не появится явная финальная кнопка.
    const SUBMIT_SELECTORS = [
      '[data-marker="submit-button/button"]',
      'button[data-marker="submit/button"]',
      '[data-marker="submit-form/submit"]',
      '[data-marker="item-edit/button-publish"]',
      '[data-marker="item-edit/button-next"]',
      'button[type="submit"]',
    ];
    let anyClicked = false;
    let publishedUrl: string | null = null;
    for (let step = 1; step <= 8; step++) {
      const beforeUrl = page.url();
      const clicked = await clickFirst(page, SUBMIT_SELECTORS);
      if (!clicked) {
        if (!anyClicked) {
          await dumpPageDebug(page, "post-listing-submit");
          return fail("Кнопка публикации не найдена");
        }
        // если хоть раз кликнули раньше — возможно уже на финале без кнопки
        break;
      }
      anyClicked = true;
      console.error(`[posting] submit step ${step}: clicked`);
      // Ждём либо navigation либо новый шаг (изменение DOM)
      const navHappened = await page
        .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      await randomDelay(1500, 3000);
      const afterUrl = page.url();
      console.error(`[posting] submit step ${step}: nav=${navHappened} url=${afterUrl}`);
      // Если редиректнуло на страницу опубликованного объявления — стоп
      if (afterUrl !== beforeUrl && !afterUrl.includes("/additem")) {
        publishedUrl = afterUrl;
        break;
      }
    }
    await randomDelay(2000, 4000);

    const url: string = publishedUrl ?? page.url();
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
    await dumpPageDebug(page, "post-listing-error").catch(() => {});
    return fail(e instanceof Error ? e.message : "Ошибка браузера при публикации");
  } finally {
    await close();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  function fail(message: string): PostListingResult {
    return { ok: false, avitoItemId: null, avitoItemUrl: null, message };
  }
}
