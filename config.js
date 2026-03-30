/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * config.js | Central Configuration File
 * ============================================================
 * ⚠️  SECURITY WARNING:
 *     This file contains sensitive credentials.
 *     - NEVER commit this file to a PUBLIC repository.
 *     - Add config.js to your .gitignore immediately.
 *     - For production, consider a Vercel Edge Function to
 *       proxy GitHub API calls and keep the PAT server-side.
 * ============================================================
 */

const ROYAL_CONFIG = {

  // ──────────────────────────────────────────────
  // 🔑 GITHUB CONFIGURATION
  // ──────────────────────────────────────────────
  github: {
    // Your GitHub Personal Access Token (Classic)
    // Permissions needed: repo → contents (read & write)
    // Format: ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    pat: "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",

    // GitHub username / org that owns the repo
    owner: "jawadnajih27-spec",

    // Repository name where products.json lives
    repo: "royal-nexus-store",

    // Branch to read/write from
    branch: "main",

    // Path to the products data file inside the repo
    productsPath: "data/products.json",
  },

  // ──────────────────────────────────────────────
  // 💳 PAYPAL CONFIGURATION
  // ──────────────────────────────────────────────
  paypal: {
    // Your PayPal REST App Client ID
    // Get it from: https://developer.paypal.com/dashboard/applications
    clientId: "YOUR_PAYPAL_CLIENT_ID_HERE",

    // Currency for all transactions
    currency: "USD",

    // PayPal SDK URL (auto-injects clientId & currency)
    get sdkUrl() {
      return `https://www.paypal.com/sdk/js?client-id=${this.clientId}&currency=${this.currency}`;
    },
  },

  // ──────────────────────────────────────────────
  // 🖼️  CLOUDINARY CONFIGURATION (Image Hosting)
  // ──────────────────────────────────────────────
  cloudinary: {
    cloudName: "dztczxekd",
    uploadPreset: "royal_nexus_unsigned", // Create an "unsigned" upload preset in Cloudinary dashboard
    get uploadUrl() {
      return `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
    },
  },

  // ──────────────────────────────────────────────
  // 🔐 MANAGER DASHBOARD
  // ──────────────────────────────────────────────
  manager: {
    // Simple access password for manager.html
    // For production, replace with a proper auth system
    accessPassword: "njservices25",
  },

  // ──────────────────────────────────────────────
  // 🔒 DOWNLOAD LINK SECURITY
  // ──────────────────────────────────────────────
  security: {
    // A random secret key used to XOR-obfuscate download URLs
    // Change this to any random string — keep it secret
    // This is a lightweight obfuscation layer (not cryptography)
    // For real security, use a server-side signed URL system
    obfuscationKey: "NJSERVICES_ROYAL_KEY_2025",
  },

  // ──────────────────────────────────────────────
  // 🌐 STORE SETTINGS
  // ──────────────────────────────────────────────
  store: {
    name: "NJSERVICES Royal Nexus",
    tagline: "Digital Excellence. Delivered.",
    logo: "NJ",
    whatsapp: "+212600000000", // For physical product orders
    successPage: "success.html",
  },
};

// ──────────────────────────────────────────────────────────
// Helper: Build GitHub API Authorization header
// Always uses "token" prefix (required for Classic PAT)
// ──────────────────────────────────────────────────────────
function getGitHubHeaders() {
  const headers = {
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  const pat = (ROYAL_CONFIG.github.pat || "").trim();

  // Support both classic and fine-grained tokens; avoid sending empty auth header.
  if (pat) {
    headers["Authorization"] = pat.startsWith("github_pat_") ? `Bearer ${pat}` : `token ${pat}`;
  }

  return headers;

// ──────────────────────────────────────────────────────────
// Helper: Build GitHub Contents API URL
// ──────────────────────────────────────────────────────────
function getGitHubUrl(path, options = {}) {
  const { owner, repo } = ROYAL_CONFIG.github;
  const normalizedPath = String(path || "").replace(/^\/+/, "");
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/contents/${normalizedPath}`);
  
  if (options.ref) {
    url.searchParams.set("ref", options.ref);
  }
  // No trailing slash — common source of 404 errors
  return url.toString();
}
