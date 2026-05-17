/** Standard size ordering for display */
export const sizeOrder = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "XXL",
  "XXXL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "38",
  "39",
  "40",
  "41",
  "42",
  "43",
  "44",
  "45",
  "46",
  "48",
  "50",
  "52",
  "54",
  "56",
  "58",
  "ONE SIZE",
];

/** Sort an array of objects with a `size` property according to the standard ordering */
export function sortSizeEntries<T extends { size: string }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => {
    const indexA = sizeOrder.indexOf(a.size);
    const indexB = sizeOrder.indexOf(b.size);
    if (indexA === -1 && indexB === -1) return a.size.localeCompare(b.size);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}

/** Sort an array of size strings according to the standard ordering */
export function sortSizes(sizes: string[]): string[] {
  return [...sizes].sort((a, b) => {
    const indexA = sizeOrder.indexOf(a);
    const indexB = sizeOrder.indexOf(b);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });
}
