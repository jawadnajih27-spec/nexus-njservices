/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * app.js | The Brain — API + PayPal + Security Engine
 * ============================================================
 * جميع الاتصالات بـ GitHub تمر عبر /api/github (Vercel proxy).
 * لا يوجد PAT في هذا الملف — الأسرار على السيرفر فقط.
 * ============================================================
 */

// Session: يُخزَّن في الذاكرة فقط، يختفي عند إغلاق المتصفح
let _sessionPassword = "";

/** حفظ كلمة السر في الجلسة بعد تسجيل الدخول */
function setSessionPassword(pw) { _sessionPassword = pw; }

/** مسح الجلسة عند تسجيل الخروج */
function clearSession() { _sessionPassword = ""; }

// ════════════════════════════════════════════════════════════
// SECTION 1: API LAYER — كل الاتصالات عبر /api/github
// ════════════════════════════════════════════════════════════

/**
 * Fetch all products from GitHub via secure proxy
 * Returns: { products: [], sha: "..." }
 */
async function fetchProducts() {
  const res = await fetchWithTimeout(ROYAL_CONFIG.apiUrl, { method: "GET" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `API error: ${res.status}`);
  }

  return res.json(); // { products, sha }
}

/**
 * Save updated products array via secure proxy
 * يتحقق من كلمة السر على السيرفر عبر x-admin-password header
 *
 * @param {Array}  products - المنتجات المحدّثة
 * @param {string} sha      - SHA الحالي من fetchProducts()
 * @param {string} message  - رسالة الـ commit
 */
