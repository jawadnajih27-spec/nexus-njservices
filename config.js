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
  return {
    "Authorization": `token ${ROYAL_CONFIG.github.pat}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

// ──────────────────────────────────────────────────────────
// Helper: Build GitHub Contents API URL
// ──────────────────────────────────────────────────────────
function getGitHubUrl(path) {
  const { owner, repo } = ROYAL_CONFIG.github;
  // No trailing slash — common source of 404 errors
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}
