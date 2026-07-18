import type { Traveler } from "@/core/tripObject";

export type ExtractedPreferences = {
  origin?: string;
  seat?: Traveler["seat"];
  diet?: string;
};

// Ordered so more specific phrases win over generic ones (e.g. "gluten-free"
// before a bare "free" would ever be considered).
const DIET_PATTERNS: [RegExp, string][] = [
  [/\bvegan\b/i, "vegan"],
  [/\bvegetarian\b/i, "vegetarian"],
  [/\bgluten[\s-]?free\b/i, "gluten-free"],
  [/\bdairy[\s-]?free\b/i, "dairy-free"],
  [/\bpescatarian\b/i, "pescatarian"],
  [/\bkosher\b/i, "kosher"],
  [/\bhalal\b/i, "halal"],
  [/\b(?:no (?:dietary )?restrictions?|nothing special|eat(?:s)? anything|no allerg(?:y|ies))\b/i, "none"],
];

const KNOWN_AIRPORT_CODES = new Set([
  "SFO", "SJC", "OAK", "LAX", "JFK", "EWR", "LGA", "ORD", "MDW", "AUS", "DFW",
  "IAH", "SEA", "BOS", "ATL", "DEN", "PHX", "MIA", "SAN", "SLC", "PDX", "BWI",
  "DCA", "IAD", "MSP", "DTW", "PHL", "CLT", "STL", "MCI", "SMF", "BUR",
]);

/**
 * Best-effort scan of accumulated call transcript text for the three
 * constraints the swarm calls are meant to collect. Demo-quality regex
 * matching, not NLU — good enough for a live call's plain phrasing.
 */
export function extractPreferences(lines: string[]): ExtractedPreferences {
  const text = lines.join("\n");
  const result: ExtractedPreferences = {};

  if (/\baisle\b/i.test(text)) {
    result.seat = "aisle";
  } else if (/\bwindow\b/i.test(text)) {
    result.seat = "window";
  } else if (/\b(?:no preference|any seat|either (?:is )?fine|don'?t care|doesn'?t matter)\b/i.test(text)) {
    result.seat = "any";
  }

  for (const [pattern, label] of DIET_PATTERNS) {
    if (pattern.test(text)) {
      result.diet = label;
      break;
    }
  }

  const codeMatch = text.match(/\b([A-Z]{3})\b/);
  if (codeMatch && KNOWN_AIRPORT_CODES.has(codeMatch[1])) {
    result.origin = codeMatch[1];
  } else {
    const flyMatch = text.match(
      /\b(?:fly(?:ing)? out of|flying from|depart(?:ing)? (?:out of|from)|from)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)\b/
    );
    if (flyMatch) result.origin = flyMatch[1].trim();
  }

  return result;
}
