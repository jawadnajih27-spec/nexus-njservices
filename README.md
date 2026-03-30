# 🏛️ The Royal Nexus — NJSERVICES Store System

> A serverless luxury e-commerce engine powered by GitHub API + PayPal SDK.

---

## 📂 File Structure

```
royal-nexus/
├── config.js          ← 🔑 All credentials (NEVER commit to public repo)
├── app.js             ← 🧠 GitHub API + PayPal + Security logic
├── index.html         ← 🛍️  Customer Storefront
├── manager.html       ← 🎛️  Manager Dashboard (password protected)
├── success.html       ← ✅  Post-payment download page
└── data/
    └── products.json  ← 📦 Product catalogue (lives in GitHub repo)
```

---

## ⚙️ Setup Guide

### Step 1 — GitHub Repository
1. Create a new **private** GitHub repository (e.g. `royal-nexus-store`)
2. Create the folder `data/` and upload `products.json` to it
3. Enable **GitHub Pages** on the `main` branch (Settings → Pages → Source: main)

### Step 2 — GitHub PAT
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate a **Classic** token with `repo` scope (full control)
3. Copy the token — you won't see it again

### Step 3 — PayPal App
1. Go to [developer.paypal.com](https://developer.paypal.com/dashboard/applications)
2. Create a new REST App
3. Copy your **Client ID** (Sandbox for testing, Live for production)

### Step 4 — Cloudinary (Image Uploads)
1. Sign up at [cloudinary.com](https://cloudinary.com) (free tier is fine)
2. Go to Settings → Upload → Add upload preset → Set to **Unsigned**
3. Note your **Cloud Name** and **Preset Name**

### Step 5 — Fill in config.js
```js
const ROYAL_CONFIG = {
  github: {
    pat: "ghp_YOUR_REAL_TOKEN",
    owner: "jawadnajih27-spec",
    repo: "royal-nexus-store",
    branch: "main",
    productsPath: "data/products.json",
  },
  paypal: {
    clientId: "YOUR_PAYPAL_CLIENT_ID",
    currency: "USD",
  },
  cloudinary: {
    cloudName: "YOUR_CLOUD_NAME",
    uploadPreset: "royal_nexus_unsigned",
  },
  manager: {
    accessPassword: "choose_a_strong_password",
  },
  security: {
    obfuscationKey: "CHOOSE_A_RANDOM_SECRET_STRING",
  },
  store: {
    whatsapp: "+212600000000",
  },
};
```

### Step 6 — Deploy
Upload all files to your GitHub Pages repo root. Your store is live at:
`https://jawadnajih27-spec.github.io/royal-nexus-store/`

---

## 🔑 Security Notes

| Layer | What it does | Strength |
|-------|-------------|----------|
| PAT Auth | Authenticates GitHub API writes | ✅ Strong (keep secret) |
| Manager Password | Protects the dashboard | ⚠️ Basic (upgrade to proper auth for production) |
| URL Obfuscation | Hides download links in HTML source | ⚠️ Light (use private cloud links for real security) |
| PayPal Capture | Funds confirmed server-side by PayPal | ✅ Strong |

**For production security**, use:
- Private Google Drive / Dropbox links that expire
- Or a Vercel Edge Function to proxy the PAT and issue signed URLs

---

## 🔄 How the PayPal Flow Works

```
Customer clicks Buy
    ↓
PayPal SDK opens (createOrder)
    ↓
Customer pays (onApprove → capture)
    ↓
app.js: decodeDownloadUrl(product.downloadUrl)
    ↓
Download link revealed in modal OR redirect to success.html#dl=...
```

---

## 📱 Tablet / Mobile Compatibility

- All fetch calls use `fetchWithTimeout()` wrapper (no AbortController)
- Image upload works with device camera via `<input type="file" accept="image/*">`
- Mobile sidebar toggle on manager.html for small screens
- Touch-friendly button sizes throughout

---

## 🧑‍💻 Built by NJSERVICES
*وكالة النخبة الرقمية*
