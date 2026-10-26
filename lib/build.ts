import type { Item } from "./parse";

export const priceTypes = ["normal", "member1", "member2", "member3", "ecom_price"] as const;

export type PriceRow = { code: string; description: string; type: string; price: number; rounded: boolean };

// Round to 2 decimals only when the sheet has more than 2.
export function roundIfNeeded(n: number): number {
  const s = String(n);
  const dec = s.includes(".") ? s.split(".")[1].length : 0;
  return dec > 2 ? Math.round(n * 100) / 100 : n;
}

export function fmt(n: number): string {
  return n.toFixed(2);
}

export function toDisplay(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function buildRows(items: Item[]) {
  const priceRows: PriceRow[] = [];
  const csv: string[] = [];

  for (const it of items) {
    const price = roundIfNeeded(it.price);
    const rounded = price !== it.price;
    for (const type of priceTypes) {
      priceRows.push({ code: it.code, description: it.description, type, price, rounded });
      csv.push(`${it.code},${type},${fmt(price)},`);
    }
  }
  return { priceRows, csv };
}
