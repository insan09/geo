const MAX_BODY_SIZE = 9 * 1024 * 1024;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, message: "Method not allowed" });
  }

  try {
    const payload = await parsePayload(req);
    const lead = normalizeLead(payload);

    if (!lead.name || !lead.phone || !lead.zip || !lead.description) {
      return res.status(400).json({ ok: false, message: "Name, phone, ZIP and description are required." });
    }

    const emailConfigured = Boolean(process.env.RESEND_API_KEY && process.env.LEAD_TO_EMAIL);
    const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);

    if (!emailConfigured && !telegramConfigured) {
      return res.status(501).json({
        ok: false,
        message: "Lead delivery is not configured yet."
      });
    }

    const results = await Promise.allSettled([
      emailConfigured ? sendEmail(lead) : Promise.resolve({ skipped: true }),
      telegramConfigured ? sendTelegram(lead) : Promise.resolve({ skipped: true })
    ]);

    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length === results.length) {
      return res.status(502).json({ ok: false, message: "Lead delivery failed. Please try again." });
    }

    return res.status(200).json({
      ok: true,
      emailSent: emailConfigured && results[0].status === "fulfilled",
      telegramSent: telegramConfigured && results[1].status === "fulfilled"
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error.message || "Unexpected server error." });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "9mb"
    }
  }
};

async function parsePayload(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  const rawBody = await readBody(req);
  return rawBody ? JSON.parse(rawBody) : {};
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeLead(payload) {
  const photos = Array.isArray(payload.photos) ? payload.photos.slice(0, 5).map(normalizePhoto).filter(Boolean) : [];

  return {
    source: clean(payload.source, 80),
    page: clean(payload.page, 500),
    name: clean(payload.name, 120),
    phone: clean(payload.phone, 80),
    email: clean(payload.email, 160),
    zip: clean(payload.zip, 120),
    description: clean(payload.description, 1800),
    photos
  };
}

function normalizePhoto(photo) {
  if (!photo || !photo.content) return null;
  const content = String(photo.content).replace(/^data:image\/[a-z0-9.+-]+;base64,/i, "");
  if (!/^[a-z0-9+/=\s]+$/i.test(content)) return null;

  return {
    filename: safeFilename(photo.filename || "photo.jpg"),
    mime: clean(photo.mime || "image/jpeg", 80),
    content: content.replace(/\s/g, "")
  };
}

async function sendEmail(lead) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: process.env.LEAD_FROM_EMAIL || "Pacific Facade Leads <onboarding@resend.dev>",
      to: [process.env.LEAD_TO_EMAIL],
      reply_to: lead.email || undefined,
      subject: `New stucco repair lead: ${lead.zip || "California"}`,
      html: buildEmailHtml(lead),
      attachments: lead.photos.map((photo) => ({
        filename: photo.filename,
        content: photo.content
      }))
    })
  });

  if (!response.ok) {
    throw new Error(`Email delivery failed with status ${response.status}.`);
  }

  return response.json();
}

async function sendTelegram(lead) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const message = buildTelegramText(lead);

  const messageResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true
    })
  });

  if (!messageResponse.ok) {
    throw new Error(`Telegram message failed with status ${messageResponse.status}.`);
  }

  for (const photo of lead.photos) {
    const buffer = Buffer.from(photo.content, "base64");
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("photo", new Blob([buffer], { type: photo.mime || "image/jpeg" }), photo.filename);

    const photoResponse = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: "POST",
      body: form
    });

    if (!photoResponse.ok) {
      throw new Error(`Telegram photo failed with status ${photoResponse.status}.`);
    }
  }

  return { ok: true };
}

function buildEmailHtml(lead) {
  return `
    <h1>New stucco / facade repair lead</h1>
    <p><strong>Name:</strong> ${escapeHtml(lead.name)}</p>
    <p><strong>Phone:</strong> ${escapeHtml(lead.phone)}</p>
    <p><strong>Email:</strong> ${escapeHtml(lead.email || "Not provided")}</p>
    <p><strong>ZIP / City:</strong> ${escapeHtml(lead.zip)}</p>
    <p><strong>Source:</strong> ${escapeHtml(lead.source || "landing")}</p>
    <p><strong>Page:</strong> ${escapeHtml(lead.page || "")}</p>
    <h2>Description</h2>
    <p>${escapeHtml(lead.description).replace(/\n/g, "<br>")}</p>
    <p><strong>Photos attached:</strong> ${lead.photos.length}</p>
  `;
}

function buildTelegramText(lead) {
  return [
    "New stucco / facade repair lead",
    "",
    `Name: ${lead.name}`,
    `Phone: ${lead.phone}`,
    `Email: ${lead.email || "Not provided"}`,
    `ZIP / City: ${lead.zip}`,
    `Source: ${lead.source || "landing"}`,
    `Page: ${lead.page || ""}`,
    "",
    "Description:",
    lead.description,
    "",
    `Photos: ${lead.photos.length}`
  ].join("\n").slice(0, 3900);
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

function safeFilename(filename) {
  const cleaned = String(filename).replace(/[^a-z0-9._-]+/gi, "-").replace(/^-|-$/g, "");
  return cleaned || "photo.jpg";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
