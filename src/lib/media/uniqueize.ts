/**
 * Уникализатор изображений (локально, через sharp) — каждая выкладка
 * получает визуально те же, но бинарно/перцептивно разные фото, чтобы
 * Avito не склеивал объявления по дублям.
 *
 * Приёмы (лёгкие, не портят картинку): срез нескольких пикселей по краям,
 * микро-поворот, джиттер яркости/насыщенности, едва заметный шум,
 * случайное качество JPEG, полная пересборка (сброс EXIF/метаданных).
 */
import sharp from "sharp";

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));

export interface UniqueizeOptions {
  /** Целевая ширина (px). По умолчанию сохраняет исходную. */
  maxWidth?: number;
}

/**
 * Уникализировать одно изображение. Принимает Buffer, возвращает JPEG Buffer.
 */
export async function uniqueizeImage(
  input: Buffer,
  opts: UniqueizeOptions = {}
): Promise<Buffer> {
  let img = sharp(input, { failOn: "none" }).rotate(); // авто-ориентация по EXIF

  const meta = await img.metadata();
  const w = meta.width ?? 1000;
  const h = meta.height ?? 1000;

  // 1. Срез 1..6 px с каждой стороны (рандомно)
  const cl = rndInt(1, 6);
  const ct = rndInt(1, 6);
  const cr = rndInt(1, 6);
  const cb = rndInt(1, 6);
  const cropW = Math.max(50, w - cl - cr);
  const cropH = Math.max(50, h - ct - cb);
  img = img.extract({ left: cl, top: ct, width: cropW, height: cropH });

  // 2. Микро-поворот ±0.6° с фоном и обратным кропом (незаметно)
  if (Math.random() < 0.7) {
    const angle = rnd(-0.6, 0.6);
    img = img.rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } });
  }

  // 3. Джиттер яркости/насыщенности/оттенка (едва заметный)
  img = img.modulate({
    brightness: rnd(0.97, 1.03),
    saturation: rnd(0.96, 1.04),
    hue: rndInt(-3, 3),
  });

  // 4. Лёгкий шум: генерим слабый шумовой слой с альфой и накладываем
  // soft-light (у sharp.composite нет опции opacity — гасим через alpha).
  try {
    const base = await sharp({
      create: {
        width: cropW,
        height: cropH,
        channels: 3,
        noise: { type: "gaussian", mean: 0, sigma: rnd(2, 5) },
      },
    })
      .ensureAlpha(0.05) // почти прозрачный слой
      .png()
      .toBuffer();
    img = img.composite([{ input: base, blend: "soft-light" }]);
  } catch {
    /* noise необязателен */
  }

  // 5. Ресайз по необходимости
  const targetW = opts.maxWidth && cropW > opts.maxWidth ? opts.maxWidth : null;
  if (targetW) img = img.resize({ width: targetW });

  // 6. Пересборка в JPEG со случайным качеством — сбрасывает все метаданные
  return img
    .jpeg({ quality: rndInt(80, 93), mozjpeg: true, progressive: Math.random() < 0.5 })
    .toBuffer();
}

/** Уникализировать пачку изображений (последовательно — экономим память). */
export async function uniqueizeMany(
  inputs: Buffer[],
  opts: UniqueizeOptions = {}
): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const b of inputs) out.push(await uniqueizeImage(b, opts));
  return out;
}
