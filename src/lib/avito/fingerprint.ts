/**
 * Антидетект fingerprint система для Avito браузерных сессий.
 *
 * Генерирует уникальный, персистентный fingerprint для каждого аккаунта.
 * Покрывает все основные вектора fingerprinting:
 * - Canvas (getImageData, toDataURL, toBlob)
 * - WebGL (vendor, renderer, unmasked)
 * - AudioContext (AnalyserNode, OfflineAudioContext)
 * - WebRTC (блокировка утечки IP)
 * - ClientRects (getBoundingClientRect, getClientRects)
 * - Screen properties, Navigator overrides
 *
 * Все профили — Windows, язык — русский.
 */

import { randomInt } from "crypto";

// =====================================================
// Типы
// =====================================================

export interface BrowserFingerprint {
  noiseSeed: number;

  userAgent: string;
  viewport: { width: number; height: number };

  screen: {
    width: number;
    height: number;
    availWidth: number;
    availHeight: number;
    colorDepth: number;
    pixelDepth: number;
  };
  devicePixelRatio: number;

  platform: string;
  languages: string[];
  deviceMemory: number;
  hardwareConcurrency: number;
  maxTouchPoints: number;
  doNotTrack: string | null;

  webgl: {
    vendor: string;
    renderer: string;
    unmaskedVendor: string;
    unmaskedRenderer: string;
  };
}

// =====================================================
// Профили устройств (Windows 100%)
// =====================================================

interface GpuVariant {
  vendor: string;
  renderer: string;
  unmaskedVendor: string;
  unmaskedRenderer: string;
}

interface DeviceProfile {
  weight: number;
  screen: { width: number; height: number; availHeight: number };
  pixelRatio: number;
  viewportHeightRange: [number, number];
  memoryOptions: number[];
  coreOptions: number[];
  gpuVariants: GpuVariant[];
}

