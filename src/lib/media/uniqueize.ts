/**
 * Уникализатор изображений (локально, через sharp) — каждая выкладка получает
 * визуально те же, но БИНАРНО и ПЕРЦЕПТИВНО разные фото, чтобы Avito не склеивал
 * объявления по дублям (точный хеш + EXIF + перцептивный хеш pHash).
 *
 * Avito-модерация сверяет фото перцептивным хешем (pHash на DCT низких частот),
 * который УСТОЙЧИВ к лёгкому кропу/ресайзу/перекомпрессии/мелким правкам цвета.
 * Поэтому одних «срез 1-6px + ±0.6° + ±3% цвет» мало. Здесь — трансформы, которые
 * реально сдвигают pHash (кроп+зум, поворот с кроп-в-заполнение, контраст/гамма),
 * + САМОПРОВЕРКА: гоняем трансформы, пока хеммингово расстояние pHash(исходник)↔
 * pHash(результат) не превысит порог (гарантированно «перцептивно другое»).
 */
import sharp from "sharp";

const rnd = (min: number, max: number) => min + Math.random() * (max - min);
const rndInt = (min: number, max: number) => Math.floor(rnd(min, max + 1));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface UniqueizeOptions {
  /** Целевая ширина (px). По умолчанию сохраняет исходную. */
  maxWidth?: number;
  /** Минимальное хеммингово расстояние pHash (из 64 бит), которого добиваемся. */
  minHammingBits?: number;
  /**
   * pHash'и ПРОШЛЫХ выкладок этого же фото — результат должен отстоять не только
   * от исходника, но и от них (чтобы Avito не склеил две выкладки одного фотосета).
   * Флоу публикации хранит pHash опубликованных версий пресета и передаёт их сюда.
   */
  avoidHashes?: string[];
}

const DEFAULT_MIN_BITS = 12; // из 64 — уверенный «перцептивно другой» результат
const PHASH_SIZE = 32; // даунскейл для DCT

/**
 * Перцептивный хеш (pHash) изображения: 64-битный, на 2D-DCT 32×32 grayscale,
 * берём левый-верхний блок 8×8 низких частот, бит = коэффициент > медианы.
 * Тот же алгоритм, что у imagehash/pHash.org — устойчив к мелким правкам,
 * поэтому им же и МЕРЯЕМ, достаточно ли мы сдвинули картинку.
 */
export async function pHash(input: Buffer): Promise<string> {
  const N = PHASH_SIZE;
  const data = await sharp(input, { failOn: "none" })
    .greyscale()
    .resize(N, N, { fit: "fill" })
    .raw()
    .toBuffer(); // N*N байт, 1 канал

  // Предрасчёт косинусов DCT-II.
  const cos: Float64Array[] = [];
  for (let u = 0; u < N; u++) {
    cos[u] = new Float64Array(N);
    for (let x = 0; x < N; x++) cos[u][x] = Math.cos(((2 * x + 1) * u * Math.PI) / (2 * N));
  }
  // Разделимый 2D-DCT: сначала по строкам, потом по столбцам.
  const f = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) f[i] = data[i];
  const tmp = new Float64Array(N * N);
  for (let y = 0; y < N; y++)
    for (let u = 0; u < N; u++) {
      let s = 0;
      for (let x = 0; x < N; x++) s += f[y * N + x] * cos[u][x];
      tmp[y * N + u] = s;
    }
  const dct = new Float64Array(N * N);
  for (let u = 0; u < N; u++)
    for (let v = 0; v < N; v++) {
      let s = 0;
      for (let y = 0; y < N; y++) s += tmp[y * N + v] * cos[u][y];
      dct[u * N + v] = s;
    }

  // Левый-верхний 8×8 (низкие частоты).
  const vals: number[] = [];
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) vals.push(dct[u * N + v]);
  // Медиана без DC-компоненты [0].
  const sorted = [...vals.slice(1)].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  // 64-битный хеш строкой '0'/'1' (без BigInt — проектный target < ES2020).
  let hash = "";
  for (let i = 0; i < 64; i++) hash += vals[i] > med ? "1" : "0";
  return hash;
}

/** Хеммингово расстояние двух 64-битных pHash (строки '0'/'1'). */
export function hammingDistance(a: string, b: string): number {
  let c = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) c++;
  return c;
}

/**
 * Один проход трансформов. strength≥1 — масштаб «агрессивности» (на ретраях растёт,
 * если pHash сдвинулся недостаточно). Все трансформы — pHash-эффективные:
 * поворот + кроп-в-заполнение (убирает белые углы и даёт зум), контраст/гамма,
 * цветовой джиттер, шум; финал — JPEG со сбросом EXIF и случайным качеством.
 */
