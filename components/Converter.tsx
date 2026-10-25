"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseWorkbook, type Block, type ParsedFile } from "@/lib/parse";
import { buildRows, fmt, toDisplay } from "@/lib/build";

type Tab = "prices" | "qprice" | "csv";

export default function Converter() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [date, setDate] = useState("");
  const [checked, setChecked] = useState(false);
  const [pickedBlock, setPickedBlock] = useState("");
  const [tab, setTab] = useState<Tab>("prices");

  async function loadFile(file: File | undefined) {
    if (!file) return;
    setFileError("");
    setParsed(null);
    setChecked(false);
    setPickedBlock("");
    if (!/\.xlsx$/i.test(file.name)) {
      setFileError("Please attach an Excel .xlsx file (open the file in Excel and Save As .xlsx if it is .xls).");
      return;
    }
    setLoading(true);
    try {
      const p = await parseWorkbook(await file.arrayBuffer());
      setFileName(file.name);
      if (!p.blocks.length) {
        setFileError(
          'Could not find a selling price column (e.g. "NormalSP", "Selling Price", "SP") with a "Date :" or "eff :" above it, plus an "ARMS Code" column. Please check the file.',
        );
        return;
      }
      setParsed(p);
    } catch {
      setFileError("Could not read this file. Is it a valid, un-protected .xlsx?");
    } finally {
      setLoading(false);
    }
  }

  const matches: Block[] = useMemo(
    () => (parsed && date ? parsed.blocks.filter((b) => b.dates.some((d) => d.iso === date)) : []),
    [parsed, date],
  );
  const block =
    matches.length === 1 ? matches[0] : matches.find((m) => m.id === pickedBlock);
  const matchedKinds = block
    ? block.dates.filter((d) => d.iso === date).map((d) => d.kind).join(" & ")
    : "";

  const result = useMemo(() => {
    if (!parsed || !block) return null;
    const ex = parsed.extract(block.id);
    return { ...ex, ...buildRows(ex.items, ex.hasUom) };
  }, [parsed, block]);

  const allDates = useMemo(
    () =>
      parsed
        ? parsed.blocks.flatMap((b) => b.dates.map((d) => ({ ...d, block: b.id })))
        : [],
    [parsed],
  );
  const uniqueDates = useMemo(() => {
    const m = new Map<string, string>();
    allDates.forEach((d) => m.set(d.iso + d.kind, `${d.kind} ${toDisplay(d.iso)}`));
    return [...m.entries()].map(([k, label]) => ({ iso: k.slice(0, 10), label }));
  }, [allDates]);

  const showResult = checked && !!block && !!result;
  const showError = checked && !!parsed && matches.length === 0;
  const showPick = checked && matches.length > 1 && !block;

  function reset() {
    setParsed(null);
    setFileName("");
    setFileError("");
    setDate("");
    setChecked(false);
    setPickedBlock("");
    setTab("prices");
    if (inputRef.current) inputRef.current.value = "";
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.refresh();
  }

  function download() {
    if (!result || !block) return;
    const blob = new Blob([result.csv.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `batch_selling_price_${date}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen text-slate-800">
      <header className="border-b-4 border-brand bg-white shadow-sm">
        <div className="mx-auto flex max-w-5xl items-center gap-5 px-6 py-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rakan-logo.png" alt="Rakan" className="h-16 w-auto" />
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-brand md:text-3xl">
              Batch-Selling-Price Conversion
            </h1>
            <p className="text-sm text-slate-500">
              Attach the price list, type the date, download the import file.
            </p>
          </div>
          <span className="hidden rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand sm:block">
            Your file stays on this computer
          </span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8">
        {/* Step 1 + 2 */}
        <section className="grid gap-6 md:grid-cols-[1fr_320px]">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <StepTitle n={1} title="Attach the price list (Excel)" />
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => loadFile(e.target.files?.[0])}
            />
            {!parsed ? (
              <>
                <button
                  onClick={() => inputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    loadFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`mt-4 flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-14 text-slate-500 transition hover:border-brand hover:bg-brand-soft ${
                    dragging ? "border-brand bg-brand-soft" : "border-slate-300 bg-slate-50"
                  }`}
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-2xl text-brand">⬆</span>
                  <span className="mt-2 font-medium text-slate-700">
                    {loading ? "Reading file…" : "Click here, or drag your .xlsx file in"}
                  </span>
                </button>
                {fileError && (
                  <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {fileError}
                  </p>
                )}
              </>
            ) : (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-brand/30 bg-brand-soft px-4 py-3">
                <div>
                  <p className="font-medium text-brand-dark">{fileName}</p>
                  <p className="text-xs text-brand">
                    Found {parsed.blocks.length} price columns with a date
                    {parsed.noDateColumns > 0 &&
                      ` (${parsed.noDateColumns} more had no date and are ignored)`}
                  </p>
                </div>
                <button
                  onClick={reset}
                  className="text-sm text-slate-500 underline hover:text-slate-800"
                >
                  Remove
                </button>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <StepTitle n={2} title="Type the date" />
            <label className="mt-4 block text-sm text-slate-600">
              Date or effective date
            </label>
            <input
              type="date"
              value={date}
              disabled={!parsed}
              onChange={(e) => {
                setDate(e.target.value);
                setChecked(false);
                setPickedBlock("");
              }}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100"
            />
            <button
              disabled={!parsed || !date}
              onClick={() => setChecked(true)}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-2.5 font-medium text-white transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Find prices
            </button>
            <p className="mt-3 text-xs text-slate-500">
              Must match exactly: either the “Date” or the “eff” date written in
              the sheet.
            </p>
          </div>
        </section>

        {/* Error: no exact match */}
        {showError && (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm">
            <h2 className="font-semibold text-accent">
              No exact match for {toDisplay(date)}
            </h2>
            <p className="mt-1 text-sm text-red-700">
              Nothing was extracted. Check the date, or pick one of the dates
              found in this file:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {uniqueDates.map((d) => (
                <DateChip
                  key={d.label}
                  label={d.label}
                  onClick={() => {
                    setDate(d.iso);
                    setChecked(false);
                  }}
                />
              ))}
            </div>
          </section>
        )}

        {/* Same date found in more than one price column */}
        {showPick && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 shadow-sm">
            <h2 className="font-semibold text-amber-900">
              {toDisplay(date)} appears in {matches.length} price columns. Which one?
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setPickedBlock(m.id)}
                  className="rounded-full border border-amber-400 bg-white px-3 py-1 text-sm text-amber-900 hover:bg-amber-100"
                >
                  Column {m.colLetter}
                  {m.sheet ? ` (sheet ${m.sheet})` : ""}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Step 3 */}
        {showResult && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <StepTitle n={3} title="Check and download" />
            <p className="mt-3 text-sm text-slate-600">
              Matched <b>{matchedKinds}</b> {toDisplay(date)} → price column{" "}
              <b>{block.colLetter}</b> “{block.priceHeader}”{" "}
              <span className="font-mono text-xs text-slate-500">
                ({block.dates.map((d) => d.label).join(" / ")})
              </span>
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Items found" value={result.items.length} />
              <Tile label="Price rows" value={result.priceRows.length} />
              <Tile label="Q price rows (price empty)" value={result.qRows.length} />
              <Tile
                label="Need attention"
                value={result.skipped.length}
                warn={result.skipped.length > 0}
              />
            </div>

            {result.skipped.length > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <b>Skipped (not in the CSV):</b>
                <ul className="mt-1 list-disc pl-5">
                  {result.skipped.map((s) => (
                    <li key={s.row}>
                      <span className="font-mono">{s.code}</span> {s.description}{" "}
                      <span className="text-amber-700">
                        — {s.reason} (row {s.row})
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.warnings.map((w) => (
              <p key={w} className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                {w}
              </p>
            ))}
            {result.items.length === 0 && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                No prices were found in this column, so there is nothing to download.
              </p>
            )}

            <div className="mt-6 flex gap-1 border-b border-slate-200 text-sm">
              <TabBtn active={tab === "prices"} onClick={() => setTab("prices")}>
                Prices ({result.priceRows.length})
              </TabBtn>
              <TabBtn active={tab === "qprice"} onClick={() => setTab("qprice")}>
                Q price to key in ({result.qRows.length})
              </TabBtn>
              <TabBtn active={tab === "csv"} onClick={() => setTab("csv")}>
                CSV preview
              </TabBtn>
            </div>

            {tab === "prices" && (
              <div className="max-h-96 overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-brand-soft text-xs uppercase text-brand-dark">
                    <tr>
                      <th className="px-3 py-2">ARMS Code</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Type</th>
                      <th className="px-3 py-2 text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.priceRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono">{r.code}</td>
                        <td className="px-3 py-1.5">{r.description}</td>
                        <td className="px-3 py-1.5">{r.type}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {fmt(r.price)}
                          {r.rounded && (
                            <span className="ml-1 text-xs text-slate-400">
                              rounded
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "qprice" && (
              <div>
                <p className="py-3 text-sm text-slate-600">
                  These rows go into the CSV with the price empty. After you
                  upload, key in the Min Qty and price on the form. Suggested
                  Min Qty is from the bundle size.
                </p>
                <table className="w-full text-left text-sm">
                  <thead className="bg-brand-soft text-xs uppercase text-brand-dark">
                    <tr>
                      <th className="px-3 py-2">ARMS Code</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Suggested Min Qty</th>
                      <th className="px-3 py-2">Why</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.qRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-1.5 font-mono">{r.code}</td>
                        <td className="px-3 py-1.5">{r.description}</td>
                        <td className="px-3 py-1.5">{r.minQty}</td>
                        <td className="px-3 py-1.5 text-slate-500">{r.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === "csv" && (
              <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
                {result.csv.join("\n")}
              </pre>
            )}

            <div className="mt-6 flex items-center gap-4">
              <button
                onClick={download}
                disabled={result.csv.length === 0}
                className="rounded-lg bg-brand px-6 py-3 font-semibold text-white shadow-md transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                ⬇ Download CSV ({result.csv.length} rows)
              </button>
              <span className="text-xs text-slate-500">
                Then: Batch Selling Price Change → Import from CSV
              </span>
            </div>
          </section>
        )}
      </main>

      <footer className="py-8 text-center text-xs text-slate-400">
        Rakan Anda Yang Dipercayai
      </footer>

    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <h2 className="flex items-center gap-3 font-semibold">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-sm text-white">
        {n}
      </span>
      {title}
    </h2>
  );
}

function Tile({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 ${
        active
          ? "border-brand font-medium text-brand"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function DateChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full border border-red-300 bg-white px-3 py-1 text-sm text-red-800 hover:bg-red-100"
    >
      {label}
    </button>
  );
}