const DEVICE_PROFILES: DeviceProfile[] = [
  // W1: Десктоп 1080p + NVIDIA (30%)
  {
    weight: 30,
    screen: { width: 1920, height: 1080, availHeight: 1040 },
    pixelRatio: 1,
    viewportHeightRange: [937, 957],
    memoryOptions: [16],
    coreOptions: [8, 12],
    gpuVariants: [
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce RTX 3060/PCIe/SSE2",
      },
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce RTX 3070/PCIe/SSE2",
      },
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce GTX 1660 SUPER/PCIe/SSE2",
      },
    ],
  },
  // W2: Десктоп 1080p + Intel (20%)
  {
    weight: 20,
    screen: { width: 1920, height: 1080, availHeight: 1040 },
    pixelRatio: 1,
    viewportHeightRange: [937, 957],
    memoryOptions: [8, 16],
    coreOptions: [4, 6],
    gpuVariants: [
      {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "Intel Inc.",
        unmaskedRenderer: "Intel(R) UHD Graphics 630",
      },
      {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "Intel Inc.",
        unmaskedRenderer: "Intel(R) UHD Graphics 770",
      },
    ],
  },
  // W3: Десктоп 1080p + AMD (7%)
  {
    weight: 7,
    screen: { width: 1920, height: 1080, availHeight: 1040 },
    pixelRatio: 1,
    viewportHeightRange: [937, 957],
    memoryOptions: [16],
    coreOptions: [8, 12],
    gpuVariants: [
      {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "AMD",
        unmaskedRenderer: "AMD Radeon RX 6600 XT",
      },
      {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "AMD",
        unmaskedRenderer: "AMD Radeon RX 6700 XT",
      },
    ],
  },
  // W4: Ноутбук 1536×864 (15%)
  {
    weight: 15,
    screen: { width: 1536, height: 864, availHeight: 824 },
    pixelRatio: 1.25,
    viewportHeightRange: [724, 744],
    memoryOptions: [8, 16],
    coreOptions: [4, 8],
    gpuVariants: [
      {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "Intel Inc.",
        unmaskedRenderer: "Intel(R) Iris(R) Xe Graphics",
      },
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce MX550 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce MX550/PCIe/SSE2",
      },
    ],
  },
  // W5: Ноутбук 1366×768 (13%)
  {
    weight: 13,
    screen: { width: 1366, height: 768, availHeight: 728 },
    pixelRatio: 1,
    viewportHeightRange: [625, 645],
    memoryOptions: [8],
    coreOptions: [4],
    gpuVariants: [
      {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "Intel Inc.",
        unmaskedRenderer: "Intel(R) UHD Graphics 620",
      },
    ],
  },
  // W6: Монитор 1440p (10%)
  {
    weight: 10,
    screen: { width: 2560, height: 1440, availHeight: 1400 },
    pixelRatio: 1,
    viewportHeightRange: [1297, 1317],
    memoryOptions: [16, 32],
    coreOptions: [8, 16],
    gpuVariants: [
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce RTX 3070/PCIe/SSE2",
      },
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce RTX 3080/PCIe/SSE2",
      },
      {
        vendor: "Google Inc. (NVIDIA)",
        renderer: "ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "NVIDIA Corporation",
        unmaskedRenderer: "NVIDIA GeForce RTX 4060/PCIe/SSE2",
      },
      {
        vendor: "Google Inc. (AMD)",
        renderer: "ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "AMD",
        unmaskedRenderer: "AMD Radeon RX 6700 XT",
      },
    ],
  },
  // W7: Маленький ноутбук 1280×720 (5%)
  {
    weight: 5,
    screen: { width: 1280, height: 720, availHeight: 680 },
    pixelRatio: 1,
    viewportHeightRange: [577, 597],
    memoryOptions: [8],
    coreOptions: [4],
    gpuVariants: [
      {
        vendor: "Google Inc. (Intel)",
        renderer: "ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
        unmaskedVendor: "Intel Inc.",
        unmaskedRenderer: "Intel(R) HD Graphics 620",
      },
    ],
  },
];

const CHROME_VERSIONS = [132, 133, 134];

// =====================================================
// Генератор fingerprint
// =====================================================

function pickRandom<T>(arr: T[]): T {
  return arr[randomInt(0, arr.length)];
}

function pickWeighted(profiles: DeviceProfile[]): DeviceProfile {
  const totalWeight = profiles.reduce((s, p) => s + p.weight, 0);
  let roll = randomInt(0, totalWeight);
  for (const profile of profiles) {
    roll -= profile.weight;
    if (roll < 0) return profile;
  }
  return profiles[profiles.length - 1];
}

const CHROME_BUILD_NUMBERS: Record<number, number> = {
  132: 6834,
  133: 6943,
  134: 7025,
};

function buildUserAgent(chromeVersion: number): string {
  const build = CHROME_BUILD_NUMBERS[chromeVersion] ?? 6422;
  const patch = randomInt(0, 100);
  return (
    `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${chromeVersion}.0.${build}.${patch} Safari/537.36`
  );
}

export function generateFingerprint(): BrowserFingerprint {
  const profile = pickWeighted(DEVICE_PROFILES);
  const gpu = pickRandom(profile.gpuVariants);
  const chromeVersion = pickRandom(CHROME_VERSIONS);
  const [minVH, maxVH] = profile.viewportHeightRange;

  return {
    noiseSeed: randomInt(1, 2 ** 31 - 1),

    userAgent: buildUserAgent(chromeVersion),
    viewport: {
      width: profile.screen.width,
      height: randomInt(minVH, maxVH + 1),
    },

    screen: {
      width: profile.screen.width,
      height: profile.screen.height,
      availWidth: profile.screen.width,
      availHeight: profile.screen.availHeight,
      colorDepth: 24,
      pixelDepth: 24,
    },
    devicePixelRatio: profile.pixelRatio,

    platform: "Win32",
    languages: ["ru-RU", "ru"],
    deviceMemory: pickRandom(profile.memoryOptions),
    hardwareConcurrency: pickRandom(profile.coreOptions),
    maxTouchPoints: 0,
    doNotTrack: null,

    webgl: {
      vendor: gpu.vendor,
      renderer: gpu.renderer,
      unmaskedVendor: gpu.unmaskedVendor,
      unmaskedRenderer: gpu.unmaskedRenderer,
    },
  };
}

