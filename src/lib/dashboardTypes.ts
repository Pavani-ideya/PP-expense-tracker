export interface DashboardData {
  totalSpend: number;
  averageMonthly: number;
  largestCategory: { category: string; total: number };
  monthlyTrend: { month: string; total: number }[];
  categoryTotals: { category: string; total: number }[];
  topMerchants: { merchant: string; total: number; count: number }[];
  needsReviewCount: number;
  transferTotal: number;
  transactionCount: number;
  availableMonths: string[];
  availableCategories: string[];
  filteredTransactionCount: number;
}
