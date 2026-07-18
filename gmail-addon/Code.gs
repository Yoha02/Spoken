/**
 * Swarm Mode — Gmail add-on
 *
 * HR opens a CEO travel email → side panel → "Start travel swarm"
 * POSTs subject/body to your Swarm app (public URL + shared secret).
 *
 * Script Properties (Project Settings → Script properties):
 *   SWARM_API_URL  = https://YOUR-TUNNEL-OR-HOST   (no trailing slash)
 *   SWARM_SECRET   = same value as GMAIL_TRIGGER_SECRET in .env.local
 */

function onGmailHomepage(e) {
  return buildHomeCard();
}

function onGmailMessageOpen(e) {
  return buildMessageCard(e);
}

function buildHomeCard() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Swarm Mode").setSubtitle("Travel voice swarm"))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText(
          "Open a CEO travel email, then use <b>Start travel swarm</b> to extract travelers and place Vocal Bridge calls."
        )
      )
    );
  return card.build();
}

function buildMessageCard(e) {
  var subject = "(this message)";
  try {
    var msg = getCurrentMessage(e);
    if (msg) subject = msg.getSubject() || subject;
  } catch (err) {
    // Card still usable; button will re-fetch.
  }

  var section = CardService.newCardSection()
    .addWidget(
      CardService.newTextParagraph().setText(
        "Run Landing AI → employee directory → Vocal Bridge on:<br><b>" +
          escapeHtml(subject) +
          "</b>"
      )
    )
    .addWidget(
      CardService.newTextButton()
        .setText("Start travel swarm")
        .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        .setOnClickAction(CardService.newAction().setFunctionName("startTravelSwarm"))
    );

  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Swarm Mode").setSubtitle("One-click from Gmail"))
    .addSection(section)
    .build();
}

/**
 * Button handler: read open message, POST to Swarm /api/gmail/trigger
 */
function startTravelSwarm(e) {
  var props = PropertiesService.getScriptProperties();
  var apiUrl = (props.getProperty("SWARM_API_URL") || "").replace(/\/$/, "");
  var secret = props.getProperty("SWARM_SECRET") || "";

  if (!apiUrl || !secret) {
    return notify(
      "Missing config",
      "Set Script Properties SWARM_API_URL and SWARM_SECRET (match GMAIL_TRIGGER_SECRET)."
    );
  }

  var message;
  try {
    message = getCurrentMessage(e);
  } catch (err) {
    return notify("Gmail error", String(err));
  }

  if (!message) {
    return notify("No message", "Open a CEO travel email, then try again.");
  }

  var payload = {
    subject: message.getSubject() || "",
    from: message.getFrom() || "",
    body: message.getPlainBody() || message.getBody() || "",
    messageId: message.getId(),
    autoSwarm: true,
  };

  var url = apiUrl + "/api/gmail/trigger";
  var response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      headers: {
        "X-Swarm-Secret": secret,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (err) {
    return notify(
      "Network error",
      "Could not reach " +
        apiUrl +
        ". Is the app running and publicly reachable (ngrok/tunnel)?\n" +
        String(err)
    );
  }

  var code = response.getResponseCode();
  var raw = response.getContentText();
  var data = {};
  try {
    data = JSON.parse(raw);
  } catch (err) {
    data = { error: raw || "Empty response" };
  }

  if (code < 200 || code >= 300) {
    return notify("Swarm failed (" + code + ")", data.error || raw || "Unknown error");
  }

  var n = Array.isArray(data.travelers) ? data.travelers.length : 0;
  var names = (data.travelers || [])
    .map(function (t) {
      return t.name;
    })
    .join(", ");
  var swarmOk = data.swarm && data.swarm.ok;
  var canvas = data.links && data.links.canvas;

  var lines = [
    "Matched " + n + " traveler(s)" + (names ? ": " + names : "") + ".",
    swarmOk
      ? "Vocal Bridge swarm started."
      : "Extract OK; check Vocal Bridge key / phones if no calls.",
  ];
  if (data.unmatchedNames && data.unmatchedNames.length) {
    lines.push("Unmatched: " + data.unmatchedNames.join(", "));
  }
  if (canvas) {
    lines.push("Live view: " + canvas);
  }

  var builder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle("Swarm started").setSubtitle("Gmail → Vocal Bridge"))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(lines.join("<br>"))));

  if (canvas) {
    builder.addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextButton()
          .setText("Open live canvas")
          .setOpenLink(CardService.newOpenLink().setUrl(canvas))
      )
    );
  }

  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().updateCard(builder.build()))
    .setNotification(CardService.newNotification().setText("Travel swarm triggered for " + n + " traveler(s)"))
    .build();
}

function getCurrentMessage(e) {
  var accessToken = e && e.gmail && e.gmail.accessToken;
  var messageId = e && e.gmail && e.gmail.messageId;
  if (!accessToken || !messageId) {
    return null;
  }
  GmailApp.setCurrentMessageAccessToken(accessToken);
  return GmailApp.getMessageById(messageId);
}

function notify(title, text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(title + ": " + text))
    .build();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
