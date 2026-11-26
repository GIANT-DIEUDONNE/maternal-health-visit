# Bloom Maternal Care

Maternal health visit reminders built with **React + Express + MongoDB**. The API calculates five scheduled visits from each mother's due date (32, 24, 16, 8, and 2 weeks before), flags past uncompleted visits as missed, and prevents logging a later visit before the previous one.

Mother accounts see an in-app dashboard reminder the day before a scheduled visit. Visit reminders appear when they sign in; email, SMS, and browser push visit reminders are not configured.

Password recovery uses an SMS verification code sent through Twilio Verify. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` to enable it. Account phone numbers must use international format (E.164); existing accounts without a matching number can contact support at `0790684556`.

The Messages page email button opens a pre-addressed Gmail compose window in a new tab; it does not depend on a mail app being configured on the device. WhatsApp's automatic support reply requires a Meta WhatsApp Business/Cloud API number. Set `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, and `WHATSAPP_GRAPH_API_VERSION` in the API deployment environment. `WHATSAPP_AUTO_REPLY` can override the default response. Configure the Meta webhook callback URL as `https://<your-api-host>/api/webhooks/whatsapp`, use the same verify token, and subscribe to the `messages` webhook field. The webhook verifies Meta's `X-Hub-Signature-256` before sending replies. Replies will remain disabled until these credentials and the Meta webhook subscription are configured. Never commit or share the access token or app secret.

## Run locally

1. Install Node.js and MongoDB Community Server, then start MongoDB. To receive live Meta webhook events in local development, expose the API through a publicly reachable HTTPS URL and configure that URL in Meta.
2. Copy `server/.env.example` to `server/.env`. Set a private `JWT_SECRET` and a strong `ADMIN_EMAIL` / `ADMIN_PASSWORD` for the first system administrator. Optionally set `ADMIN_NAME` and `ADMIN_PHONE`. Set `NURSE_EMAIL` / `NURSE_PASSWORD` to seed a clinic nurse, and `NURSE_PHONE` in international format for password recovery. Add the Twilio Verify credentials to enable SMS recovery. `CLIENT_ORIGIN=*` allows browser requests from any origin; restrict it to your frontend origin in production.
3. From the project root, run `npm install`.
4. Run `npm run bootstrap-admin -w server` once to create or update only the initial administrator account. For local sample records and a configured clinic nurse, run `npm run seed` separately.
5. Start both apps: `npm run dev`. The React app is at `http://localhost:5173`; the API is at `http://localhost:4000`.
6. On the registration page, choose Mother or Nurse. Both account types need a phone number in international format (for example, `+1234567890`); mother accounts also need a due date. The administrator creates or replaces the nurse invite code from the admin dashboard and shares it directly with authorized nurses. The code is stored hashed and cannot be retrieved; if forgotten, the administrator sets a replacement.

The sample data has no accounts and is read-only except to nurses. Re-running the seed replaces only those sample records, not accounts' mother records. The configured nurse account is also created or updated by the seed command. Re-running `bootstrap-admin` resets the administrator password to the configured value and reactivates that account.

## API outline

All routes except `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and `/api/health` require `Authorization: Bearer <token>`. The server validates the signed token and loads the user's current role from MongoDB for each request.

- `POST /api/auth/forgot-password` with `{ "email": "...", "phone": "+1234567890" }` — sends a Twilio Verify SMS code when the account details match
- `POST /api/auth/reset-password` with `{ "email": "...", "phone": "+1234567890", "code": "...", "newPassword": "..." }` — verifies the SMS code and updates the password
- `GET /api/auth/profile` and `PATCH /api/auth/profile` — view or update the authenticated user's name, email, phone, and preferred language (`en`, `rw`, or `fr`); password changes require the current password and invalidate other sessions
- The interface supports English, Kinyarwanda, and French. Signed-out selections are kept in the browser; signing in or registering uses the language saved on the account.
- `/api/admin/overview`, `/api/admin/users`, `/api/admin/mothers`, and `/api/admin/missed-visits` — administrator-only system metrics and paginated account, care-record, and missed-visit monitoring
- `POST /api/admin/users` and `PATCH /api/admin/users/:id` — administrators register mother or nurse accounts, assign roles, and activate/deactivate accounts; account status or role changes revoke existing sessions
- `GET /api/admin/settings` and `PUT /api/admin/settings/nurse-registration-code` — check whether the nurse invite code is configured and replace it. Only an administrator can set it; the server stores only its password hash.

- `GET /api/mothers?page=1&limit=10` — paginated list (nurses see all; mothers see only their own)
- `POST /api/mothers` — nurse creates a mother and generated visit schedule
- `GET /api/mothers/:id`, `PATCH /api/mothers/:id`, `DELETE /api/mothers/:id`
- `GET /api/visits?page=1&limit=10` — paginated schedule for the authorized user
- `POST /api/visits` with `{ "motherId": "...", "visitNo": 1 }` — nurse logs a scheduled visit
- `PATCH /api/visits/:id` with `{ "notes": "..." }` — nurses add or update a note on a completed visit (up to 2000 characters); the mother can read notes on her own care-plan history
- `GET /api/analytics/missed-visits` — nurse and administrator missed-visit summary

Bad input and invalid visit order return `400`; missing records return `404`; unauthenticated requests return `401`; role failures return `403`.

## Tests and production build

- `npm test` runs Express/MongoDB API tests for registration, authorization, visit logging, and missed dates.
- `npm run build` builds the React frontend.
- For a separately hosted frontend, set `VITE_API_URL` to the deployed API base URL (including `/api`) when building, and set the API's `CLIENT_ORIGIN` to the frontend origin.
"# maternal-health-visit" 