async function saveProducts(products, sha, message = "Update products via Royal Nexus") {
  const res = await fetchWithTimeout(ROYAL_CONFIG.apiUrl, {
    method:  "PUT",
    headers: {
      "Content-Type":      "application/json",
      "x-admin-password":  _sessionPassword, // ← يُرسل للسيرفر، لا يظهر في GitHub
    },
    body: JSON.stringify({ products, sha, message }),
  });

  if (res.status === 401) throw new Error("غير مصرح — تحقق من كلمة السر");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Save failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Add a new product
 */
async function addProduct(product) {
  const { products, sha } = await fetchProducts();
  products.push(product);
  return saveProducts(products, sha, `Add product: ${product.name}`);
}

/**
 * Delete a product by ID
 */
async function deleteProduct(id) {
  const { products, sha } = await fetchProducts();
  const filtered = products.filter((p) => p.id !== id);
  return saveProducts(filtered, sha, `Delete product: ${id}`);
}

/**
 * Update an existing product by ID
 */
async function updateProduct(id, updates) {
  const { products, sha } = await fetchProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Product not found: ${id}`);
  products[index] = { ...products[index], ...updates };
  return saveProducts(products, sha, `Update product: ${id}`);
}

// ════════════════════════════════════════════════════════════
// SECTION 2: AUTH — التحقق من كلمة السر عبر API
// ════════════════════════════════════════════════════════════

/**
 * التحقق من كلمة السر عبر Vercel API
 * السيرفر يقارنها بـ ADMIN_PASSWORD — لا شيء يظهر في المتصفح
 *
 * @param {string} password - كلمة السر المدخلة
 * @returns {boolean}
 */
async function verifyAdminPassword(password) {
  console.log("[Auth] Sending verify request to:", ROYAL_CONFIG.apiUrl);
  try {
    const res = await fetchWithTimeout(ROYAL_CONFIG.apiUrl, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ password }),
    });

    const data = await res.json();
    return data.authorized === true;
  } catch (err) {
    console.error("[RoyalNexus Auth] Verify error:", err);
    return false;
  }
}

// ════════════════════════════════════════════════════════════
// SECTION 3: CLOUDINARY IMAGE UPLOAD
// ════════════════════════════════════════════════════════════

/**
 * رفع صورة إلى Cloudinary عبر Unsigned Upload Preset
 * آمن من المتصفح — Unsigned preset مصمم للاستخدام العام
 *
 * @param {File} file - ملف الصورة من <input type="file">
 * @returns {string}  - رابط الصورة الآمن (https)
 */
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", ROYAL_CONFIG.cloudinary.uploadPreset);

  const res = await fetchWithTimeout(ROYAL_CONFIG.cloudinary.uploadUrl, {
    method: "POST",
    body:   formData,
  }, 30000); // 30 ثانية لرفع الصور

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || "Cloudinary upload failed");
  }

  const data = await res.json();
  return data.secure_url; // ← رابط https مباشر
}

// ════════════════════════════════════════════════════════════
// SECTION 4: SECURITY — DOWNLOAD LINK OBFUSCATION
// ════════════════════════════════════════════════════════════

/**
 * XOR obfuscation — يُخفي رابط التحميل في products.json
 * نفس الدالة تعمل للتشفير والفك (XOR متماثل)
 */
function xorObfuscate(text) {
  const key = ROYAL_CONFIG.security.obfuscationKey;
  let result = "";
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ key.charCodeAt(i % key.length)
    );
  }
  return result;
}

function encodeDownloadUrl(url) {
  return Array.from(xorObfuscate(url))
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

function decodeDownloadUrl(hex) {
  const chars = hex.match(/.{1,2}/g).map((h) => String.fromCharCode(parseInt(h, 16)));
  return xorObfuscate(chars.join(""));
}

// ════════════════════════════════════════════════════════════
// SECTION 5: PAYPAL INTEGRATION
// ════════════════════════════════════════════════════════════

/**
 * تحميل PayPal SDK ديناميكياً
 */
function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (document.getElementById("paypal-sdk")) return resolve();
    const script    = document.createElement("script");
    script.id       = "paypal-sdk";
    script.src      = ROYAL_CONFIG.paypal.sdkUrl;
    script.onload   = resolve;
    script.onerror  = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });
}

/**
 * رسم زر PayPal لمنتج محدد
 *
 * @param {string}   containerId - ID عنصر الـ DOM
 * @param {Object}   product     - بيانات المنتج
 * @param {Function} onSuccess   - callback بعد نجاح الدفع
 */
function renderPayPalButton(containerId, product, onSuccess) {
  paypal.Buttons({

    style: {
      layout: "vertical",
      color:  "gold",
      shape:  "rect",
      label:  "pay",
      height: 44,
    },

    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: {
            value:         product.price.toString(),
            currency_code: ROYAL_CONFIG.paypal.currency,
          },
          description: product.name,
        }],
        application_context: {
          brand_name:          ROYAL_CONFIG.store.name,
          shipping_preference: product.type === "digital" ? "NO_SHIPPING" : "GET_FROM_FILE",
        },
      });
    },

    onApprove: async (data, actions) => {
      try {
        const order = await actions.order.capture();

        if (order.status === "COMPLETED") {
          if (product.type === "digital") {
            const downloadUrl = decodeDownloadUrl(product.downloadUrl);
            onSuccess({ product, downloadUrl, orderId: order.id, payer: order.payer });
          } else {
            // منتج مادي → WhatsApp
            const msg = encodeURIComponent(
              `✅ طلب جديد!\nالمنتج: ${product.name}\nرقم الطلب: ${order.id}\nيرجى تأكيد تفاصيل الشحن.`
            );
            window.open(`https://wa.me/${ROYAL_CONFIG.store.whatsapp}?text=${msg}`, "_blank");
            onSuccess({ product, orderId: order.id, payer: order.payer, isPhysical: true });
          }
        }
      } catch (err) {
        console.error("[RoyalNexus] Payment capture error:", err);
        alert("فشل الدفع. يرجى المحاولة مرة أخرى أو التواصل عبر WhatsApp.");
      }
    },

    onError: (err) => {
      console.error("[RoyalNexus] PayPal error:", err);
    },

  }).render(`#${containerId}`);
}

// ════════════════════════════════════════════════════════════
// SECTION 6: UTILITIES
// ════════════════════════════════════════════════════════════

/** توليد ID فريد للمنتج */
function generateId() {
  return "prod_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** عرض Toast notification */
function showToast(message, type = "success") {
  const toast       = document.createElement("div");
  toast.className   = `royal-toast royal-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("royal-toast--visible"), 10);
  setTimeout(() => {
    toast.classList.remove("royal-toast--visible");
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

/**
 * fetch مع timeout — متوافق مع التابلت (بدون AbortController)
 */
function fetchWithTimeout(url, options = {}, ms = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}
