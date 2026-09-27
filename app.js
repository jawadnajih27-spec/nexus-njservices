/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * app.js | The Brain — API + PayPal + Security Engine (v3)
 * ============================================================
 * جميع الاتصالات (منتجات، مصادقة، صور) تمر عبر api/github.js.
 * لا يوجد أي سر هنا، ولا Cloudinary — الصور تترفع مباشرة على
 * GitHub بعد ضغطها محليا فهاد الملف.
 * ============================================================
 */

// Session: كلمة السر تتخزن فالذاكرة فقط، كتختفي عند إغلاق المتصفح
let _sessionPassword = "";

/** حفظ كلمة السر فالجلسة بعد تسجيل الدخول */
function setSessionPassword(pw) { _sessionPassword = pw; }

/** مسح الجلسة عند تسجيل الخروج */
function clearSession() { _sessionPassword = ""; }

// ════════════════════════════════════════════════════════════
// SECTION 1: API LAYER — المنتجات عبر api/github.js
// ════════════════════════════════════════════════════════════

/**
 * جلب كل المنتجات
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
 * حفظ لائحة المنتجات المحدّثة (يتطلب تسجيل دخول)
 * @param {Array}  products
 * @param {string} sha       - من fetchProducts()
 * @param {string} message   - رسالة الـ commit
 */
async function saveProducts(products, sha, message = "Update products via Royal Nexus") {
  const res = await fetchWithTimeout(ROYAL_CONFIG.apiUrl, {
    method:  "PUT",
    headers: {
      "Content-Type":     "application/json",
      "x-admin-password": _sessionPassword,
    },
    body: JSON.stringify({ products, sha, message }),
  });

  if (res.status === 401) throw new Error("غير مصرح — سجل الدخول من جديد");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `فشل الحفظ: ${res.status}`);
  }

  return res.json();
}

/** إضافة منتج جديد */
async function addProduct(product) {
  const { products, sha } = await fetchProducts();
  products.push(product);
  return saveProducts(products, sha, `Add product: ${product.name}`);
}

