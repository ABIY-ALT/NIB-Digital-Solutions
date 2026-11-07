# Website engagement: Coming soon, ideas board, Ask the developer

Three features of the NIB Digital Solutions website (`frontend`, port 3000) and
their admin screens. All data lives in the existing PostgreSQL database
(migration `20261105132741_marketplace_ideas_questions_launch`).

## 1. Coming soon products

Upcoming products are ordinary digital products with one of these statuses
(**Availability** in the product editor):

| Status | Website |
| --- | --- |
| Available | Launched: shown in "Our digital products" and the catalog |
| Pilot | Launched with early customers (badge "Pilot") |
| Coming soon | "Coming soon" homepage section, blurred preview, countdown if dated |
| In development | "Coming soon" homepage section, "In development" badge |
| Temporarily unavailable | Still listed, with a warning badge |

- **Expected release date** (optional) appears in the editor for Coming soon /
  In development. With a date, the homepage shows a live countdown (days, hours,
  minutes); without one, "Release date to be announced".
- The preview image is the product's first screenshot (Media section).
- To launch, change the status to **Available** and save; nothing is recreated.
  The product moves from "Coming soon" to the launched lists.

## 2. "What should we build next?" (ideas board)

- Public page `/ideas` (navigation item, homepage section and the floating
  button bottom-left). Visitors submit an idea (title, problem, business area,
  optional name, required e-mail) and vote for approved ideas.
- New ideas start as **Submitted** and are not public. Staff review them in
  **Admin → Product ideas** and move them through Under review, Approved,
  In development, Completed or Rejected. Only Approved, In development and
  Completed ideas are shown; voting is open for Approved and In development.
- Abuse protection (instead of a third-party CAPTCHA): hidden honeypot field,
  minimum fill time, rate limits per network (5 ideas a day), duplicate title
  detection (returns the existing idea's reference), one vote per visitor per
  idea (anonymous httpOnly cookie, stored only as a keyed hash) plus a per-network
  vote cap. The submitter's e-mail is never shown publicly.

## 3. Ask the developer (Telegram)

### Flow

1. Admin assigns **up to three developers** (main, second, third) and a
   **support status** to a product in the product editor (section "Developer
   support", which also shows whether each developer is connected to Telegram).
   The "Ask the Developer" button appears on the product page when a main
   developer is assigned and support is not *Paused*.
2. The customer submits name, e-mail and question. They get a reference
   (`QST-yymmdd-XXXXX`), a confirmation e-mail and a private conversation link
   (`/questions/<reference>?t=<token>`).
3. Every assigned developer receives the question **only in their own
   private Telegram chat** with the bot (never a group or broadcast). The
   customer's e-mail is masked in Telegram. Buttons: *Reply to Customer*, *View
   Question*, *Mark as In Progress*. A developer without a linked Telegram
   account is notified by e-mail instead.
4. The developer taps *Reply to Customer* (or replies to the notification).
   The backend checks that the Telegram chat belongs to an active developer
   assigned to that product, saves the answer, sets the status to *Answered* and
   e-mails the customer ("Response to Your <Product> Product Question – <ref>").
5. Customer follow-ups (from the private link) keep the same reference, reopen
   the question and notify the developer again. Staff can read the full
   history, reply, change the status (Open, In progress, Answered, Closed) and
   see every Telegram message and e-mail with its delivery state in
   **Admin → Product questions**.

### Setting up the bot

1. In Telegram, talk to **@BotFather**, `/newbot`, and copy the token.
2. Backend `.env`:

   ```env
   TELEGRAM_BOT_TOKEN=123456:ABC...        # secret, backend only
   TELEGRAM_BOT_USERNAME=NibDigitalBot     # without @
   TELEGRAM_MODE=polling                   # local development
   # Production (public HTTPS site URL in PUBLIC_APP_URL):
   # TELEGRAM_MODE=webhook
   # TELEGRAM_WEBHOOK_SECRET=<random 32+ chars, A-Z a-z 0-9 _ ->
   MARKETPLACE_PRIVACY_SALT=<random 32+ chars>
   ```

3. Production only, frontend `.env`: `TELEGRAM_WEBHOOK_SECRET=<same value>`.
   The backend registers `https://<site>/api/telegram/webhook` with Telegram on
   start-up. The website route rejects any call without the secret header and
   forwards valid updates to the backend with the BFF service signature.
4. Restart the backend. Without a token the feature still works: developers
   are notified by e-mail.

### Linking a developer's Telegram account

Two ways, both ending with the bot storing the chat id that Telegram reports:

1. **By username (simplest).** Enter the developer's **Telegram username** in
   **Admin → Product developers** (with or without "@"; one developer per
   username). The developer searches the bot in Telegram and taps **Start**.
   The bot recognises the username and asks for their **work e-mail**; it links
   only if the e-mail matches the developer record exactly. A username alone is
   never enough. Limits: 15 minutes to answer, 5 attempts per chat per hour. An
   unregistered username gets a generic welcome (nothing is revealed), and a
   developer already connected to another chat is not taken over.
2. **By one-time code.** **Connect Telegram** shows a code (valid 30 minutes)
   and a `t.me` link; the developer opens the link (or sends `/start <code>`).

*Disconnect* removes the chat link but keeps the username, so the developer can
connect again by tapping Start.

### Delivery and security

- Every Telegram message and e-mail goes through an outbox table with a unique
  key per message and recipient, so nothing is sent twice. Failures retry with
  exponential backoff (30 s up to 6 h, 10 attempts); the error is kept and shown
  in the delivery log. E-mails use the existing mail transport (`MAIL_TRANSPORT`;
  `log` in development writes them to the backend log).
- The bot token is only in the backend environment; it never reaches the
  browser and is scrubbed from logged errors.
- Customer pages require the reference **and** the HMAC token; wrong tokens
  return "not found". All inputs are length-limited and sanitised; public forms
  use CSRF tokens, same-origin checks, honeypot, minimum fill time and rate
  limits (per e-mail and per network).
- Not implemented: file attachments on questions.
