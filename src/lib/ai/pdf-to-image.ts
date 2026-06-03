/**
 * PDF → PNG конвертер первой страницы.
 *
 * Используется когда клиент шлёт банковский чек как PDF-документ
 * (напр. через «Поделиться чеком» в Тинькофф/Сбер). Vision API gpt-4o
 * принимает только изображения, поэтому конвертируем первую страницу
 * в PNG-буфер для последующей загрузки в Storage и анализа.
 */

import { pdf } from "pdf-to-img";

export async function pdfBufferToFirstPagePng(pdfBuffer: Buffer): Promise<Buffer> {
  const doc = await pdf(pdfBuffer, { scale: 2 });
  const iterator = doc[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done || !first.value) {
    throw new Error("PDF has no pages");
  }
  return first.value;
}