/** تحديث منتج موجود عبر ID */
async function updateProduct(id, updates) {
  const { products, sha } = await fetchProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Product not found: ${id}`);
  products[index] = { ...products[index], ...updates };
  return saveProducts(products, sha, `Update product: ${id}`);
}

/** حذف منتج عبر ID */
async function deleteProduct(id) {
  const { products, sha } = await fetchProducts();
  const filtered = products.filter((p) => p.id !== id);
  return saveProducts(filtered, sha, `Delete product: ${id}`);
}

// ════════════════════════════════════════════════════════════
// SECTION 2: AUTH — التحقق من كلمة السر عبر api/github.js
// ════════════════════════════════════════════════════════════

/**
 * @param {string} password
 * @returns {boolean}
 */
async function verifyAdminPassword(password) {
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
// SECTION 3: الصور — ضغط محلي + رفع/حذف/لائحة عبر GitHub
// (بلاصة Cloudinary)
// ════════════════════════════════════════════════════════════

/**
 * تصغير/ضغط صورة بالـ canvas قبل الرفع — يحترم القيود
 * المضبوطة فـ ROYAL_CONFIG.upload، ويحول الملف لـ base64 خام.
 *
 * @param {File} file - ملف الصورة من <input type="file">
 * @returns {Promise<{base64: string, mimeType: string}>}
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type || !file.type.startsWith("image/")) {
      return reject(new Error("الملف المختار ماشي صورة"));
    }
    if (file.size > ROYAL_CONFIG.upload.maxOriginalBytes) {
      const maxMb = (ROYAL_CONFIG.upload.maxOriginalBytes / (1024 * 1024)).toFixed(0);
      return reject(new Error(`الصورة كبيرة بزاف (الحد الأقصى ${maxMb}MB)`));
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error("تعذّرت قراءة الملف"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تعذّر فتح الصورة"));
      img.onload = () => {
        const maxDim = ROYAL_CONFIG.upload.targetMaxDimension;
        let { width, height } = img;

        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width  = maxDim;
          } else {
            width  = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width  = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        // PNG كتبقى PNG (كتحتفظ بالشفافية) — الباقي كيتحول JPEG مضغوط
        const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
        const quality     = outputType === "image/jpeg" ? ROYAL_CONFIG.upload.jpegQuality : undefined;

        const dataUrl = canvas.toDataURL(outputType, quality);
        const base64  = dataUrl.split(",")[1]; // نحيدو "data:image/...;base64,"

        resolve({ base64, mimeType: outputType });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * ضغط ثم رفع صورة على GitHub عبر api/github.js (يتطلب تسجيل دخول)
 * @param {File} file
 * @returns {Promise<string>} - رابط الصورة الجاهز (jsDelivr CDN)
 */
async function uploadImage(file) {
  const { base64, mimeType } = await compressImage(file);

  const res = await fetchWithTimeout(`${ROYAL_CONFIG.apiUrl}?action=upload-image`, {
    method:  "POST",
    headers: {
      "Content-Type":     "application/json",
      "x-admin-password": _sessionPassword,
    },
    body: JSON.stringify({
      filename:      file.name,
      mimeType,
      contentBase64: base64,
    }),
  }, 30000); // 30 ثانية — الرفع قد ياخد وقت حسب الاتصال

  if (res.status === 401) throw new Error("غير مصرح — سجل الدخول من جديد");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `فشل رفع الصورة: ${res.status}`);
  }

  const data = await res.json(); // { success, path, url }
  return data.url;
}

/**
 * حذف صورة من GitHub (يتطلب تسجيل دخول)
 * @param {string} path - المسار الكامل داخل الريبو (من listUploadedImages)
 */
async function deleteImage(path) {
  const res = await fetchWithTimeout(`${ROYAL_CONFIG.apiUrl}?action=delete-image`, {
    method:  "DELETE",
    headers: {
      "Content-Type":     "application/json",
      "x-admin-password": _sessionPassword,
    },
    body: JSON.stringify({ path }),
  });

  if (res.status === 401) throw new Error("غير مصرح — سجل الدخول من جديد");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `فشل حذف الصورة: ${res.status}`);
  }

  return res.json();
}

/**
 * جلب لائحة الصور المرفوعة سابقا (لعرضها كمعرض فلوحة التحكم
 * وتفادي رفع نفس الصورة مرتين)
 * @returns {Promise<Array<{name, path, sha, size, url}>>}
 */
async function listUploadedImages() {
  const res = await fetchWithTimeout(`${ROYAL_CONFIG.apiUrl}?action=images`, { method: "GET" });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `فشل جلب لائحة الصور: ${res.status}`);
  }

  const data = await res.json();
  return data.images;
}

// ════════════════════════════════════════════════════════════
// SECTION 4: SECURITY — تعتيم روابط التحميل
// ════════════════════════════════════════════════════════════

/**
 * XOR obfuscation — نفس الدالة تصلح للتشفير والفك (XOR متماثل)
 * ⚠️ هادشي ماشي تشفير حقيقي، غير حاجز خفيف ضد النسخ العشوائي.
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

/** تحميل PayPal SDK ديناميكياً (مرة وحدة فحياة الصفحة) */
function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (document.getElementById("paypal-sdk")) return resolve();
    const script   = document.createElement("script");
    script.id      = "paypal-sdk";
    script.src     = ROYAL_CONFIG.paypal.sdkUrl;
    script.onload  = resolve;
    script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });
}

/**
 * رسم زر PayPal لمنتج محدد
 * @param {string}   containerId
 * @param {Object}   product
 * @param {Function} onSuccess - callback بعد نجاح الدفع
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
            // منتج فيزيائي → واتساب
            const msg = encodeURIComponent(
              `✅ طلب جديد!\nالمنتج: ${product.name}\nرقم الطلب: ${order.id}\nيرجى تأكيد تفاصيل الشحن.`
            );
            window.open(`https://wa.me/${ROYAL_CONFIG.store.whatsapp}?text=${msg}`, "_blank");
            onSuccess({ product, orderId: order.id, payer: order.payer, isPhysical: true });
          }
        }
      } catch (err) {
        console.error("[RoyalNexus] Payment capture error:", err);
        alert("فشل الدفع. حاول من جديد أو تواصل معنا عبر واتساب.");
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

/** تنسيق السعر مع رمز العملة */
function formatPrice(price, currency = ROYAL_CONFIG.paypal.currency) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
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

/** fetch مع timeout — متوافق مع التابلت (بدون AbortController) */
function fetchWithTimeout(url, options = {}, ms = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}
