import { pgTable, serial, text, integer, real, boolean } from "drizzle-orm/pg-core";

// One row per uploaded statement file (bank or credit card export)
export const statements = pgTable("statements", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  sourceType: text("source_type").notNull(), // "csv" | "pdf"
  accountLabel: text("account_label"), // e.g. "Chase Checking", user-editable later
  uploadedAt: text("uploaded_at").notNull(), // ISO timestamp
  transactionCount: integer("transaction_count").notNull().default(0),
});

// One row per extracted transaction
export const transactions = pgTable("transactions", {
  id: serial("id").primaryKey(),
  statementId: integer("statement_id").notNull(),
  date: text("date").notNull(), // ISO date YYYY-MM-DD
  description: text("description").notNull(), // raw merchant/description text
  amount: real("amount").notNull(), // positive = expense/outflow
  category: text("category").notNull(), // e.g. "Groceries", "Needs Review"
  isTransfer: boolean("is_transfer").notNull().default(false), // Sreenidhi Zelle etc — excluded from household spend
  needsReview: boolean("needs_review").notNull().default(false),
  createdAt: text("created_at").notNull(),
});
