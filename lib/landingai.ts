export type ExtractedTripFields = {
  dest?: string;
  dateRange?: [string, string];
  budgetPerPerson?: number;
};

export type ExtractResult = {
  fields: ExtractedTripFields;
  source: "landingai" | "fallback";
};

// LandingAI's Agentic Document Extraction (ADE) endpoint — verify the exact
// path/payload shape against current LandingAI docs before the demo; their
// API has moved before. This targets a plain-text document with a field
// schema describing what we want pulled out.
const LANDINGAI_ENDPOINT = "https://api.va.landing.ai/v1/tools/agentic-document-analysis";

async function callLandingAI(text: string): Promise<ExtractedTripFields> {
  const apiKey = process.env.LANDINGAI_API_KEY;
  if (!apiKey) throw new Error("Missing LANDINGAI_API_KEY");

  const form = new FormData();
  form.append("document", new Blob([text], { type: "text/plain" }), "email.txt");
  form.append(
    "fields_schema",
    JSON.stringify({
      dest: "destination city or airport mentioned for the trip",
      date_start: "trip start date, ISO 8601 (YYYY-MM-DD)",
      date_end: "trip end date, ISO 8601 (YYYY-MM-DD)",
      budget_per_person: "budget per person in USD, as a number",
    })
  );

  const res = await fetch(LANDINGAI_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Basic ${apiKey}` },
    body: form,
  });

  if (!res.ok) throw new Error(`LandingAI request failed: ${res.status}`);

  const data = await res.json();
  const extracted = data.extraction ?? data;

  const fields: ExtractedTripFields = {};
  if (extracted.dest) fields.dest = String(extracted.dest);
  if (extracted.date_start && extracted.date_end) {
    fields.dateRange = [String(extracted.date_start), String(extracted.date_end)];
  }
  if (extracted.budget_per_person) {
    fields.budgetPerPerson = Number(extracted.budget_per_person);
  }
  return fields;
}

// Rough heuristic used only when the LandingAI call fails — keeps a live
// demo from stalling on an external API. Not meant to be robust.
function fallbackExtract(text: string): ExtractedTripFields {
  const fields: ExtractedTripFields = {};

  const budgetMatch = text.match(/\$\s?(\d{2,5})/);
  if (budgetMatch) fields.budgetPerPerson = Number(budgetMatch[1]);

  const isoDates = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (isoDates && isoDates.length >= 2) {
    fields.dateRange = [isoDates[0], isoDates[1]];
  }

  const destMatch = text.match(
    /\b(?:to|in|thinking|about|visit(?:ing)?)\s+([A-Za-z]+(?:\s[A-Za-z]+)?)\b/i
  );
  if (destMatch && /^[A-Z]/.test(destMatch[1])) fields.dest = destMatch[1];

  return fields;
}

export async function extractTripDetails(text: string): Promise<ExtractResult> {
  try {
    const fields = await callLandingAI(text);
    return { fields, source: "landingai" };
  } catch {
    return { fields: fallbackExtract(text), source: "fallback" };
  }
}