/**
 * Обновляет Chrome версию в существующем fingerprint.
 * Вызывается при re-login — всё остальное (GPU, screen, noiseSeed) остаётся прежним,
 * но User-Agent получает актуальную версию Chrome.
 */
export function upgradeChromeVersion(fp: BrowserFingerprint): BrowserFingerprint {
  // Извлекаем текущую версию из UA
  const match = fp.userAgent.match(/Chrome\/(\d+)\./);
  const currentVersion = match ? parseInt(match[1], 10) : 0;

  // Если уже актуальная — не трогаем
  if (CHROME_VERSIONS.includes(currentVersion)) return fp;

  const newVersion = pickRandom(CHROME_VERSIONS);
  return {
    ...fp,
    userAgent: buildUserAgent(newVersion),
  };
}

// =====================================================
// Noise Injection (evaluateOnNewDocument)
// =====================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PuppeteerPage = any;

/**
 * Инжектит все fingerprint overrides через page.evaluateOnNewDocument().
 * Должен вызываться ДО page.goto().
 */
export async function injectFingerprint(
  page: PuppeteerPage,
  fp: BrowserFingerprint
): Promise<void> {
  await page.evaluateOnNewDocument((fp: BrowserFingerprint) => {
    // ===== Seeded PRNG (детерминистичный per-account) =====
    let _seed = fp.noiseSeed;
    function seededRandom(): number {
      _seed = (_seed * 16807) % 2147483647;
      return (_seed & 0x7fffffff) / 0x7fffffff;
    }

    // ===== Screen overrides =====
    const screenProps: Record<string, number> = {
      width: fp.screen.width,
      height: fp.screen.height,
      availWidth: fp.screen.availWidth,
      availHeight: fp.screen.availHeight,
      colorDepth: fp.screen.colorDepth,
      pixelDepth: fp.screen.pixelDepth,
    };

    for (const [prop, value] of Object.entries(screenProps)) {
      Object.defineProperty(screen, prop, {
        get: () => value,
        configurable: true,
      });
    }

    Object.defineProperty(window, "devicePixelRatio", {
      get: () => fp.devicePixelRatio,
      configurable: true,
    });

    // ===== Navigator overrides =====
    Object.defineProperty(navigator, "platform", {
      get: () => fp.platform,
      configurable: true,
    });

    Object.defineProperty(navigator, "languages", {
      get: () => Object.freeze([...fp.languages]),
      configurable: true,
    });

    Object.defineProperty(navigator, "language", {
      get: () => fp.languages[0],
      configurable: true,
    });

    Object.defineProperty(navigator, "deviceMemory", {
      get: () => fp.deviceMemory,
      configurable: true,
    });

    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => fp.hardwareConcurrency,
      configurable: true,
    });

    Object.defineProperty(navigator, "maxTouchPoints", {
      get: () => fp.maxTouchPoints,
      configurable: true,
    });

    Object.defineProperty(navigator, "doNotTrack", {
      get: () => fp.doNotTrack,
      configurable: true,
    });

    // ===== Canvas Noise (стабильный — повторные вызовы дают тот же результат) =====
    // Noise впекается в пиксели canvas ОДИН раз. Все последующие чтения видят уже noised данные.
    const _canvasNoised = new WeakSet<HTMLCanvasElement>();
    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const origPutImageData = CanvasRenderingContext2D.prototype.putImageData as any;

    function ensureCanvasNoised(canvas: HTMLCanvasElement): void {
      if (_canvasNoised.has(canvas)) return;
      if (canvas.width >= 300 || canvas.height >= 100) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = origGetImageData.call(ctx, 0, 0, canvas.width, canvas.height);
      // Сохраняем/восстанавливаем PRNG чтобы canvas noise не влиял на другие подсистемы
      const savedSeed = _seed;
      _seed = fp.noiseSeed;
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, Math.min(255, data[i] + Math.floor((seededRandom() - 0.5) * 10)));
        data[i + 1] = Math.max(
          0,
          Math.min(255, data[i + 1] + Math.floor((seededRandom() - 0.5) * 10))
        );
        data[i + 2] = Math.max(
          0,
          Math.min(255, data[i + 2] + Math.floor((seededRandom() - 0.5) * 10))
        );
      }
      _seed = savedSeed;
      origPutImageData.call(ctx, imageData, 0, 0);
      _canvasNoised.add(canvas);
    }

    // getImageData — сначала впечь noise, потом вернуть (уже noised) пиксели
    CanvasRenderingContext2D.prototype.getImageData = function (
      ...args: Parameters<typeof origGetImageData>
    ) {
      ensureCanvasNoised(this.canvas);
      return origGetImageData.apply(this, args);
    };

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args: Parameters<typeof origToDataURL>) {
      ensureCanvasNoised(this);
      return origToDataURL.apply(this, args);
    };

    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args: Parameters<typeof origToBlob>) {
      ensureCanvasNoised(this);
      return origToBlob.apply(this, args);
    };

    // ===== WebGL Spoofing =====
    const webglParams: Record<number, string> = {
      7936: fp.webgl.vendor, // VENDOR
      7937: fp.webgl.renderer, // RENDERER
      37445: fp.webgl.unmaskedVendor, // UNMASKED_VENDOR_WEBGL
      37446: fp.webgl.unmaskedRenderer, // UNMASKED_RENDERER_WEBGL
    };

    function patchWebGL(proto: WebGLRenderingContext | WebGL2RenderingContext) {
      const origGetParam = proto.getParameter;
      proto.getParameter = function (pname: number) {
        if (pname in webglParams) return webglParams[pname];
        return origGetParam.call(this, pname);
      };

      const origGetExt = proto.getExtension;
      proto.getExtension = function (name: string) {
        if (name === "WEBGL_debug_renderer_info") {
          return {
            UNMASKED_VENDOR_WEBGL: 37445,
            UNMASKED_RENDERER_WEBGL: 37446,
          };
        }
        return origGetExt.call(this, name);
      };
    }

    if (typeof WebGLRenderingContext !== "undefined") {
      patchWebGL(WebGLRenderingContext.prototype);
    }
    if (typeof WebGL2RenderingContext !== "undefined") {
      patchWebGL(WebGL2RenderingContext.prototype as unknown as WebGLRenderingContext);
    }

    // ===== AudioContext Noise =====
    if (typeof AnalyserNode !== "undefined") {
      const origGetByteFreq = AnalyserNode.prototype.getByteFrequencyData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AnalyserNode.prototype.getByteFrequencyData = function (array: any) {
        origGetByteFreq.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.max(0, Math.min(255, array[i] + Math.floor((seededRandom() - 0.5) * 4)));
        }
      };

      const origGetFloatFreq = AnalyserNode.prototype.getFloatFrequencyData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AnalyserNode.prototype.getFloatFrequencyData = function (array: any) {
        origGetFloatFreq.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (seededRandom() - 0.5) * 0.0002;
        }
      };

      // Time-domain методы — также используются для fingerprinting
      const origGetByteTime = AnalyserNode.prototype.getByteTimeDomainData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AnalyserNode.prototype.getByteTimeDomainData = function (array: any) {
        origGetByteTime.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] = Math.max(0, Math.min(255, array[i] + Math.floor((seededRandom() - 0.5) * 4)));
        }
      };

      const origGetFloatTime = AnalyserNode.prototype.getFloatTimeDomainData;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      AnalyserNode.prototype.getFloatTimeDomainData = function (array: any) {
        origGetFloatTime.call(this, array);
        for (let i = 0; i < array.length; i++) {
          array[i] += (seededRandom() - 0.5) * 0.0002;
        }
      };
    }

    if (typeof OfflineAudioContext !== "undefined") {
      const origStartRendering = OfflineAudioContext.prototype.startRendering;
      OfflineAudioContext.prototype.startRendering = function () {
        return origStartRendering.call(this).then((buffer: AudioBuffer) => {
          for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
              data[i] += (seededRandom() - 0.5) * 0.0001;
            }
          }
          return buffer;
        });
      };
    }

    // ===== WebRTC блокировка =====
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const OrigRTC = (window as any).RTCPeerConnection || (window as any).webkitRTCPeerConnection;
    if (OrigRTC) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const BlockedRTC = function (this: any, config?: RTCConfiguration) {
        const pc = new OrigRTC(config);
        pc.addEventListener("icecandidate", (e: RTCPeerConnectionIceEvent) => {
          if (e.candidate) {
            Object.defineProperty(e, "candidate", { value: null });
          }
        });
        // Блокируем IP в SDP (localDescription)
        const origLocalDesc = Object.getOwnPropertyDescriptor(
          RTCPeerConnection.prototype,
          "localDescription"
        );
        if (origLocalDesc?.get) {
          Object.defineProperty(pc, "localDescription", {
            get() {
              const desc = origLocalDesc.get!.call(this);
              if (desc?.sdp) {
                return {
                  ...desc,
                  sdp: desc.sdp.replace(
                    /a=candidate:[^\r\n]*/g,
                    "a=candidate:1 1 UDP 1 0.0.0.0 9 typ host"
                  ),
                };
              }
              return desc;
            },
            configurable: true,
          });
        }
        return pc;
      };
      BlockedRTC.prototype = OrigRTC.prototype;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).RTCPeerConnection = BlockedRTC;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitRTCPeerConnection = BlockedRTC;
    }

    // Блокируем доступ к медиа-устройствам
    if (navigator.mediaDevices) {
      navigator.mediaDevices.getUserMedia = () =>
        Promise.reject(new DOMException("Permission denied", "NotAllowedError"));

      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
    }

    // ===== ClientRects Noise (стабильный per-element через WeakMap) =====
    const _elemNoise = new WeakMap<Element, number>();

    function getElementNoise(el: Element): number {
      let noise = _elemNoise.get(el);
      if (noise === undefined) {
        noise = (seededRandom() - 0.5) * 1.0; // ±0.5px
        _elemNoise.set(el, noise);
      }
      return noise;
    }

    const origGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const rect = origGetBCR.call(this);
      const noise = getElementNoise(this);
      return new DOMRect(
        rect.x + noise,
        rect.y + noise,
        rect.width + noise * 0.5,
        rect.height + noise * 0.5
      );
    };

    const origGetCR = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      const rects = origGetCR.call(this);
      const noise = getElementNoise(this);
      const noisedRects: DOMRect[] = [];

      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        noisedRects.push(
          new DOMRect(r.x + noise, r.y + noise, r.width + noise * 0.5, r.height + noise * 0.5)
        );
      }

      return {
        length: noisedRects.length,
        item: (index: number) => noisedRects[index] ?? null,
        [Symbol.iterator]: function* () {
          for (const rect of noisedRects) yield rect;
        },
      } as DOMRectList;
    };
  }, fp);
}

/**
 * Возвращает Chrome launch args для WebRTC блокировки.
 */
export function getWebRtcBlockArgs(): string[] {
  return ["--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
}
