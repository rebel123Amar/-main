# Rebel Custom Shopify App

A complete Shopify app adding:
- **Cart Customization** — special instructions + multiple image uploads
- **Product Reviews** — star ratings, written reviews, photos, videos
- **Admin Dashboard** — review moderation, order viewer, settings
- **Instagram Link** — configurable link below every product's reviews

---

## Prerequisites

- Node.js 18+
- npm / pnpm
- Shopify Partner account + development store
- Supabase account (for image & media storage)
- Shopify CLI: `npm install -g @shopify/cli`

---

## Setup

### 1. Clone and install

```bash
cd rebel-app
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your actual values (Shopify keys + Supabase credentials)
```

### 3. Set up database

```bash
# For local development (SQLite):
npx prisma generate
npx prisma db push

# For production (PostgreSQL), update DATABASE_URL first, then:
npx prisma migrate deploy
```

### 4. Set up Supabase Storage

See [Supabase Storage Setup Guide](#supabase-storage-setup) below.

### 5. Create Shopify app in Partner Dashboard

1. Go to [partners.shopify.com](https://partners.shopify.com)
2. Apps → Create app → Public app
3. Copy **API Key** and **API Secret** → paste into `.env`
4. Set App URL = your dev tunnel URL (shown when you run `npm run dev`)
5. Add redirect URL: `https://YOUR_URL/auth/callback`

### 6. Run local development

```bash
npm run dev
# Opens a tunnel (Cloudflare) and launches the app
# Visit the URL shown in terminal to install on your dev store
```

---

## Supabase Storage Setup

### 1. Create a Supabase Project
1. Log in to [supabase.com](https://supabase.com) and create or open your project.
2. Go to **Project Settings** → **API**.
3. Copy **Project URL** and paste it into `.env` as `SUPABASE_URL`.
4. Copy the **`service_role` (secret) key** and paste it into `.env` as `SUPABASE_SERVICE_ROLE_KEY`.

### 2. Storage Bucket
1. Navigate to **Storage** → **Buckets** in your Supabase dashboard.
2. Click **New Bucket**.
3. Name it `order-customizations` (or matching your `SUPABASE_STORAGE_BUCKET` variable).
4. Toggle **Public bucket** to **ON** (so image URLs are accessible to Shopify order view & merchant dashboard).
5. Click **Save**.

*Note: The app will also automatically attempt to initialize this bucket if it doesn't already exist.*

## Add Blocks to Your Store (Non-Destructive)

### Product Reviews Block

1. Shopify Admin → **Online Store** → **Themes** → **Customize**
2. Navigate to any **Product** page template
3. Click **"Add block"** or **"+"** in the sections panel
4. Select **"Product Reviews"** from Apps
5. In block settings, enter your **App URL**
6. Click **Save**

### Cart Customization Block

1. Shopify Admin → **Online Store** → **Themes** → **Customize**
2. Navigate to **Cart** page (or Cart Drawer section)
3. Click **"Add block"** → Select **"Cart Customization"**
4. Enter your **App URL** in block settings
5. Click **Save**

> ⚠️ **Important**: These are app blocks — they do NOT modify your theme code. They can be removed at any time from the Theme Editor.

---

## Deployment to Production

### Option A: Railway (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway new
railway up

# Set env vars
railway variables set SHOPIFY_API_KEY=xxx
railway variables set SHOPIFY_API_SECRET=xxx
# ... (all vars from .env)
```

### Option B: Render

1. Create new Web Service → connect your GitHub repo
2. Build command: `npm install && npx prisma generate && npm run build`
3. Start command: `npm run docker-start`
4. Add all env vars

### Deploy Extensions

```bash
# After deploying backend:
shopify app deploy

# This pushes extensions to Shopify's CDN
# Your theme blocks will be available in Theme Editor
```

---

## File Structure

```
rebel-app/
├── shopify.app.toml              ← App config
├── .env.example                  ← Env template
├── prisma/schema.prisma          ← Database schema
├── app/
│   ├── shopify.server.ts         ← Shopify auth
│   ├── root.tsx                  ← HTML root
│   └── routes/
│       ├── app.tsx               ← Admin shell + nav
│       ├── app._index.tsx        ← Dashboard home
│       ├── app.reviews.tsx       ← Review moderation
│       ├── app.orders.tsx        ← Orders viewer
│       ├── app.settings.tsx      ← App settings
│       ├── api.reviews.tsx       ← Public reviews API
│       ├── api.upload.tsx        ← S3 upload API
│       ├── api.webhooks.tsx      ← Shopify webhooks
│       └── auth.$.tsx            ← OAuth handler
└── extensions/
    ├── cart-ui/
    │   ├── blocks/cart-customization.liquid
    │   └── assets/
    │       ├── cart-customization.css
    │       └── cart-customization.js
    └── product-reviews/
        ├── blocks/product-reviews.liquid
        └── assets/
            ├── product-reviews.css
            └── product-reviews.js
```

---

## API Reference

### `GET /api/reviews`
```
?shop=store.myshopify.com&productId=123&page=1
```
Returns: paginated approved reviews, rating stats, Instagram URL

### `POST /api/reviews`
```json
{
  "shop": "store.myshopify.com",
  "productId": "123",
  "authorName": "Jane",
  "authorEmail": "jane@example.com",
  "rating": 5,
  "title": "Amazing!",
  "reviewBody": "Loved it.",
  "mediaUrls": ["https://s3.url/image.jpg"]
}
```

### `POST /api/upload`
```
multipart/form-data
fields: prefix (string), files (File[])
```
Returns: `{ success: true, urls: ["https://..."] }`

---

## Security Notes

- API keys stored as environment variables — never in code
- Shopify webhooks verified with HMAC-SHA256
- Review submissions rate-limited (3/hour per IP)
- Honeypot field prevents basic bot submissions
- HTML output is escaped to prevent XSS
- Cart attributes use `_` prefix so they are hidden from customers
