// Web Share API wrapper for sharing label images (iOS flow)

export async function shareLabels(
  blobs: Blob[],
  filenames: string[]
): Promise<void> {
  const files = blobs.map(
    (blob, i) => new File([blob], filenames[i] || `label-${i + 1}.png`, { type: "image/png" })
  );

  if (navigator.share && navigator.canShare?.({ files })) {
    await navigator.share({
      title: `Этикетки (${files.length} шт.)`,
      files,
    });
    return;
  }

  // Fallback: download all files
  await downloadLabels(blobs, filenames);
}

export async function downloadLabels(
  blobs: Blob[],
  filenames: string[]
): Promise<void> {
  for (let i = 0; i < blobs.length; i++) {
    const url = URL.createObjectURL(blobs[i]);
    const a = document.createElement("a");
    a.href = url;
    a.download = filenames[i] || `label-${i + 1}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Small delay between downloads to avoid browser blocking
    if (i < blobs.length - 1) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}

export function canShareFiles(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.share || !navigator.canShare) return false;

  try {
    const testFile = new File(["test"], "test.png", { type: "image/png" });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}
