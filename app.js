/**
 * ============================================================
 * THE ROYAL NEXUS — NJSERVICES
 * app.js | The Brain — GitHub API + Security Engine
 * ============================================================
 */

// ════════════════════════════════════════════════════════════
// SECTION 1: GITHUB API — DATA LAYER
// ════════════════════════════════════════════════════════════

/**
 * Fetch all products from GitHub (products.json)
 * Returns: { products: [], sha: "..." }
 * The SHA is required for any subsequent PUT (update) operation.
 */
async function fetchProducts() {
  const url = getGitHubUrl(ROYAL_CONFIG.github.productsPath);

  try {
    const res = await fetch(url, {
      headers: getGitHubHeaders(),
    });

    if (!res.ok) {
      throw new Error(`GitHub GET failed: ${res.status} ${res.statusText}`);
    }

    const data = await res.json();

    // GitHub returns file content as Base64 — decode it
    const decoded = atob(data.content.replace(/\n/g, ""));
    const products = JSON.parse(decoded);

    return {
      products,
      sha: data.sha, // ← Critical: needed for PUT to avoid conflicts
    };
  } catch (err) {
    console.error("[RoyalNexus] fetchProducts error:", err);
    throw err;
  }
}

/**
 * Save updated products array back to GitHub
 * Uses PUT with the current SHA to prevent overwrite conflicts.
 *
 * @param {Array}  products  - Full products array to save
 * @param {string} sha       - Current file SHA from fetchProducts()
 * @param {string} message   - Git commit message
 */
async function saveProducts(products, sha, message = "Update products via Royal Nexus Manager") {
  const url = getGitHubUrl(ROYAL_CONFIG.github.productsPath);

  // Encode the JSON string to Base64 (required by GitHub API)
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(products, null, 2))));

  const body = {
    message,
    content,
    sha,       // ← Must match current file SHA or GitHub returns 409 Conflict
    branch: ROYAL_CONFIG.github.branch,
  };

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: getGitHubHeaders(),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(`GitHub PUT failed: ${res.status} — ${errData.message}`);
    }

    return await res.json();
  } catch (err) {
    console.error("[RoyalNexus] saveProducts error:", err);
    throw err;
  }
}

/**
 * Add a new product and save to GitHub
 * @param {Object} product - Product object to add
 */
async function addProduct(product) {
  const { products, sha } = await fetchProducts();
  products.push(product);
  return saveProducts(products, sha, `Add product: ${product.name}`);
}

/**
 * Update an existing product by ID
 * @param {string} id      - Product ID
 * @param {Object} updates - Fields to update
 */
async function updateProduct(id, updates) {
  const { products, sha } = await fetchProducts();
  const index = products.findIndex((p) => p.id === id);
  if (index === -1) throw new Error(`Product not found: ${id}`);
  products[index] = { ...products[index], ...updates };
  return saveProducts(products, sha, `Update product: ${id}`);
}

/**
 * Delete a product by ID
 * @param {string} id - Product ID to delete
 */
async function deleteProduct(id) {
  const { products, sha } = await fetchProducts();
  const filtered = products.filter((p) => p.id !== id);
  return saveProducts(filtered, sha, `Delete product: ${id}`);
}

// ════════════════════════════════════════════════════════════
// SECTION 2: CLOUDINARY IMAGE UPLOAD
// ════════════════════════════════════════════════════════════

/**
 * Upload an image file to Cloudinary via unsigned upload preset
 * @param {File} file - Image file from <input type="file">
 * @returns {string} - Secure image URL
 */
async function uploadImage(file) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", ROYAL_CONFIG.cloudinary.uploadPreset);

  const res = await fetch(ROYAL_CONFIG.cloudinary.uploadUrl, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) throw new Error("Cloudinary upload failed");
  const data = await res.json();
  return data.secure_url;
}

// ════════════════════════════════════════════════════════════
// SECTION 3: SECURITY — DOWNLOAD LINK OBFUSCATION
// ════════════════════════════════════════════════════════════

