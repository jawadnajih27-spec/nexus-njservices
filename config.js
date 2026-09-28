/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * config.js | Client-Side Configuration (v3)
 * ============================================================
 * ✅ هذا الملف آمن 100% للنشر العلني — ما فيه حتى سر.
 *
 * الأسرار (GITHUB_PAT, ADMIN_PASSWORD, GITHUB_OWNER/REPO/BRANCH)
 * كاينين فـ Vercel Environment Variables فقط، وكيتقرأو من
 * api/github.js (سيرفر). هاد الملف ما عندوش الحق يشوفهم.
 *
 * ⚠️ لا Cloudinary فهاد النسخة — رفع الصور صايفي عبر
 * api/github.js مباشرة (GitHub Contents API).
 * ============================================================
 */

const ROYAL_CONFIG = {

  // ──────────────────────────────────────────────
  // 🔌 نقطة الاتصال الوحيدة
  // كل شيء (منتجات، تحقق كلمة السر، رفع/حذف صور) يمر من هنا
  // ──────────────────────────────────────────────
  apiUrl: "/api/github",

  // ──────────────────────────────────────────────
  // 💳 PAYPAL — Client ID فقط (مصمم أصلا ليكون عام، ماشي سر)
  // ──────────────────────────────────────────────
  paypal: {
    clientId: "AZDxjD3539824_SampleClientId_Dummy1234567890abcdefghijklmnopqrstuvwxyz",
    currency: "USD",
    get sdkUrl() {
      return `https://www.paypal.com/sdk/js?client-id=${this.clientId}&currency=${this.currency}`;
    },
  },

  // ──────────────────────────────────────────────
  // 🖼️ رفع الصور (بلاصة Cloudinary)
  // الضغط/التصغير كيتم محليا فـ app.js (canvas) قبل الإرسال
  // لـ api/github.js — هادشي كيخلي الصور ديما تحت الحد المسموح
  // ──────────────────────────────────────────────
  upload: {
    maxOriginalBytes:   8 * 1024 * 1024, // 8MB — أقصى حجم مقبول من الجهاز قبل الضغط
    targetMaxDimension: 1600,             // أطول ضلع للصورة بعد الضغط (بالبكسل)
    jpegQuality:        0.82,             // جودة الضغط لصيغة JPEG
  },

  // ──────────────────────────────────────────────
  // 🔒 تعتيم روابط التحميل (XOR خفيف، ماشي تشفير حقيقي)
  // ──────────────────────────────────────────────
  security: {
    obfuscationKey: "NJSERVICES_ROYAL_KEY_2025",
  },

  // ──────────────────────────────────────────────
  // 🌐 إعدادات المتجر
  // ──────────────────────────────────────────────
  store: {
    name:        "NJSERVICES Royal Nexus",
    tagline:     "Digital Excellence. Delivered.",
    logo:        "NJ",
    whatsapp:    "+212703652247", // لطلبات المنتجات الفيزيائية
    successPage: "success.html",
  },
};
