# Innergy Manufacturing Dashboard — Deployment Guide

## Architecture Overview

```
React App (Cloudflare Pages)
        │
        │ fetch /proxy/...
        ▼
Cloudflare Worker  ←── API Key stored here (secret)
        │
        │ Authorization: Bearer <key>
        ▼
Innergy API (app.innergy.com)
```

---

## Prerequisites

- Node.js 18+ installed
- Cloudflare account (free tier sufficient)
- Wrangler CLI: `npm install -g wrangler`
- Your Innergy API key

---

## Step 1 — Install dependencies

```bash
cd innergy-dashboard
npm install
```

---

## Step 2 — Deploy the Cloudflare Worker (API Proxy)

The Worker protects your API key. Deploy it first.

### 2a. Authenticate Wrangler
```bash
wrangler login
```

### 2b. Set secrets (never stored in code or wrangler.toml)
```bash
wrangler secret put INNERGY_API_KEY
# Paste your Innergy API key when prompted

wrangler secret put INNERGY_BASE_URL
# Enter: https://app.innergy.com

wrangler secret put ALLOWED_ORIGIN
# Enter your Pages URL (set this AFTER deploying Pages in Step 3)
# Example: https://innergy-dashboard.pages.dev
# For now, enter: *   (tighten this after Pages deploy)
```

### 2c. Deploy the Worker
```bash
wrangler deploy
```

You will receive a Worker URL like:
`https://innergy-proxy.YOUR-SUBDOMAIN.workers.dev`

**Save this URL — you need it in Step 3.**

---

## Step 3 — Configure and deploy the React frontend

### 3a. Create .env.production file

Create the file `innergy-dashboard/.env.production`:

```
VITE_PROXY_BASE_URL=https://innergy-proxy.YOUR-SUBDOMAIN.workers.dev
```

Replace with the actual Worker URL from Step 2c.

### 3b. Build the frontend

```bash
npm run build
```

Output goes to `dist/`.

### 3c. Deploy to Cloudflare Pages

**Option A — Via Wrangler CLI:**
```bash
wrangler pages deploy dist --project-name innergy-dashboard
```

**Option B — Via Cloudflare Dashboard:**
1. Log in to https://dash.cloudflare.com
2. Go to Workers & Pages → Create → Pages → Upload assets
3. Upload the `dist/` folder
4. Set project name: `innergy-dashboard`

Your app URL will be:
`https://innergy-dashboard.pages.dev`

---

## Step 4 — Lock down CORS (after Pages deploy)

Now that you have both URLs, update the Worker ALLOWED_ORIGIN secret:

```bash
wrangler secret put ALLOWED_ORIGIN
# Enter: https://innergy-dashboard.pages.dev
```

Then redeploy:
```bash
wrangler deploy
```

---

## Step 5 — Verify

1. Open https://innergy-dashboard.pages.dev
2. Projects list should load within 1-2 seconds
3. Click any project → Production work orders load on demand
4. Check browser DevTools → Network tab:
   - Requests go to `innergy-proxy.*.workers.dev` (not directly to innergy.com)
   - No API key visible in any request from the browser

---

## Local Development

Run both services in two terminals:

**Terminal 1 — Worker:**
```bash
# Create a .dev.vars file in the project root (gitignored):
echo 'INNERGY_API_KEY=your_actual_key' > .dev.vars
echo 'INNERGY_BASE_URL=https://app.innergy.com' >> .dev.vars
echo 'ALLOWED_ORIGIN=*' >> .dev.vars

npm run worker:dev
# Worker runs at http://localhost:8787
```

**Terminal 2 — React app:**
```bash
npm run dev
# App runs at http://localhost:3000
# Vite proxies /proxy/* → localhost:8787 automatically
```

---

## .gitignore

Add these to `.gitignore` before committing:

```
node_modules/
dist/
.env.production
.dev.vars
```

---

## Known Assumptions / Verification Required

| Item | Assumption | How to verify |
|---|---|---|
| API key header format | `Authorization: Bearer <key>` | Test with curl; adjust `worker/index.ts` if different |
| Work order type string | `"PRODUCTION"` (case-insensitive match in code) | Confirm against real WO response |
| Innergy base URL | `https://app.innergy.com` | Confirm no tenant-specific subdomain |
| Pagination | Not required for 25 projects | If project count grows >100, add `?pageSize=` param support |

---

## Adding a Custom Domain (Optional)

In Cloudflare Pages dashboard:
1. Go to your `innergy-dashboard` project
2. Custom domains → Add custom domain
3. Enter your domain (e.g., `manufacturing.yourdomain.com`)
4. Update `ALLOWED_ORIGIN` Worker secret to match

---

## File Structure Reference

```
innergy-dashboard/
├── worker/
│   └── index.ts          ← Cloudflare Worker (API proxy)
├── src/
│   ├── types/
│   │   └── innergy.ts    ← TypeScript types from API schema
│   ├── hooks/
│   │   └── useInnergy.ts ← Data fetching logic
│   ├── components/
│   │   ├── ProjectList.tsx
│   │   └── WorkOrderPanel.tsx
│   ├── utils.ts          ← Date formatting, status colors
│   ├── App.tsx           ← Root layout and state
│   ├── main.tsx          ← React entry point
│   └── index.css         ← All styles
├── public/
│   └── _redirects        ← SPA routing for Cloudflare Pages
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
└── wrangler.toml         ← Worker config (no secrets here)
```