/**
 * Lightweight XOR-based obfuscation for download URLs.
 *
 * ⚠️  This is NOT encryption. It prevents casual URL exposure
 *     in HTML source code. For true security, use server-side
 *     signed URLs (e.g., AWS S3 pre-signed, Supabase Storage).
 *
 * The same function works for both encode AND decode (XOR is symmetric).
 *
 * @param {string} text - Plain URL or obfuscated string
 * @returns {string} - Hex-encoded obfuscated string (or decoded URL)
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

/**
 * Encode a download URL for safe storage in products.json
 * @param {string} url - Raw download URL
 * @returns {string} - Hex string safe to store
 */
function encodeDownloadUrl(url) {
  return Array.from(xorObfuscate(url))
    .map((c) => c.charCodeAt(0).toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Decode a stored hex download URL back to original
 * @param {string} hex - Hex string from products.json
 * @returns {string} - Original download URL
 */
function decodeDownloadUrl(hex) {
  const chars = hex.match(/.{1,2}/g).map((h) => String.fromCharCode(parseInt(h, 16)));
  return xorObfuscate(chars.join(""));
}

// ════════════════════════════════════════════════════════════
// SECTION 4: PAYPAL INTEGRATION HELPERS
// ════════════════════════════════════════════════════════════

/**
 * Dynamically inject PayPal SDK into the page <head>
 * Called once on storefront load.
 */
function loadPayPalSDK() {
  return new Promise((resolve, reject) => {
    if (document.getElementById("paypal-sdk")) return resolve(); // Already loaded

    const script = document.createElement("script");
    script.id = "paypal-sdk";
    script.src = ROYAL_CONFIG.paypal.sdkUrl;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load PayPal SDK"));
    document.head.appendChild(script);
  });
}

/**
 * Render a PayPal button for a specific product
 *
 * @param {string} containerId - DOM element ID to render into
 * @param {Object} product     - Product object from products.json
 * @param {Function} onSuccess - Callback(decodedDownloadUrl) after payment
 */
function renderPayPalButton(containerId, product, onSuccess) {
  paypal.Buttons({

    style: {
      layout: "vertical",
      color: "gold",
      shape: "rect",
      label: "pay",
      height: 40,
    },

    // Called when buyer clicks the button — create the order
    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [{
          amount: {
            value: product.price.toString(),
            currency_code: ROYAL_CONFIG.paypal.currency,
          },
          description: product.name,
        }],
        application_context: {
          brand_name: ROYAL_CONFIG.store.name,
          shipping_preference: product.type === "digital" ? "NO_SHIPPING" : "GET_FROM_FILE",
        },
      });
    },

    // Called when buyer approves the payment
    onApprove: async (data, actions) => {
      try {
        // Capture the funds
        const order = await actions.order.capture();

        if (order.status === "COMPLETED") {
          if (product.type === "digital") {
            // Decode the hidden download URL and reveal it immediately
            const downloadUrl = decodeDownloadUrl(product.downloadUrl);

            // Pass to the calling page's success handler
            onSuccess({
              product,
              downloadUrl,
              orderId: order.id,
              payer: order.payer,
            });
          } else {
            // Physical product → redirect to WhatsApp with order details
            const msg = encodeURIComponent(
              `✅ Order Confirmed!\nProduct: ${product.name}\nOrder ID: ${order.id}\nPlease confirm shipping details.`
            );
            window.open(`https://wa.me/${ROYAL_CONFIG.store.whatsapp}?text=${msg}`, "_blank");
            onSuccess({ product, orderId: order.id, payer: order.payer, isPhysical: true });
          }
        }
      } catch (err) {
        console.error("[RoyalNexus] Payment capture error:", err);
        alert("Payment failed. Please try again or contact support.");
      }
    },

    onError: (err) => {
      console.error("[RoyalNexus] PayPal button error:", err);
    },

  }).render(`#${containerId}`);
}

// ════════════════════════════════════════════════════════════
// SECTION 5: UTILITY HELPERS
// ════════════════════════════════════════════════════════════

/** Generate a unique product ID */
function generateId() {
  return "prod_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Format price with currency symbol */
function formatPrice(price, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(price);
}

/** Show a toast notification */
function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `royal-toast royal-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("royal-toast--visible"), 10);
  setTimeout(() => {
    toast.classList.remove("royal-toast--visible");
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

/** Tablet-safe timeout wrapper (replaces AbortController) */
function fetchWithTimeout(url, options, ms = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Request timed out")), ms);
    fetch(url, options)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}
