import { parse } from "csv-parse/sync";

export interface RawTransaction {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // positive = money out (expense)
}

// Common column name variants seen across bank/credit-card CSV exports.
const DATE_KEYS = ["date", "transaction date", "posted date", "posting date"];
const DESC_KEYS = ["description", "merchant", "memo", "payee", "name", "details"];
const AMOUNT_KEYS = ["amount", "debit", "transaction amount"];
const CREDIT_KEYS = ["credit"]; // some exports split debit/credit into two columns

function findKey(row: Record<string, string>, candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const cand of candidates) {
    const match = keys.find((k) => k.trim().toLowerCase() === cand);
    if (match) return match;
  }
  // fallback: partial match
  for (const cand of candidates) {
    const match = keys.find((k) => k.trim().toLowerCase().includes(cand));
    if (match) return match;
  }
  return undefined;
}

function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Try native Date parsing first (handles MM/DD/YYYY, YYYY-MM-DD, etc.)
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }
  return null;
}

export function parseCsvTransactions(fileContent: string): RawTransaction[] {
  const records: Record<string, string>[] = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    // Real-world bank/business CSV exports frequently have unescaped quote characters inside
    // a field (an apostrophe or a stray " in a memo/payee string) that strict RFC 4180 parsing
    // rejects outright with "Invalid Closing Quote". These two options tell the parser to treat
    // a quote that doesn't cleanly close a field as ordinary text instead of failing the whole
    // file — this is exactly the "Homesteadaug.csv" business-checking export failure mode.
    relax_quotes: true,
    bom: true,
  });

  if (records.length === 0) return [];

  const dateKey = findKey(records[0], DATE_KEYS);
  const descKey = findKey(records[0], DESC_KEYS);
  const amountKey = findKey(records[0], AMOUNT_KEYS);
  const creditKey = findKey(records[0], CREDIT_KEYS);

  const results: RawTransaction[] = [];

  for (const row of records) {
    const dateRaw = dateKey ? row[dateKey] : undefined;
    const descRaw = descKey ? row[descKey] : undefined;
    const amountRaw = amountKey ? row[amountKey] : undefined;
    const creditRaw = creditKey ? row[creditKey] : undefined;

    if (!dateRaw || !descRaw) continue;

    const date = normalizeDate(dateRaw);
    if (!date) continue;

    let amount: number | null = null;
    if (amountRaw !== undefined && amountRaw !== "") {
      const parsed = parseFloat(amountRaw.replace(/[^0-9.-]/g, ""));
      if (!isNaN(parsed)) amount = parsed;
    }
    // Some exports have a separate credit column meaning money IN — skip those (not expenses),
    // unless amount came back null and credit is the only value present.
    if (amount === null && creditRaw) {
      continue;
    }
    if (amount === null) continue;

    // Normalize sign: statements often show expenses as negative. We store expenses as positive.
    const normalizedAmount = amount < 0 ? Math.abs(amount) : amount;
    // Skip rows that are clearly incoming payments/credits (negative expense direction) when
    // a distinct sign convention is detected — heuristic: if description suggests a payment/credit.
    if (/payment received|autopay|credit balance refund/i.test(descRaw) && amount < 0) {
      continue;
    }

    results.push({
      date,
      description: descRaw.trim(),
      amount: normalizedAmount,
    });
  }

  return results;
}
