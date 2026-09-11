/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * /api/github.js | Vercel Serverless Function
 * ============================================================
 * هذا الملف يعمل على سيرفر Vercel فقط — ليس في المتصفح.
 *
 * Environment Variables المطلوبة في Vercel Dashboard:
 *   - GITHUB_PAT
 *   - GITHUB_OWNER   (اختياري — افتراضي: jawadnajih27-spec)
 *   - GITHUB_REPO    (اختياري — افتراضي: royal-nexus-store)
 *   - GITHUB_BRANCH  (اختياري — افتراضي: main)
 *   - ADMIN_PASSWORD
 * ============================================================
 */

// ── مساعد: قراءة body يدوياً ─────────────────────────────
// Vercel لا يُحلل req.body تلقائياً في ES Modules
function parseBody(req) {
  return new Promise((resolve, reject) => {
    // إذا كان محللاً مسبقاً (CommonJS أو بعض إعدادات Vercel)
    if (req.body && typeof req.body === "object") {
      return resolve(req.body);
    }
    let raw = "";
    req.on("data", (chunk) => { raw += chunk.toString(); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

export default async function handler(req, res) {

  // ── CORS ────────────────────────────────────────────────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return res.status(200).end();

  // ── متغيرات البيئة ──────────────────────────────────────
  const PAT           = process.env.GITHUB_PAT;
  const OWNER         = process.env.GITHUB_OWNER  || "jawadnajih27-spec";
  const REPO          = process.env.GITHUB_REPO   || "royal-nexus-store";
  const BRANCH        = process.env.GITHUB_BRANCH || "main";
  const ADMIN_PASS    = process.env.ADMIN_PASSWORD;
  const PRODUCTS_PATH = "data/products.json";

  // ── تحقق من ضرورة وجود المتغيرات ───────────────────────
  if (!PAT) {
    return res.status(500).json({ error: "GITHUB_PAT غير مضبوط في Vercel Environment Variables" });
  }
  if (!ADMIN_PASS) {
    return res.status(500).json({ error: "ADMIN_PASSWORD غير مضبوط في Vercel Environment Variables" });
  }

  const GITHUB_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PRODUCTS_PATH}`;
  const GITHUB_HEADERS = {
    "Authorization": `token ${PAT}`,
    "Accept":        "application/vnd.github+json",
    "Content-Type":  "application/json",
  };

  // ══════════════════════════════════════════════════════════
  // GET → جلب المنتجات (عام)
  // ══════════════════════════════════════════════════════════
  if (req.method === "GET") {
    try {
      const ghRes = await fetch(GITHUB_URL, { headers: GITHUB_HEADERS });
      if (!ghRes.ok) throw new Error(`GitHub: ${ghRes.status} ${ghRes.statusText}`);
      const data     = await ghRes.json();
      const decoded  = Buffer.from(data.content, "base64").toString("utf8");
      const products = JSON.parse(decoded);
      return res.status(200).json({ products, sha: data.sha });
    } catch (err) {
      console.error("[API] GET error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  // POST → التحقق من كلمة السر
  // ══════════════════════════════════════════════════════════
  if (req.method === "POST") {
    try {
      const body     = await parseBody(req);
      const password = body.password || "";

      console.log("[API] POST /verify — password received:", password ? "yes" : "no");

      if (!password) {
        return res.status(400).json({ authorized: false, error: "كلمة السر مطلوبة" });
      }

      const match = password === ADMIN_PASS;
      console.log("[API] Password match:", match);

      return res.status(match ? 200 : 401).json({ authorized: match });

    } catch (err) {
      console.error("[API] POST error:", err.message);
      return res.status(500).json({ authorized: false, error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  // PUT → تحديث المنتجات (يحتاج x-admin-password header)
  // ══════════════════════════════════════════════════════════
  if (req.method === "PUT") {
    const adminPass = req.headers["x-admin-password"] || "";

    if (!adminPass || adminPass !== ADMIN_PASS) {
      console.warn("[API] PUT — unauthorized attempt");
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const body                      = await parseBody(req);
      const { products, sha, message } = body;

      if (!products || !sha) {
        return res.status(400).json({ error: "products و sha مطلوبان" });
      }

      const content = Buffer.from(JSON.stringify(products, null, 2)).toString("base64");
      const ghRes   = await fetch(GITHUB_URL, {
        method:  "PUT",
        headers: GITHUB_HEADERS,
        body:    JSON.stringify({
          message: message || "Update products via Royal Nexus",
          content,
          sha,
          branch: BRANCH,
        }),
      });

      if (!ghRes.ok) {
        const errData = await ghRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub: ${ghRes.status}`);
      }

      return res.status(200).json({ success: true });

    } catch (err) {
      console.error("[API] PUT error:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
