/** dd.mm.yyyy → yyyy-mm-dd */
export function displayToIso(display: string): string {
  if (!display) return "";
  const [day, month, year] = display.split(".");
  if (!day || !month || !year) return "";
  return `${year}-${month}-${day}`;
}

/** yyyy-mm-dd → dd.mm.yyyy */
export function isoToDisplay(iso: string): string {
  if (!iso) return "";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "";
  return `${day}.${month}.${year}`;
}
