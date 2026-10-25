import type { Worksheet, CellValue } from "exceljs";

export type DateTag = { iso: string; label: string; kind: "Date" | "eff" };

export type Block = {
  id: string;
  sheet: string;
  colLetter: string;
  priceHeader: string;
  dates: DateTag[];
};

export type Item = {
  code: string;
  description: string;
  uom: number | null;
  price: number;
};

export type Skipped = { row: number; code: string; description: string; reason: string };

export type Extracted = {
  items: Item[];
  skipped: Skipped[];
  warnings: string[];
  hasUom: boolean;
};

type InternalBlock = Block & {
  ws: Worksheet;
  headerRow: number;
  priceCol: number;
  codeCol: number;
  descCol: number | null;
  uomCol: number | null;
};

export type ParsedFile = {
  blocks: Block[];
  noDateColumns: number;
  extract: (blockId: string) => Extracted;
};

const MAX_ROWS_ABOVE = 8; // how far above the "NormalSP" heading we look for a date
const MAX_COL_DISTANCE = 4; // how far sideways a date may sit from its NormalSP column

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function raw(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return raw(o.result as CellValue);
    if ("richText" in o) return (o.richText as { text: string }[]).map((t) => t.text).join("");
    if ("text" in o) return o.text;
    return null;
  }
  return v;
}

function text(v: CellValue): string {
  const r = raw(v);
  if (r === null) return "";
  if (r instanceof Date) return "";
  return String(r).trim();
}

