# Pacific Facade landing page

Static lead-generation landing page for stucco and facade repair in California.

## Files

- `index.html` - main Los Angeles landing page.
- `locations/*.html` - simple local pages for Los Angeles, San Diego and Sacramento.
- `styles.css` - responsive layout and visual styling.
- `script.js` - lead form handling, image compression and submission.
- `api/lead.js` - Vercel-style serverless endpoint for email and Telegram delivery.
- `assets/repair-gallery-sprite.webp` - optimized generated before/after repair gallery used by the page.
- `assets/pacific-facade-*.webp` and `assets/favicon.svg` - logo assets generated from the supplied Pacific Facade logo.

## Lead delivery

The form posts JSON to `/api/lead`. Configure these environment variables in hosting:

```text
RESEND_API_KEY=...
LEAD_TO_EMAIL=owner@example.com
LEAD_FROM_EMAIL=Pacific Facade Leads <leads@yourdomain.com>
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```

`RESEND_API_KEY` + `LEAD_TO_EMAIL` enable email delivery.
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` enable Telegram duplication.

Photos are compressed in the browser before submission and sent as email attachments plus Telegram photos.
