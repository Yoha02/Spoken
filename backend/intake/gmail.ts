import { google, gmail_v1 } from "googleapis";

export type IncomingEmail = {
  subject: string;
  from: string;
  body: string;
};

type MessagePart = gmail_v1.Schema$MessagePart;

function getOAuthClient() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN — see README for how to generate them."
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

function decodeBody(payload: MessagePart | undefined): string {
  const findPart = (part: MessagePart | undefined): string | null => {
    if (!part) return null;
    if (part.mimeType === "text/plain" && part.body?.data) {
      return Buffer.from(part.body.data, "base64url").toString("utf-8");
    }
    if (part.parts) {
      for (const child of part.parts) {
        const found = findPart(child);
        if (found) return found;
      }
    }
    return null;
  };

  return findPart(payload) ?? "";
}

function header(payload: MessagePart | undefined, name: string): string {
  const match = payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return match?.value ?? "";
}

// Fetches the single most recent message matching GMAIL_QUERY (defaults to
// unread mail with "trip" in the subject). Returns null if nothing matches.
export async function getLatestTripEmail(): Promise<IncomingEmail | null> {
  const auth = getOAuthClient();
  const gmail = google.gmail({ version: "v1", auth });
  const query = process.env.GMAIL_QUERY || "subject:trip newer_than:7d";

  const list = await gmail.users.messages.list({
    userId: "me",
    q: query,
    maxResults: 1,
  });

  const messageId = list.data.messages?.[0]?.id;
  if (!messageId) return null;

  const message = await gmail.users.messages.get({
    userId: "me",
    id: messageId,
    format: "full",
  });

  const payload = message.data.payload;
  return {
    subject: header(payload, "Subject"),
    from: header(payload, "From"),
    body: decodeBody(payload),
  };
}
