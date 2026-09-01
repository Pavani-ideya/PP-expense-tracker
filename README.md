# Expense Tracker — Phase 1

Basic version: upload a CSV or PDF bank/credit-card statement, extract transactions, auto-categorize with your rules, and view them in a table. Data persists in a local SQLite database.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000, click "Choose file", and upload a `.csv` or `.pdf` statement.

The database file is created automatically at `data/expenses.db` on first run — it's gitignored, so history stays local to your machine (or, once deployed, lives in Postgres instead — see below).

## How categorization works

See `src/lib/categorize.ts`. Rules are checked in this order:
1. Your explicit rules (Mortgage, Ana Perez → House Cleaner, Ramiro Trello → Gardener, SDGE → Gas & Electric, Olivenhain → Water, De Waal → Pool Service, Fairbanks → HOA, Zelle-to-Sreenidhi → Personal Transfer, Amazon → Amazon Purchases)
2. Grocery store and restaurant keyword lists
3. Secondary common categories (Insurance, Subscriptions, Phone/Internet, Travel, Gas/Fuel, Fees) — added based on patterns in a sample of your real statements, to cut down noise
4. Anything left over is flagged **Needs Review** rather than guessed.

Transfers to Sreenidhi are tagged `isTransfer: true` and excluded from household-spend totals.

## CSV format

Any CSV with recognizable Date / Description / Amount columns (various header names supported — see `src/lib/parseCsv.ts`). Amounts can be positive or negative; sign is normalized.

## PDF format

Text-based PDF statements are parsed line-by-line for a `date ... amount` pattern (see `src/lib/parsePdf.ts` and `src/lib/extractPdfText.ts`). Scanned/image-only PDFs won't extract — a CSV export from your bank is the more reliable path if a PDF doesn't parse.

## What's next (not built yet)

- Dashboard: KPI cards, spending-by-category donut chart, monthly trend chart, top-merchants list
- Editable categories / manual override for "Needs Review" items
- Deployment to Vercel with Postgres (Vercel Postgres or Supabase) so history persists across deploys — current setup uses local SQLite via Drizzle ORM, which is designed to swap to Postgres with minimal schema changes

## Notes on technical choices

- **Drizzle ORM + better-sqlite3** instead of Prisma — Prisma's engine binaries couldn't be downloaded in this build environment (network policy blocked `binaries.prisma.sh`). Drizzle needs no native binary downloads and migrates cleanly to Postgres later.
- **unpdf** for PDF text extraction instead of `pdf-parse` — the popular `pdf-parse` packages bundle a very old pdf.js that failed on modern PDFs (tested with two different generators). `unpdf` is a serverless-friendly, actively maintained wrapper.
- **System fonts** instead of `next/font/google` — Google Fonts was also blocked by network policy in this build environment; won't be an issue on Vercel, but kept as-is to avoid a build-time dependency on external font fetching.