function num(v: CellValue): number | null {
  const r = raw(v);
  if (typeof r === "number") return r;
  if (typeof r === "string") {
    const n = parseFloat(r.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDateCell(v: CellValue): DateTag | null {
  const r = raw(v);
  if (r instanceof Date) {
    const s = iso(r.getUTCFullYear(), r.getUTCMonth() + 1, r.getUTCDate());
    return s ? { iso: s, label: s, kind: "Date" } : null;
  }
  if (typeof r !== "string") return null;
  // Only "Date : ..." / "eff : ..." labels, or a cell holding just a date.
  // Notes such as "18.01.24-Price Increase" or "Online S.Price 15.05.25" are ignored.
  if (!/^\s*(date|eff)/i.test(r) && !/^\s*\d{1,2}\s*[./-]\s*\d{1,2}\s*[./-]\s*\d{2,4}\s*$/.test(r)) return null;
  const m = r.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{4}|\d{2})(?!\d)/);
  if (!m) return null;
  const s = iso(+m[3], +m[2], +m[1]);
  if (!s) return null;
  return { iso: s, label: r.replace(/\s+/g, " ").trim(), kind: /eff/i.test(r) ? "eff" : "Date" };
}

// Words that mean "this is another kind of price / not the selling price"
const NOT_PREFIX = ["ecom","online","member","cost","margin","landed","quo","factory","label","pack","discount","rebate","payment","charge","sst","gst","tax","total","qty","stock","mlk","rwg","bbc"];
const NOT_WORD = ["gp","vs","old","prev","previous"];
function notSelling(label: string): boolean {
  return label
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((w) => NOT_WORD.includes(w) || NOT_PREFIX.some((p) => w.startsWith(p)));
}

// 1 = "Normal SP" style heading (best), 2 = any other selling-price heading, 0 = not a price heading
function priceRank(t: string, label: string): number {
  if (!t || label.length > 40) return 0;
  if (t.includes("normal") && /(sp|sellingprice|price|sprice)$/.test(t)) return 1;
  if (notSelling(label)) return 0;
  if (
    /^(sp|price|rrp|newsp|newprice|latestsp|latestprice|currentsp|sellp|sellprice|retailprice|retailsp|unitprice)$/.test(t) ||
    /(sellingprice|sellprice|sprice|retailprice|newsellingprice|sellingp)/.test(t) ||
    /^(new|latest|proposed|revised|confirmed)?(sp|sprice)$/.test(t) ||
    /^(new|latest|proposed|revised|confirmed)(selling)?price$/.test(t)
  )
    return 2;
  return 0;
}

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function codeOf(v: CellValue): string {
  const r = raw(v);
  if (typeof r === "number") return String(Math.round(r));
  return typeof r === "string" ? r.trim() : "";
}

export async function parseWorkbook(buffer: ArrayBuffer): Promise<ParsedFile> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const internal: InternalBlock[] = [];
  let noDate = 0;

  wb.eachSheet((ws) => {
    const priceHeads: { row: number; col: number; rank: number; label: string }[] = [];
    const codeHeads: { row: number; col: number }[] = [];
    const descHeads: { row: number; col: number }[] = [];
    const uomHeads: { row: number; col: number }[] = [];
    const dateCells: { row: number; col: number; tag: DateTag }[] = [];

    ws.eachRow({ includeEmpty: false }, (row, rowNo) => {
      row.eachCell({ includeEmpty: false }, (cell, colNo) => {
        const label = text(cell.value).replace(/\s+/g, " ");
        const t = norm(label);
        const rank = priceRank(t, label);
        if (rank) priceHeads.push({ row: rowNo, col: colNo, rank, label });
        else if (t === "armscode" || t === "armscodes") codeHeads.push({ row: rowNo, col: colNo });
        else if (t === "descriptions" || t === "description") descHeads.push({ row: rowNo, col: colNo });
        else if (t === "uom") uomHeads.push({ row: rowNo, col: colNo });
        const tag = parseDateCell(cell.value);
        if (tag) dateCells.push({ row: rowNo, col: colNo, tag });
      });
    });

    if (!priceHeads.length || !codeHeads.length) return;

    // Use the best kind of selling-price heading found on this sheet
    // (e.g. "Normal SP" first, then general "Selling Price" / "SP" headings).
    const bestRank = Math.min(...priceHeads.map((p) => p.rank));
    for (let i = priceHeads.length - 1; i >= 0; i--) {
      if (priceHeads[i].rank !== bestRank) priceHeads.splice(i, 1);
    }

    const nearestRow = (list: { row: number; col: number }[], row: number) =>
      list.length
        ? list.reduce((a, b) => (Math.abs(b.row - row) < Math.abs(a.row - row) ? b : a))
        : null;

    const blocks = priceHeads.map((p) => {
      const code = nearestRow(codeHeads, p.row)!;
      const desc = nearestRow(descHeads, p.row);
      const uom = nearestRow(uomHeads, p.row);
      const b: InternalBlock = {
        id: `${ws.name}!${colLetter(p.col)}${p.row}`,
        sheet: ws.name,
        colLetter: colLetter(p.col),
        priceHeader: p.label,
        dates: [],
        ws,
        headerRow: p.row,
        priceCol: p.col,
        codeCol: code.col,
        descCol: desc ? desc.col : null,
        uomCol: uom ? uom.col : null,
      };
      return b;
    });

    for (const d of dateCells) {
      let best: InternalBlock | null = null;
      for (const b of blocks) {
        if (d.row > b.headerRow || b.headerRow - d.row > MAX_ROWS_ABOVE) continue;
        const dist = Math.abs(d.col - b.priceCol);
        if (dist > MAX_COL_DISTANCE) continue;
        if (!best || dist < Math.abs(d.col - best.priceCol) ||
            (dist === Math.abs(d.col - best.priceCol) && b.priceCol < best.priceCol)) best = b;
      }
      if (best && !best.dates.some((x) => x.iso === d.tag.iso && x.kind === d.tag.kind)) {
        best.dates.push(d.tag);
      }
    }

    for (const b of blocks) {
      if (b.dates.length) internal.push(b);
      else noDate++;
    }
  });

  const extract = (blockId: string): Extracted => {
    const b = internal.find((x) => x.id === blockId);
    if (!b) return { items: [], skipped: [], warnings: ["Block not found"], hasUom: false };
    const items: Item[] = [];
    const skipped: Skipped[] = [];
    const warnings: string[] = [];
    const seen = new Set<string>();
    const last = b.ws.rowCount;
    for (let r = b.headerRow + 1; r <= last; r++) {
      const row = b.ws.getRow(r);
      const code = codeOf(row.getCell(b.codeCol).value);
      if (!/^\d{8,14}$/.test(code)) continue; // blank / group / total rows
      const description = b.descCol ? text(row.getCell(b.descCol).value) : "";
      const price = num(row.getCell(b.priceCol).value);
      if (price === null) {
        skipped.push({ row: r, code, description, reason: "no Normal SP in the sheet" });
        continue;
      }
      if (price <= 0) {
        skipped.push({ row: r, code, description, reason: `Normal SP is ${price}` });
        continue;
      }
      if (seen.has(code)) {
        skipped.push({ row: r, code, description, reason: "duplicate ARMS Code (first one kept)" });
        continue;
      }
      seen.add(code);
      const uom = b.uomCol ? num(row.getCell(b.uomCol).value) : null;
      items.push({ code, description, uom, price });
    }
    if (!b.uomCol) warnings.push("No UOM column found, so no Q price rows were made.");
    return { items, skipped, warnings, hasUom: !!b.uomCol };
  };

  return {
    blocks: internal.map(({ id, sheet, colLetter, priceHeader, dates }) => ({ id, sheet, colLetter, priceHeader, dates })),
    noDateColumns: noDate,
    extract,
  };
}
