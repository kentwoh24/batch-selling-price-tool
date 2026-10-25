import type { Item } from "./parse";

export const priceTypes = ["normal", "member1", "member2", "member3", "ecom_price"] as const;

export type PriceRow = { code: string; description: string; type: string; price: number; rounded: boolean };
export type QRow = { code: string; description: string; minQty: string; note: string };

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

export function buildRows(items: Item[], hasUom: boolean) {
  const priceRows: PriceRow[] = [];
  const qRows: QRow[] = [];
  const csv: string[] = [];

  for (const it of items) {
    const price = roundIfNeeded(it.price);
    const rounded = price !== it.price;
    for (const type of priceTypes) {
      priceRows.push({ code: it.code, description: it.description, type, price, rounded });
      csv.push(`${it.code},${type},${fmt(price)},`);
    }
    // Q price: a single item that has bundle(s) in the same product group
    if (hasUom && it.uom === 1) {
      const group = it.code.slice(0, 8);
      const bundles = items.filter(
        (b) => b.code !== it.code && b.code.slice(0, 8) === group && (b.uom ?? 1) > 1,
      );
      if (bundles.length) {
        // one Q price row per item; the bundle size(s) are only a hint for keying in Min Qty
        qRows.push({
          code: it.code,
          description: it.description,
          minQty: bundles.map((b) => b.uom).join(" / "),
          note: bundles.map((b) => `bundle ${b.code}`).join(", "),
        });
        csv.push(`${it.code},qprice,,`);
      }
    }
  }
  return { priceRows, qRows, csv };
}
