# workeron.agency

Marketing site for **workeron.agency** — static HTML (`index.html`, `blog.html`) + a small
**Express / better-sqlite3 CMS** (`server.js`) with an admin panel at `/admin/`.

> The **workeron.ai** product site is a **separate** Next.js app in a different repo
> (`workeronai/website_workeron_ai`). The Super AI 2026 landing (`/superai`) lives there, **not** here.

---

## Stack & hosting

- **Frontend:** large static `index.html` (Tailwind via CDN), `blog.html`, CMS client (`cms-client.js`).
- **Backend:** Node.js / Express (`server.js`), DB = better-sqlite3 (`data/cms.db`), EJS, uploads via multer.
- **CMS admin:** `/admin/` (session auth). Sections: Dashboard, Site Content, **Forms & Settings**, Blog.
  Content lives in `data/content.json`; form/URL config in `data/settings.json` (served by `GET /api/settings`,
  saved by `PUT /api/settings`).
- **Host:** GCP VM `workeronagency` (project `webite-workeron-agency`, zone `europe-west1-b`, IP `34.22.177.15`).
  Doc root `/var/www/workeron` (owner `admin`). Runs under **PM2** (process `workeron`). **nginx** terminates
  SSL and proxies to Node; behind **Cloudflare**. Deploy is manual (`gcloud compute scp` + `sudo cp` into the
  doc root). `index.html` / `data/settings.json` are static-ish → no restart needed; changing `server.js` needs
  `pm2 restart workeron`.
  ```
  gcloud compute ssh workeronagency --zone=europe-west1-b --project=webite-workeron-agency
  cd /var/www/workeron
  ```
- **Git:** `github.com/adminWorkeron/website-workeron.agency` (branch `main`).

---

## Forms → Google Apps Script → destinations

All three forms POST JSON as `text/plain` to a **Google Apps Script Web App** (the site's standard pattern).
Each endpoint URL is **admin-controlled**: the frontend reads it from `/api/settings` (key below), with a
hardcoded fallback constant in `index.html`. Apps Script **source** is committed under [`apps-script/`](./apps-script)
(for reference — it is **not** auto-deployed; deploy it manually in the Apps Script editor under the owning
Google account, then paste the `/exec` URL into the admin → Forms & Settings).

| Form (where) | `settings.json` key | Apps Script source | Destination |
|---|---|---|---|
| **Careers** — "Current Opportunities" apply modal (`#applyForm`) | `applyFormUrl` | [`apps-script/careers-form.Code.gs`](./apps-script/careers-form.Code.gs) | **Google Sheet** → tab `Applications` |
| **Contact leads** — "Request Consultation" Step 1 (`#consultInfoForm`) | `contactLeadsFormUrl` | [`apps-script/contact-leads-form.Code.gs`](./apps-script/contact-leads-form.Code.gs) | **Google Sheet** → tab `Applications` |
| **Consultation booking** — "Request Consultation" full flow | `consultationFormUrl` | [`apps-script/consultation-booking.Code.gs`](./apps-script/consultation-booking.Code.gs) | **Google Calendar** event + **Meet** + invites |

### Google Sheets (tables) this project writes to

- **Careers applications** — sheet `1jEXRFs4YSRzPmhUulrCq2ST9_7Qw_thwr8FRhzf1Z3Y`, tab **Applications** (gid `115747773`).
  Columns: `Timestamp | Name | Email | Role | LinkedIn / Portfolio | Status` (Status defaults to `New`).
  https://docs.google.com/spreadsheets/d/1jEXRFs4YSRzPmhUulrCq2ST9_7Qw_thwr8FRhzf1Z3Y/edit?gid=115747773
- **Contact leads** ("Workeron Agency leads form") — sheet `136C-X2nf6EiDIInZtMoPbgMZaJ3vUVj4DO_FRKDulPs`,
  tab **Applications** (gid `0`). Columns: `№ | Date | Full Name | Work Email | Brief description`.
  https://docs.google.com/spreadsheets/d/136C-X2nf6EiDIInZtMoPbgMZaJ3vUVj4DO_FRKDulPs/edit?gid=0

### Apps Script deployments (current `/exec` URLs)

> ⚠️ These URLs are also stored in `data/settings.json`. **Never click "New deployment"** when updating a
> script — that mints a **new** `/exec` URL and silently breaks the form (404). Use **Manage deployments → Edit
> → New version**, which keeps the URL. If the URL does change, update the matching `settings.json` key (admin →
> Forms & Settings) **and** the fallback constant in `index.html`.

- `applyFormUrl` → `https://script.google.com/macros/s/AKfycbzhMLEygjZeQ-gnzD522FysCz9iQUxHNsORgzY82FgGGBUhNQTUi8BuQRdjNNeOasz30A/exec`
- `contactLeadsFormUrl` → `https://script.google.com/macros/s/AKfycbyVUYZ4eyWEnefarqqYUVNDznuhOVRlREuSHWASw9TpGS9oJNoIQQOJ2iGWmtizyfFgUw/exec`
- `consultationFormUrl` → `https://script.google.com/macros/s/AKfycbzBpoLPg-eusMiZnAfB_Nxl7zzc_gqfuEoxn8Kh_aTR3yQdrtgaDiFFM5RRDFImz2GS/exec`

### Consultation booking specifics (`consultation-booking.Code.gs`)

- Contract: `GET ?action=slots&date=YYYY-MM-DD` → `{date,slots:[{start,end,iso}]}`;
  `POST {action:"book", name,email,message,date,startTime}` → `{success, meetLink}`.
- Slots: **weekdays 11:30–17:00, Asia/Bangkok (+07:00), 30-min**, availability-checked against the host calendar.
- On booking it creates a Calendar event **with a Google Meet link** and invites the requester **plus Max**
  (`max.gera@workeron.ai`), sending invites automatically (`sendUpdates:'all'`).
- Deployed under **`d.sadchikov@workeron.ai`** (= organizer / host calendar). Requires the project time zone set
  to **GMT+07:00** and the advanced **Calendar** service enabled.
- To change who is auto-added to every call, edit `ALWAYS_GUESTS` at the top of the script.

---

## Form endpoint resolution (how the frontend picks the URL)

`index.html` fetches `/api/settings` on load and assigns each form's endpoint from
`applyFormUrl` / `contactLeadsFormUrl` / `consultationFormUrl`, falling back to the hardcoded constant if the
fetch fails. So **the admin "Forms & Settings" page is the source of truth** for these URLs. Submissions use
`Content-Type: text/plain;charset=utf-8` (avoids CORS preflight) and expect a JSON `{success:true|false}` reply;
each form has a hidden honeypot (`website`) for spam.

## Local dev

```
npm install
npm start            # node server.js (port 3000)
# admin: http://localhost:3000/admin/  (default admin user created on first run)
```
