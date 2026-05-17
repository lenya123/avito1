import { useState, useEffect } from "react";

export type PlatformType = "android" | "ios" | "unknown";

export function getPlatform(): PlatformType {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "unknown";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;

  // iOS Safari
  if ((navigator as unknown as { standalone?: boolean }).standalone === true)
    return true;

  // Android Chrome / other browsers
  if (window.matchMedia("(display-mode: standalone)").matches) return true;

  return false;
}

export function isWebBluetoothSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  return "bluetooth" in navigator;
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.share) return false;
  if (!navigator.canShare) return false;

  try {
    const testFile = new File(["test"], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

export function usePlatformDetect() {
  const [platform, setPlatform] = useState<PlatformType>("unknown");
  const [standalone, setStandalone] = useState(false);
  const [bluetooth, setBluetooth] = useState(false);
  const [shareFiles, setShareFiles] = useState(false);

  useEffect(() => {
    setPlatform(getPlatform());
    setStandalone(isStandalone());
    setBluetooth(isWebBluetoothSupported());
    setShareFiles(canShareFiles());
  }, []);

  return { platform, standalone, bluetooth, shareFiles };
}
