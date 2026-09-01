// Categorization engine.
// Priority order matters: more specific / user-specified rules are checked first.
// Anything that doesn't confidently match falls through to "Needs Review" — we never guess.

export const NEEDS_REVIEW = "Needs Review";
export const TRANSFER_CATEGORY = "Personal Transfer (Sreenidhi)";

interface Rule {
  category: string;
  keywords: string[]; // matched case-insensitively as substrings against the description
  isTransfer?: boolean;
}

// Explicit rules from the user's instructions — checked first, highest confidence.
const EXPLICIT_RULES: Rule[] = [
  { category: "Mortgage/Housing", keywords: ["mortgage", "newrez", "shellpoint"] },
  { category: "House Cleaner", keywords: ["ana perez"] },
  { category: "Gardener", keywords: ["ramiro trello", "ramero trello", "romero trello"] },
  { category: "Gas & Electric", keywords: ["sdge", "sd gas & elec", "sd gas and elec", "san diego gas"] },
  { category: "Water", keywords: ["olivenhain"] },
  { category: "Pool Service", keywords: ["de waal"] },
  { category: "HOA/Community Maintenance", keywords: ["fairbanks"] },
  {
    category: TRANSFER_CATEGORY,
    keywords: ["zelle"],
    isTransfer: true,
  }, // refined further below to require "sreenidhi"
  { category: "Amazon Purchases", keywords: ["amazon", "amzn"] },
];

// Grocery store chains — extend as needed.
const GROCERY_KEYWORDS = [
  "costco",
  "trader joe",
  "whole foods",
  "safeway",
  "vons",
  "ralphs",
  "sprouts",
  "albertsons",
  "grocery",
  "graceway",
  "kroger",
  "wegmans",
  "publix",
  "aldi",
  "smart & final",
  "stater bros",
];

// Restaurant / cafe keywords — common suffixes/prefixes seen in card statements, plus the
// major US fast-food and casual-dining chains so those roll up into "Restaurants & Dining"
// instead of landing in Needs Review.
const RESTAURANT_KEYWORDS = [
  "restaurant",
  "cafe",
  "coffee",
  "starbucks",
  "chick-fil-a",
  "chickfila",
  "chipotle",
  "grill",
  "kitchen",
  "bistro",
  "diner",
  "pizzeria",
  "pizza",
  "taco",
  "sushi",
  "bakery",
  "bar & ",
  "brewery",
  "eatery",
  "steakhouse",
  "bbq",
  "wings",
  "deli",
  "tst*",
  "sq *",
  "doordash",
  "grubhub",
  "uber eats",
  "postmates",
  // Major US fast-food / QSR chains
  "mcdonald",
  "wendy's",
  "wendys",
  "burger king",
  "taco bell",
  "kfc",
  "kentucky fried chicken",
  "subway",
  "panera",
  "five guys",
  "in-n-out",
  "in n out",
  "wingstop",
  "popeyes",
  "panda express",
  "jack in the box",
  "sonic drive",
  "arby's",
  "arbys",
  "dairy queen",
  "dunkin",
  "jamba juice",
  "jimmy john's",
  "jimmy johns",
  "culver's",
  "culvers",
  "whataburger",
  "del taco",
  "carl's jr",
  "carls jr",
  "hardee's",
  "hardees",
  "raising cane",
  "shake shack",
  "zaxby's",
  "zaxbys",
  "bojangles",
  "chuy's",
  "chuys",
  "qdoba",
  "papa john",
  "domino's",
  "dominos",
  "little caesars",
  // Major US casual/full-service dining chains
  "olive garden",
  "applebee's",
  "applebees",
  "chili's",
  "chilis",
  "buffalo wild wings",
  "denny's",
  "dennys",
  "ihop",
  "cracker barrel",
  "red lobster",
  "outback steakhouse",
  "texas roadhouse",
  "el pollo loco",
];

// Secondary, lower-confidence categories seen commonly in real statements (from reference
// taxonomy) — these are still deterministic keyword matches, not guesses, so they're safe
// to auto-apply. Anything not covered here still falls to Needs Review.
const SECONDARY_RULES: Rule[] = [
  { category: "Insurance", keywords: ["blue shield", "biberk", "vsp vision", " vsp "] },
  { category: "Subscriptions", keywords: ["apple.com/bill", "disney plus", "disney+", "netflix", "spotify", "hulu"] },
  { category: "Phone/Internet", keywords: ["cox comm", "t-mobile", "verizon", "at&t", "comcast", "xfinity"] },
  { category: "Travel", keywords: ["airbnb", "hilton", "marriott", "delta air", "american airlines", "united airlines", "national car rental", "hertz", "avis", "viator", "expedia"] },
  { category: "Gas/Fuel", keywords: ["chevron", "shell oil", "76 ", "arco", "wawa", "exxon", "mobil gas"] },
  { category: "Fees/Bank Charges", keywords: ["foreign transaction fee", "overdraft fee", "atm fee", "service charge"] },
];

export interface CategorizeResult {
  category: string;
  isTransfer: boolean;
  needsReview: boolean;
}

export function categorizeTransaction(description: string): CategorizeResult {
  const text = description.toLowerCase();

  // Zelle to Sreenidhi specifically — must mention both to avoid misfiling other Zelle activity.
  if (text.includes("zelle") && text.includes("sreenidhi")) {
    return { category: TRANSFER_CATEGORY, isTransfer: true, needsReview: false };
  }

  for (const rule of EXPLICIT_RULES) {
    if (rule.category === TRANSFER_CATEGORY) continue; // handled above with stricter match
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { category: rule.category, isTransfer: !!rule.isTransfer, needsReview: false };
    }
  }

  if (GROCERY_KEYWORDS.some((kw) => text.includes(kw))) {
    return { category: "Groceries", isTransfer: false, needsReview: false };
  }

  if (RESTAURANT_KEYWORDS.some((kw) => text.includes(kw))) {
    return { category: "Restaurants & Dining", isTransfer: false, needsReview: false };
  }

  for (const rule of SECONDARY_RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) {
      return { category: rule.category, isTransfer: false, needsReview: false };
    }
  }

  return { category: NEEDS_REVIEW, isTransfer: false, needsReview: true };
}
