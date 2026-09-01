import type { RawTransaction } from "./parseCsv";

// Matches dates like "06/01/2026", "06/01", "Jun 01", "2026-06-01" at the start of a line —
// the common layout for bank/credit-card statement transaction lines.
const DATE_PATTERNS: { regex: RegExp; toIso: (m: RegExpMatchArray, year: number) => string | null }[] = [
  {
    // MM/DD/YYYY or MM/DD/YY
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/,
    toIso: (m) => {
      const [, mm, dd, yyRaw] = m;
      const yy = yyRaw.length === 2 ? 2000 + parseInt(yyRaw, 10) : parseInt(yyRaw, 10);
      const d = new Date(yy, parseInt(mm, 10) - 1, parseInt(dd, 10));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    },
  },
  {
    // MM/DD (no year — infer from statement year passed in)
    regex: /^(\d{1,2})\/(\d{1,2})(?!\/\d)/,
    toIso: (m, year) => {
      const [, mm, dd] = m;
      const d = new Date(year, parseInt(mm, 10) - 1, parseInt(dd, 10));
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    },
  },
  {
    // "Jun 01" style
    regex: /^([A-Za-z]{3})\s+(\d{1,2})\b/,
    toIso: (m, year) => {
      const [, mon, dd] = m;
      const d = new Date(`${mon} ${dd}, ${year}`);
      return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    },
  },
];

// Trailing dollar amount, optionally negative/parenthesized: "123.45", "-123.45", "(123.45)"
const AMOUNT_REGEX = /(\(?-?\$?\d{1,3}(?:,\d{3})*\.\d{2}\)?)\s*$/;

function extractAmount(line: string): number | null {
  const match = line.match(AMOUNT_REGEX);
  if (!match) return null;
  let raw = match[1].replace(/[$,]/g, "");
  const isParenNegative = raw.startsWith("(") && raw.endsWith(")");
  raw = raw.replace(/[()]/g, "");
  let value = parseFloat(raw);
  if (isNaN(value)) return null;
  if (isParenNegative) value = -Math.abs(value);
  return value;
}

/**
 * Best-effort extraction of transactions from raw PDF text. Bank/credit-card PDF layouts vary
 * widely, so this uses line-based heuristics: a line starting with a date and ending with a
 * dollar amount is treated as one transaction, with everything in between as the description.
 * Lines that don't match this shape are skipped (not guessed at) — those transactions simply
 * won't appear, which is safer than fabricating data. The caller should tell the user roughly
 * how many lines were extracted so they can sanity-check against the actual statement.
 */
export function parsePdfTransactions(text: string, statementYear: number): RawTransaction[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const results: RawTransaction[] = [];

  for (const line of lines) {
    let iso: string | null = null;
    let dateMatchLength = 0;

    for (const pattern of DATE_PATTERNS) {
      const m = line.match(pattern.regex);
      if (m) {
        iso = pattern.toIso(m, statementYear);
        dateMatchLength = m[0].length;
        break;
      }
    }
    if (!iso) continue;

    const amount = extractAmount(line);
    if (amount === null) continue;

    // Description is whatever sits between the date and the trailing amount.
    const amountMatch = line.match(AMOUNT_REGEX);
    const amountStartIdx = amountMatch ? line.lastIndexOf(amountMatch[1]) : line.length;
    let description = line.slice(dateMatchLength, amountStartIdx).trim();
    // Strip common mid-line noise like a second running-balance number.
    description = description.replace(/\s{2,}/g, " ").trim();

    if (!description) continue;
    // Skip obvious non-transaction lines (headers, balance summaries).
    if (/^(balance|total|payment due|minimum payment|previous balance|new balance)/i.test(description)) {
      continue;
    }

    results.push({
      date: iso,
      description,
      amount: Math.abs(amount),
    });
  }

  return results;
}
