/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * /api/github.js | Vercel Serverless Function (v3)
 * ============================================================
 * هذا الملف يعمل على سيرفر Vercel فقط — لا شيء منه يصل للمتصفح.
 * كل الأسرار تُقرأ من Environment Variables (Vercel Dashboard →
 * Settings → Environment Variables). لا يوجد أي سر مكتوب هنا.
 *
 * Environment Variables المطلوبة:
 *   GITHUB_PAT            (إجباري) — GitHub PAT (Classic, صلاحية repo كاملة)
 *   ADMIN_PASSWORD        (إجباري) — كلمة سر لوحة التحكم
 *   GITHUB_OWNER          (اختياري) — افتراضي: jawadnajih27-spec
 *   GITHUB_REPO           (اختياري) — افتراضي: royal-nexus-store
 *   GITHUB_BRANCH         (اختياري) — افتراضي: main
 *   GITHUB_IMAGES_OWNER   (اختياري) — ريبو منفصل للصور، افتراضي = GITHUB_OWNER
 *   GITHUB_IMAGES_REPO    (اختياري) — افتراضي = GITHUB_REPO
 *   GITHUB_IMAGES_BRANCH  (اختياري) — افتراضي = GITHUB_BRANCH
 *   GITHUB_IMAGES_FOLDER  (اختياري) — افتراضي: "images"
 *
 * ⚠️ مهم: الريبو المستعمل للصور (GITHUB_IMAGES_REPO) خاصو يكون
 * PUBLIC باش تخدم روابط jsDelivr. ريبو المنتجات (GITHUB_REPO)
 * يقدر يبقى private بلا أي مشكل — هادشي كيفصل بين البيانات
 * الحساسة (كتالوج/أسعار) والأصول العامة (صور).
 *
 * ── دليل الـ API ────────────────────────────────────────────
 *   GET    /api/github                       → { products, sha }        (عام)
 *   GET    /api/github?action=images         → { images: [...] }        (عام)
 *   POST   /api/github            {password}            → { authorized }
 *   POST   /api/github?action=upload-image  (admin, body: filename, mimeType, contentBase64)
 *                                                        → { success, path, url }
 *   PUT    /api/github            (admin, body: products, sha, message) → { success }
 *   DELETE /api/github?action=delete-image  (admin, body: path)         → { success }
 *
 *   "admin" = يتطلب الهيدر: x-admin-password
 *   contentBase64 = base64 خام فقط (بلا "data:image/...;base64,")
 * ============================================================
 */

// ─────────────────────────────────────────────────────────────
// SECTION 1 — إعدادات عامة + قراءة متغيرات البيئة
// ─────────────────────────────────────────────────────────────

const PRODUCTS_PATH = "data/products.json";
const MAX_IMAGE_BASE64_CHARS = 6_000_000; // ≈ 4.3MB ملف حقيقي (base64 كيزيد الحجم ~33%)
const ALLOWED_IMAGE_TYPES = {
  "image/jpeg": "jpg",
  "image/jpg":  "jpg",
  "image/png":  "png",
  "image/webp": "webp",
};

function getEnv() {
  const OWNER  = process.env.GITHUB_OWNER  || "jawadnajih27-spec";
  const REPO   = process.env.GITHUB_REPO   || "royal-nexus-store";
  const BRANCH = process.env.GITHUB_BRANCH || "main";

  return {
    PAT:        process.env.GITHUB_PAT,
    ADMIN_PASS: process.env.ADMIN_PASSWORD,
    OWNER, REPO, BRANCH,
    IMG_OWNER:  process.env.GITHUB_IMAGES_OWNER  || OWNER,
    IMG_REPO:   process.env.GITHUB_IMAGES_REPO   || REPO,
    IMG_BRANCH: process.env.GITHUB_IMAGES_BRANCH || BRANCH,
    IMG_FOLDER: (process.env.GITHUB_IMAGES_FOLDER || "images").replace(/^\/+|\/+$/g, ""),
  };
}

