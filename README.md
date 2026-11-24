# Bloom Maternal Care

Maternal health visit reminders built with **React + Express + MongoDB**. The API calculates five scheduled visits from each mother's due date (32, 24, 16, 8, and 2 weeks before), flags past uncompleted visits as missed, and prevents logging a later visit before the previous one.

Mother accounts see an in-app dashboard reminder the day before a scheduled visit. Visit reminders appear when they sign in; email, SMS, and browser push visit reminders are not configured.

Password recovery uses an SMS verification code sent through Twilio Verify. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_VERIFY_SERVICE_SID` to enable it. Account phone numbers must use international format (E.164); existing accounts without a matching number can contact support at `0790684556`.

## Run locally

1. Install Node.js and MongoDB Community Server, then start MongoDB.
2. Copy `server/.env.example` to `server/.env`. Set a private `JWT_SECRET`, nurse email/password, and a private `NURSE_REGISTRATION_CODE`. Set `NURSE_PHONE` in international format for the seeded nurse account's password recovery. Add the Twilio Verify credentials to enable SMS recovery. Share the invite code only with authorized nurses. `CLIENT_ORIGIN=*` allows browser requests from any origin; restrict it to your frontend origin in production.
3. From the project root, run `npm install`.
4. Seed 10 sample mother records (and five scheduled visits per mother): `npm run seed`.
5. Start both apps: `npm run dev`. The React app is at `http://localhost:5173`; the API is at `http://localhost:4000`.
6. On the registration page, choose Mother or Nurse. Both account types need a phone number in international format (for example, `+1234567890`); mother accounts also need a due date, and nurse accounts need the configured invite code.

The sample data has no accounts and is read-only except to nurses. Re-running the seed replaces only those sample records, not accounts' mother records. The configured nurse account is also created or updated by the seed command.

## API outline

All routes except `/api/auth/register`, `/api/auth/login`, `/api/auth/forgot-password`, `/api/auth/reset-password`, and `/api/health` require `Authorization: Bearer <token>`. The server validates the signed token and loads the user's current role from MongoDB for each request.

- `POST /api/auth/forgot-password` with `{ "email": "...", "phone": "+1234567890" }` — sends a Twilio Verify SMS code when the account details match
- `POST /api/auth/reset-password` with `{ "email": "...", "phone": "+1234567890", "code": "...", "newPassword": "..." }` — verifies the SMS code and updates the password

- `GET /api/mothers?page=1&limit=10` — paginated list (nurses see all; mothers see only their own)
- `POST /api/mothers` — nurse creates a mother and generated visit schedule
- `GET /api/mothers/:id`, `PATCH /api/mothers/:id`, `DELETE /api/mothers/:id`
- `GET /api/visits?page=1&limit=10` — paginated schedule for the authorized user
- `POST /api/visits` with `{ "motherId": "...", "visitNo": 1 }` — nurse logs a scheduled visit
- `GET /api/analytics/missed-visits` — nurse-only missed-visit summary

Bad input and invalid visit order return `400`; missing records return `404`; unauthenticated requests return `401`; role failures return `403`.

## Tests and production build

- `npm test` runs Express/MongoDB API tests for registration, authorization, visit logging, and missed dates.
- `npm run build` builds the React frontend.
- For a separately hosted frontend, set `VITE_API_URL` to the deployed API base URL (including `/api`) when building, and set the API's `CLIENT_ORIGIN` to the frontend origin.
"# maternal-health-visit" 
