export type ExtractedTripFields = {
  dest?: string;
  dateRange?: [string, string];
  budgetPerPerson?: number;
  /** Employee names the CEO named in the email (Landing AI extraction). */
  travelerNames?: string[];
  purpose?: string;
};

export type ExtractResult = {
  fields: ExtractedTripFields;
  source: "landingai" | "fallback";
};

// Modern ADE Extract API (schema-driven field extraction from Markdown).
// Docs: https://docs.landing.ai/api-reference/tools/ade-extract
const ADE_EXTRACT_ENDPOINT = "https://api.va.landing.ai/v1/ade/extract";

const TRIP_SCHEMA = {
  type: "object",
  properties: {
    travelers: {
      type: "array",
      items: { type: "string" },
      description:
        "List of employee full names who must travel (the people the CEO named, e.g. Ravi, Aashna, Nikhil)",
    },
    purpose: {
      type: "string",
      description: "Short purpose of the trip or travel request",
    },
    dest: {
      type: "string",
      description: "Destination city or airport for the trip",
    },
    date_start: {
      type: "string",
      description: "Trip start date in ISO 8601 format YYYY-MM-DD",
    },
    date_end: {
      type: "string",
      description: "Trip end date in ISO 8601 format YYYY-MM-DD",
    },
    budget_per_person: {
      type: "number",
      description: "Budget per person in USD as a number",
    },
  },
  required: ["travelers"],
};

function authHeader(apiKey: string): string {
  // Landing AI ADE docs use Bearer; older keys were sometimes Basic user:pass base64.
  if (apiKey.startsWith("Basic ") || apiKey.startsWith("Bearer ")) return apiKey;
  // Raw keys that look like base64(user:secret) still work with Basic.
  if (apiKey.includes(":") || /^[A-Za-z0-9+/=]{20,}$/.test(apiKey)) {
    // Prefer Bearer first for modern ADE; callers may retry with Basic if needed.
    return `Bearer ${apiKey}`;
  }
  return `Bearer ${apiKey}`;
}

async function callLandingAI(text: string): Promise<ExtractedTripFields> {
  const apiKey = process.env.LANDINGAI_API_KEY;
  if (!apiKey) throw new Error("Missing LANDINGAI_API_KEY");

  const form = new FormData();
  // Email body is already plain text — treat as Markdown content for ADE Extract.
  form.append("markdown", new Blob([text], { type: "text/markdown" }), "email.md");
  form.append("schema", JSON.stringify(TRIP_SCHEMA));
  form.append("model", "extract-latest");

  let res = await fetch(ADE_EXTRACT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: authHeader(apiKey) },
    body: form,
  });

  // Retry once with Basic if Bearer is rejected (legacy key formats).
  if (res.status === 401 || res.status === 403) {
    const form2 = new FormData();
    form2.append("markdown", new Blob([text], { type: "text/markdown" }), "email.md");
    form2.append("schema", JSON.stringify(TRIP_SCHEMA));
    form2.append("model", "extract-latest");
    res = await fetch(ADE_EXTRACT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: apiKey.startsWith("Basic ") ? apiKey : `Basic ${apiKey}`,
      },
      body: form2,
    });
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`LandingAI extract failed: ${res.status} ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const extracted = (data.extraction ?? data.data?.extraction ?? data) as Record<string, unknown>;
  return mapExtracted(extracted);
}

function mapExtracted(extracted: Record<string, unknown>): ExtractedTripFields {
  const fields: ExtractedTripFields = {};

  if (extracted.dest) fields.dest = String(extracted.dest).trim();
  if (extracted.date_start && extracted.date_end) {
    fields.dateRange = [String(extracted.date_start), String(extracted.date_end)];
  }
  if (extracted.budget_per_person != null && extracted.budget_per_person !== "") {
    const n = Number(extracted.budget_per_person);
    if (!Number.isNaN(n)) fields.budgetPerPerson = n;
  }
  if (extracted.purpose) fields.purpose = String(extracted.purpose);

  const travelers = extracted.travelers ?? extracted.traveler_names ?? extracted.employees;
  if (Array.isArray(travelers)) {
    fields.travelerNames = travelers.map((t) => String(t).trim()).filter(Boolean);
  } else if (typeof travelers === "string" && travelers.trim()) {
    fields.travelerNames = travelers
      .split(/,| and |;|\n/)
      .map((s) => s.replace(/^\d+[\.\)]\s*/, "").trim())
      .filter(Boolean);
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
    /\b(?:destination|to|visit(?:ing)?)\s*[:\s]+\s*([A-Za-z][A-Za-z\s]{1,30}?)(?:\n|,|\.|$)/i
  );
  if (destMatch) {
    fields.dest = destMatch[1].replace(/\s+/g, " ").trim();
  }

  // Prefer known demo employees mentioned in the body.
  const known = ["Ravi", "Aashna", "Nikhil", "Eyoha"];
  const found = known.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(text));
  if (found.length > 0) {
    fields.travelerNames = found;
  } else {
    const listBlock = text.match(
      /(?:employees?|travel(?:ers)?(?:\s+for)?|following)[:\s]+([\s\S]{0,400})/i
    );
    if (listBlock) {
      const names = listBlock[1]
        .split(/\n|,| and /)
        .map((line) => line.replace(/^\s*[\d\-\*\.•]+[\.\)]?\s*/, "").trim())
        .map((line) => line.replace(/[^A-Za-z\s\-']+/g, "").trim())
        .filter((n) => n.length >= 2 && n.length < 40 && /^[A-Z][a-z]/.test(n));
      if (names.length > 0) fields.travelerNames = names.slice(0, 6);
    }
  }

  fields.purpose = fields.purpose ?? "Company travel request";
  return fields;
}

export async function extractTripDetails(text: string): Promise<ExtractResult> {
  try {
    const fields = await callLandingAI(text);
    return { fields, source: "landingai" };
  } catch (err) {
    console.error("[landingai] extract failed, using fallback:", err);
    return { fields: fallbackExtract(text), source: "fallback" };
  }
}