function githubHeaders(pat) {
  return {
    "Authorization": `token ${pat}`,
    "Accept":        "application/vnd.github+json",
    "Content-Type":  "application/json",
  };
}

function contentsUrl(owner, repo, path) {
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
}

function cdnUrl(owner, repo, branch, path) {
  // jsDelivr — كاش أسرع وأثبت من raw.githubusercontent.com، لكن يحتاج الريبو public
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${path}`;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — أدوات مساعدة (body parsing, auth, filenames)
// ─────────────────────────────────────────────────────────────

// Vercel لا يُحلل req.body تلقائياً في ES Modules
function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let raw = "";
    req.on("data", (chunk) => { raw += chunk.toString(); });
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
    req.on("error", reject);
  });
}

function requireAdmin(req, ADMIN_PASS) {
  const supplied = req.headers["x-admin-password"] || "";
  return Boolean(supplied) && supplied === ADMIN_PASS;
}

// يولّد اسم ملف فريد وآمن (يمنع path traversal ويتفادى تضارب الأسماء)
function safeFileName(originalName, ext) {
  const base = (originalName || "image")
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "image";
  const stamp = Date.now();
  const rand  = Math.random().toString(36).slice(2, 8);
  return `${base}-${stamp}-${rand}.${ext}`;
}

// ─────────────────────────────────────────────────────────────
// SECTION 3 — Handler الرئيسي
// ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {

  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-password");
  if (req.method === "OPTIONS") return res.status(200).end();

  const env    = getEnv();
  const action = (req.query && req.query.action) || "";

  if (!env.PAT) {
    return res.status(500).json({ error: "GITHUB_PAT غير مضبوط في Vercel Environment Variables" });
  }
  if (!env.ADMIN_PASS) {
    return res.status(500).json({ error: "ADMIN_PASSWORD غير مضبوط في Vercel Environment Variables" });
  }

  const headers = githubHeaders(env.PAT);

  try {

    // ══════════════════════════════════════════════════════
    // GET ?action=images → لائحة الصور المرفوعة على GitHub
    // ══════════════════════════════════════════════════════
    if (req.method === "GET" && action === "images") {
      const url   = contentsUrl(env.IMG_OWNER, env.IMG_REPO, env.IMG_FOLDER);
      const ghRes = await fetch(url, { headers });

      if (ghRes.status === 404) return res.status(200).json({ images: [] }); // الفولدر مازال ماكاينش
      if (!ghRes.ok) throw new Error(`GitHub: ${ghRes.status} ${ghRes.statusText}`);

      const files  = await ghRes.json();
      const images = (Array.isArray(files) ? files : [])
        .filter((f) => f.type === "file")
        .map((f) => ({
          name: f.name,
          path: f.path,
          sha:  f.sha,
          size: f.size,
          url:  cdnUrl(env.IMG_OWNER, env.IMG_REPO, env.IMG_BRANCH, f.path),
        }));

      return res.status(200).json({ images });
    }

    // ══════════════════════════════════════════════════════
    // GET → كتالوج المنتجات (data/products.json)
    // ══════════════════════════════════════════════════════
    if (req.method === "GET") {
      const url   = contentsUrl(env.OWNER, env.REPO, PRODUCTS_PATH);
      const ghRes = await fetch(url, { headers });
      if (!ghRes.ok) throw new Error(`GitHub: ${ghRes.status} ${ghRes.statusText}`);

      const data     = await ghRes.json();
      const decoded  = Buffer.from(data.content, "base64").toString("utf8");
      const products = JSON.parse(decoded);
      return res.status(200).json({ products, sha: data.sha });
    }

    // ══════════════════════════════════════════════════════
    // POST ?action=upload-image → رفع صورة جديدة على GitHub (admin)
    // ══════════════════════════════════════════════════════
    if (req.method === "POST" && action === "upload-image") {
      if (!requireAdmin(req, env.ADMIN_PASS)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = await parseBody(req);
      const { filename, mimeType, contentBase64 } = body;

      if (!contentBase64) {
        return res.status(400).json({ error: "contentBase64 مطلوب" });
      }
      if (contentBase64.length > MAX_IMAGE_BASE64_CHARS) {
        return res.status(413).json({ error: "الصورة كبيرة بزاف — ضغطها قبل الرفع (أقل من ~4MB)" });
      }
      const ext = ALLOWED_IMAGE_TYPES[mimeType];
      if (!ext) {
        return res.status(400).json({ error: "نوع الصورة غير مدعوم — مقبول فقط JPG, PNG, WEBP" });
      }

      const finalName = safeFileName(filename, ext);
      const path      = `${env.IMG_FOLDER}/${finalName}`;
      const url       = contentsUrl(env.IMG_OWNER, env.IMG_REPO, path);

      const ghRes = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: `Upload image via Royal Nexus: ${finalName}`,
          content: contentBase64,
          branch:  env.IMG_BRANCH,
        }),
      });

      if (!ghRes.ok) {
        const errData = await ghRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub: ${ghRes.status}`);
      }

      return res.status(200).json({
        success: true,
        path,
        url: cdnUrl(env.IMG_OWNER, env.IMG_REPO, env.IMG_BRANCH, path),
      });
    }

    // ══════════════════════════════════════════════════════
    // POST → التحقق من كلمة سر لوحة التحكم
    // ══════════════════════════════════════════════════════
    if (req.method === "POST") {
      const body     = await parseBody(req);
      const password = body.password || "";

      if (!password) {
        return res.status(400).json({ authorized: false, error: "كلمة السر مطلوبة" });
      }

      const match = password === env.ADMIN_PASS;
      return res.status(match ? 200 : 401).json({ authorized: match });
    }

    // ══════════════════════════════════════════════════════
    // PUT → تحديث data/products.json (admin)
    // ══════════════════════════════════════════════════════
    if (req.method === "PUT") {
      if (!requireAdmin(req, env.ADMIN_PASS)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = await parseBody(req);
      const { products, sha, message } = body;

      if (!products || !sha) {
        return res.status(400).json({ error: "products و sha مطلوبان" });
      }

      const url     = contentsUrl(env.OWNER, env.REPO, PRODUCTS_PATH);
      const content = Buffer.from(JSON.stringify(products, null, 2)).toString("base64");

      const ghRes = await fetch(url, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: message || "Update products via Royal Nexus",
          content,
          sha,
          branch: env.BRANCH,
        }),
      });

      if (!ghRes.ok) {
        const errData = await ghRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub: ${ghRes.status}`);
      }

      return res.status(200).json({ success: true });
    }

    // ══════════════════════════════════════════════════════
    // DELETE ?action=delete-image → حذف صورة من GitHub (admin)
    // ══════════════════════════════════════════════════════
    if (req.method === "DELETE" && action === "delete-image") {
      if (!requireAdmin(req, env.ADMIN_PASS)) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const body = await parseBody(req);
      const { path } = body;
      if (!path) return res.status(400).json({ error: "path مطلوب" });

      const url = contentsUrl(env.IMG_OWNER, env.IMG_REPO, path);

      // GitHub Contents API كيطلب sha الملف باش يقبل الحذف
      const getRes = await fetch(url, { headers });
      if (!getRes.ok) {
        return res.status(404).json({ error: "الصورة غير موجودة" });
      }
      const fileData = await getRes.json();

      const delRes = await fetch(url, {
        method: "DELETE",
        headers,
        body: JSON.stringify({
          message: `Delete image via Royal Nexus: ${path}`,
          sha:     fileData.sha,
          branch:  env.IMG_BRANCH,
        }),
      });

      if (!delRes.ok) {
        const errData = await delRes.json().catch(() => ({}));
        throw new Error(errData.message || `GitHub: ${delRes.status}`);
      }

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error(`[API] ${req.method} ${action || "/"} error:`, err.message);
    return res.status(500).json({ error: err.message });
  }
}