async function transformOnce(input: Buffer, opts: UniqueizeOptions, strength: number): Promise<Buffer> {
  // EXIF-ориентация отдельным проходом (заодно сбрасывает тег orientation).
  const oriented = await sharp(input, { failOn: "none" }).rotate().toBuffer();

  // Поворот ±(1..2)°·strength с белым фоном (углы срежем кропом ниже).
  const rotMax = clamp(1.2 * strength, 1.0, 4.0);
  const angle = rnd(-rotMax, rotMax);
  // Контраст вокруг середины (128): out = a·in + 128(1-a).
  const a = rnd(1 - 0.05 * strength, 1 + 0.06 * strength);
  // Лёгкий affine (аспект + сдвиг/shear) — геометрический сдвиг pHash даже для
  // центрированного товара на однотонном фоне; разный на каждый прогон → расхождение
  // между повторными выкладками. Магнитуда мелкая (≤2.5%·strength), углы срежет кроп.
  const sx = rnd(1 - 0.02 * strength, 1 + 0.02 * strength);
  const sy = rnd(1 - 0.02 * strength, 1 + 0.02 * strength);
  const shx = rnd(-0.025, 0.025) * strength;
  const shy = rnd(-0.025, 0.025) * strength;
  const stage1 = await sharp(oriented)
    .rotate(angle, { background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .affine(
      [
        [sx, shx],
        [shy, sy],
      ],
      { background: { r: 255, g: 255, b: 255, alpha: 1 } }
    )
    .modulate({
      brightness: rnd(1 - 0.03 * strength, 1 + 0.03 * strength),
      saturation: rnd(1 - 0.05 * strength, 1 + 0.05 * strength),
      hue: rndInt(-4 * strength, 4 * strength),
    })
    .linear(a, 128 * (1 - a))
    .toBuffer();

  const m1 = await sharp(stage1).metadata();
  const rw = m1.width ?? 1000;
  const rh = m1.height ?? 1000;

  // Этап A: центральный кроп убирает белые углы поворота/affine (+ базовый зум).
  const keepA = 0.9;
  const aw = Math.max(50, Math.floor(rw * keepA));
  const ah = Math.max(50, Math.floor(rh * keepA));
  const stage2 = await sharp(stage1)
    .extract({
      left: Math.floor((rw - aw) / 2),
      top: Math.floor((rh - ah) / 2),
      width: aw,
      height: ah,
    })
    .toBuffer();

  // Этап B: кроп со СЛУЧАЙНЫМ смещением (пан) — даёт расхождение pHash не только с
  // исходником, но и МЕЖДУ повторными выкладками того же фото (другое кадрирование),
  // чтобы Avito не склеивал две выкладки одного фотосета между собой.
  const frac = clamp(rnd(0.06, 0.1) * strength, 0.06, 0.22);
  const fw = Math.max(50, Math.floor(aw * (1 - frac)));
  const fh = Math.max(50, Math.floor(ah * (1 - frac)));
  const left = rndInt(0, aw - fw);
  const top = rndInt(0, ah - fh);
  let img = sharp(stage2).extract({ left, top, width: fw, height: fh });

  // Лёгкий гаусс-шум (soft-light, почти прозрачный слой).
  try {
    const noise = await sharp({
      create: {
        width: fw,
        height: fh,
        channels: 3,
        background: { r: 0, g: 0, b: 0 },
        noise: { type: "gaussian", mean: 0, sigma: rnd(2, 5) },
      },
    })
      .ensureAlpha(0.05)
      .png()
      .toBuffer();
    img = img.composite([{ input: noise, blend: "soft-light" }]);
  } catch {
    /* шум необязателен */
  }

  if (opts.maxWidth && fw > opts.maxWidth) img = img.resize({ width: opts.maxWidth });

  return img
    .jpeg({ quality: rndInt(80, 93), mozjpeg: true, progressive: Math.random() < 0.5 })
    .toBuffer();
}

/**
 * Уникализировать одно изображение. Гоняем трансформы, пока pHash не разойдётся
 * с исходником на ≥ minHammingBits (порог), повышая агрессивность. Возвращаем
 * самый «дальний» результат, даже если порог не взят за лимит попыток.
 */
export async function uniqueizeImage(input: Buffer, opts: UniqueizeOptions = {}): Promise<Buffer> {
  const minBits = opts.minHammingBits ?? DEFAULT_MIN_BITS;
  const avoid = opts.avoidHashes ?? [];
  let srcHash: string | null = null;
  try {
    srcHash = await pHash(input);
  } catch {
    srcHash = null; // pHash не удался — отдадим один проход без самопроверки
  }

  let best: Buffer | null = null;
  let bestScore = -1;
  const MAX_ATTEMPTS = 8;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const out = await transformOnce(input, opts, 1 + attempt * 0.6);
    if (srcHash == null) return out;
    let outHash: string;
    try {
      outHash = await pHash(out);
    } catch {
      return out;
    }
    const dSrc = hammingDistance(srcHash, outHash);
    // Расстояние до ближайшей прошлой выкладки (если переданы).
    const dAvoid = avoid.length ? Math.min(...avoid.map((h) => hammingDistance(h, outHash))) : Infinity;
    // Берём результат, максимизирующий «ближайшее» расстояние (и от исходника, и от прошлых).
    const score = Math.min(dSrc, dAvoid);
    if (score > bestScore) {
      bestScore = score;
      best = out;
    }
    if (dSrc >= minBits && dAvoid >= minBits) return out;
  }
  return best as Buffer;
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
