import { parse } from "csv-parse/sync";

export interface RawTransaction {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: number; // positive magnitude — direction lives in isIncome
  isIncome: boolean; // true = money IN (deposit/credit/interest/refund) — never an expense
}

// Common column name variants seen across bank/credit-card CSV exports.
const DATE_KEYS = ["date", "transaction date", "posted date", "posting date"];
const DESC_KEYS = ["description", "merchant", "memo", "payee", "name", "details"];
// A single combined amount column (sign indicates direction) — checked only when no separate
// debit/credit columns exist.
const AMOUNT_KEYS = ["amount", "transaction amount"];
// Separate debit/credit (or withdrawal/deposit) columns — common in bank checking exports.
const DEBIT_KEYS = ["debit", "withdrawal", "withdrawals", "money out"];
const CREDIT_KEYS = ["credit", "deposit", "deposits", "money in"];
// An explicit transaction-type column some exports include instead of/alongside amount.
const TYPE_KEYS = ["type", "transaction type", "debit/credit"];

// Description phrases that are unambiguously money coming IN, used as a safety net when the
// sign/column convention is ambiguous or the file doesn't distinguish debit vs credit cleanly.
export const INCOME_DESCRIPTION_HINTS =
  /deposit|direct dep|payroll|interest earned|dividend|refund|reversal|cash back reward|rebate|fee waiver|zelle payment from|incoming transfer/i;

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
  const debitKey = findKey(records[0], DEBIT_KEYS);
  const creditKey = findKey(records[0], CREDIT_KEYS);
  // Only fall back to a single combined amount column when there isn't a proper debit/credit
  // pair — otherwise a column literally named "Debit" would get matched twice.
  const amountKey = debitKey && creditKey ? undefined : findKey(records[0], AMOUNT_KEYS);
  const typeKey = findKey(records[0], TYPE_KEYS);

  const results: RawTransaction[] = [];

  for (const row of records) {
    const dateRaw = dateKey ? row[dateKey] : undefined;
    const descRaw = descKey ? row[descKey] : undefined;
    if (!dateRaw || !descRaw) continue;

    const date = normalizeDate(dateRaw);
    if (!date) continue;

    const toNumber = (raw: string | undefined): number | null => {
      if (raw === undefined || raw.trim() === "") return null;
      const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
      return isNaN(parsed) ? null : parsed;
    };

    let amount: number | null = null;
    let isIncome = false;

    if (debitKey && creditKey) {
      // Two-column style: a value in Debit means money out, a value in Credit means money in.
      // Both are usually stored as positive magnitudes in these exports.
      const debitVal = toNumber(row[debitKey]);
      const creditVal = toNumber(row[creditKey]);
      if (debitVal !== null && debitVal !== 0) {
        amount = Math.abs(debitVal);
        isIncome = false;
      } else if (creditVal !== null && creditVal !== 0) {
        amount = Math.abs(creditVal);
        isIncome = true;
      }
    } else if (amountKey) {
      // Single combined column: sign carries the direction. Standard convention for bank
      // checking/statement exports is negative = money out (expense), positive = money in
      // (deposit/credit) — this is the convention that was previously being discarded by
      // taking Math.abs() unconditionally, which is why deposits were showing up as expenses.
      const raw = toNumber(row[amountKey]);
      if (raw !== null) {
        amount = Math.abs(raw);
        isIncome = raw > 0;
      }
    }

    if (amount === null) continue;

    // An explicit type column, when present, is the most reliable signal and overrides the
    // sign-based guess above (e.g. some exports list charges as positive numbers with a
    // separate "Type: DEBIT/CREDIT" column).
    const typeRaw = typeKey ? row[typeKey] : undefined;
    if (typeRaw) {
      const t = typeRaw.toLowerCase();
      if (/credit|deposit/.test(t)) isIncome = true;
      else if (/debit|withdrawal|purchase|payment/.test(t)) isIncome = false;
    }

    // Description-based safety net: catches deposits/interest/refunds on statements whose sign
    // or column convention doesn't cleanly indicate direction.
    if (INCOME_DESCRIPTION_HINTS.test(descRaw)) {
      isIncome = true;
    }

    results.push({
      date,
      description: descRaw.trim(),
      amount,
      isIncome,
    });
  }

  return results;
}
