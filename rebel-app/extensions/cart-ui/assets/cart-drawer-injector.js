/**
 * Rebel Custom App — Global Cart Drawer Injector
 * - Runs on all storefront pages via App Embed block
 * - Automatically detects Dawn's <cart-drawer> and injects the "Customize Your Order" section
 * - Handles Special Instructions & multi-image upload to Supabase Storage
 * - Persists state to Shopify Cart Attributes & sessionStorage
 * - Intercepts "Buy It Now" button so personalized orders are never bypassed
 */
(function () {
  "use strict";

  if (window.__REBEL_INJECTOR_INITIALIZED__) return;
  window.__REBEL_INJECTOR_INITIALIZED__ = true;

  const DEFAULT_APP_URL = "https://main-pink-phi.vercel.app";
  const MAX_FILES = 5;
  const MAX_SIZE_MB = 10;
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];

  let uploadedImages = [];
  let saveTimer = null;
  let saveFeedbackTimer = null;

  function getAppUrl() {
    let url = window.__REBEL_APP_URL__ || DEFAULT_APP_URL;
    url = (url || "").trim().replace(/\/$/, "");
    if (!url || url.includes("orders-taken-canberra-ten") || (window.location.protocol === "https:" && url.startsWith("http://"))) {
      url = DEFAULT_APP_URL;
    }
    return url;
  }

  function injectDrawerCustomization() {
    // Disabled: Customization and image uploads are handled exclusively on product pages
    const existing =
      document.getElementById("rebel-injected-customization") ||
      document.getElementById("rebel-cart-custom-drawer");
    if (existing) existing.remove();
  }

    // ─── Redirect Homepage / Collection Product Card "Add to Cart" to Product Page ───
  function setupProductCardRedirect() {
    function findProductUrl(element) {
      if (!element) return null;

      // 1. Look in closest card wrapper or item container
      const container = element.closest(
        ".card-wrapper, .card, .product-card, .product-item, .grid__item, .collection-product, [data-product-id], quick-add-modal, .quick-add, .product-form, .product-grid-item"
      );

      let productUrl = null;
      if (container) {
        const link = container.querySelector('a[href*="/products/"]');
        if (link && link.href) productUrl = link.href;
      }

      // 2. Look in surrounding form or parent container
      if (!productUrl) {
        const form = element.closest("form[action*='/cart/add']");
        if (form) {
          const parent = form.closest(".card, .card-wrapper, .grid__item, div");
          const link = parent?.querySelector('a[href*="/products/"]');
          if (link && link.href) productUrl = link.href;
        }
      }

      // 3. Look up ancestor chain for any link containing /products/
      if (!productUrl) {
        let el = element;
        while (el && el !== document.body) {
          if (el.tagName === "A" && el.href && el.href.includes("/products/")) {
            productUrl = el.href;
            break;
          }
          const innerLink = el.querySelector && el.querySelector('a[href*="/products/"]');
          if (innerLink && innerLink.href) {
            productUrl = innerLink.href;
            break;
          }
          el = el.parentElement;
        }
      }

      // If variant ID exists, preserve it in query
      if (productUrl) {
        const variantInput =
          (container && container.querySelector('input[name="id"]')) ||
          (element.form && element.form.querySelector('input[name="id"]')) ||
          element.closest("form")?.querySelector('input[name="id"]');
        if (variantInput && variantInput.value && !productUrl.includes("variant=")) {
          const sep = productUrl.includes("?") ? "&" : "?";
          productUrl += `${sep}variant=${variantInput.value}`;
        }
      }

      return productUrl;
    }

    function isMainProductCustomizerAction(target) {
      const customizer = document.querySelector(".rebel-product-customizer");
      if (!customizer) return false;

      // Inside customizer itself
      if (customizer.contains(target)) return true;

      // Inside main product section on a single product page
      const mainSection = customizer.closest(
        "product-info, .product, .product-section, .product-single, #MainProduct, main"
      );
      if (mainSection && mainSection.contains(target)) {
        return true;
      }

      const mainForm = document.querySelector(
        "product-info form[action*='/cart/add'], .product form[action*='/cart/add'], #product-form"
      );
      if (mainForm && mainForm.contains(target)) {
        return true;
      }

      return false;
    }

    function handleCardAction(e) {
      const target = e.target;
      if (!target) return;

      // Allow legitimate main product customizer submissions
      if (isMainProductCustomizerAction(target)) return;

      // Ignore buttons inside cart drawer or cart page
      if (target.closest("cart-drawer, #CartDrawer, .rebel-slide-drawer, #cart, .cart, .cart__items")) {
        return;
      }

      // Check if target is an Add to Cart, Quick Add, or Buy Now button
      const actionBtn = target.closest(
        'button[name="add"], .quick-add__submit, .card__add-to-cart, [data-action="add-to-cart"], .product-form__submit, form[action*="/cart/add"] button, form[action*="/cart/add"] [type="submit"], .shopify-payment-button__button, [data-testid="Checkout-button"]'
      );
      if (!actionBtn) return;

      const productUrl = findProductUrl(actionBtn);
      if (productUrl) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        actionBtn.disabled = true;
        actionBtn.innerHTML = "<span>Opening Product...</span>";
        window.location.href = productUrl;
        return false;
      }
    }

    function handleCardSubmit(e) {
      const form = e.target.closest("form[action*='/cart/add']");
      if (!form) return;

      if (isMainProductCustomizerAction(form)) return;
      if (form.closest("cart-drawer, #CartDrawer, .rebel-slide-drawer, #cart, .cart, .cart__items")) return;

      const productUrl = findProductUrl(form);
      if (productUrl) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const btn = form.querySelector('[type="submit"], button[name="add"]') || form;
        if (btn && btn !== form) {
          btn.disabled = true;
          btn.innerHTML = "<span>Opening Product...</span>";
        }
        window.location.href = productUrl;
        return false;
      }
    }

    document.addEventListener("click", handleCardAction, true);
    document.addEventListener("submit", handleCardSubmit, true);
  }

  let isFormattingDrawerLinks = false;
  function formatDrawerPropertyLinks() {
    if (isFormattingDrawerLinks) return;
    const drawer = document.querySelector("cart-drawer, #CartDrawer, .rebel-slide-drawer");
    if (!drawer) return;

    isFormattingDrawerLinks = true;
    try {
      const propertyValues = drawer.querySelectorAll(".product-option dd, .cart-item__details dd");
      propertyValues.forEach((dd) => {
        if (dd.dataset.rebelFormatted === "true") return;
        const text = dd.textContent.trim();
        const existingLink = dd.querySelector("a");

        if (existingLink) {
          const href = existingLink.getAttribute("href") || "";
          if (href.startsWith("http://") || href.startsWith("https://")) {
            if (existingLink.textContent !== "🔗") {
              existingLink.textContent = "🔗";
              existingLink.title = "View Image";
              existingLink.className = "link rebel-property-link";
              existingLink.style.color = "#2563eb";
              existingLink.style.textDecoration = "underline";
              existingLink.style.fontSize = "13px";
            }
            dd.dataset.rebelFormatted = "true";
          }
        } else if (text.startsWith("http://") || text.startsWith("https://")) {
          dd.innerHTML = `<a href="${text}" target="_blank" class="link rebel-property-link" title="View Image" style="color: #2563eb; text-decoration: underline; font-size: 13px;">🔗</a>`;
          dd.dataset.rebelFormatted = "true";
        } else if (text === "🔗") {
          const dt = dd.previousElementSibling || dd.closest(".product-option")?.querySelector("dt");
          const propName = dt ? dt.textContent.replace(/:$/, "").trim() : "";
          const hiddenKey = "_" + propName;
          let targetUrl = window._rebelLastUploadedProperties?.[hiddenKey] || "";
          if (!targetUrl && window._rebelCartData?.items) {
            for (const it of window._rebelCartData.items) {
              if (it.properties && it.properties[hiddenKey]) {
                targetUrl = it.properties[hiddenKey];
                break;
              }
            }
          }
          if (targetUrl && (targetUrl.startsWith("http://") || targetUrl.startsWith("https://"))) {
            dd.innerHTML = `<a href="${targetUrl}" target="_blank" class="link rebel-property-link" title="View Image" style="color: #2563eb; text-decoration: underline; font-size: 13px;">🔗</a>`;
            dd.dataset.rebelFormatted = "true";
          } else if (!window._rebelFetchingCart) {
            window._rebelFetchingCart = true;
            fetch((window.Shopify?.routes?.root || "/") + "cart.js")
              .then((r) => r.json())
              .then((c) => {
                window._rebelCartData = c;
                window._rebelFetchingCart = false;
                formatDrawerPropertyLinks();
              })
              .catch(() => {
                window._rebelFetchingCart = false;
              });
          }
        }
      });
    } finally {
      setTimeout(function () {
        isFormattingDrawerLinks = false;
      }, 100);
    }
  }

  function init() {
    injectDrawerCustomization();
    setupProductCardRedirect();
    formatDrawerPropertyLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  // Handle Dawn AJAX cart drawer updates
  ["cart:updated", "cart-drawer:updated", "cart:refresh", "cart-drawer:open"].forEach(function (evt) {
    document.addEventListener(evt, function () {
      setTimeout(injectDrawerCustomization, 80);
      setTimeout(formatDrawerPropertyLinks, 100);
      setTimeout(formatDrawerPropertyLinks, 400);
    });
  });

  // Observe DOM ONLY for Cart Drawer appearing dynamically (no infinite loop)
  const observer = new MutationObserver(function (mutations) {
    let hasCartDrawerAdded = false;
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (
          node.nodeType === 1 &&
          (node.tagName === "CART-DRAWER" ||
            node.id === "CartDrawer" ||
            (node.querySelector && node.querySelector("cart-drawer, #CartDrawer")))
        ) {
          hasCartDrawerAdded = true;
          break;
        }
      }
      if (hasCartDrawerAdded) break;
    }

    if (hasCartDrawerAdded && !document.getElementById("rebel-injected-customization")) {
      injectDrawerCustomization();
      setTimeout(formatDrawerPropertyLinks, 150);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ─── Post-Delivery Order Review Modal (Triggered via WhatsApp / Direct Link) ───
  function setupPostDeliveryReviewModal() {
    const urlParams = new URLSearchParams(window.location.search);
    const orderId = urlParams.get("review_order") || urlParams.get("order_review");
    if (!orderId) return;

    if (document.getElementById("rebel-post-delivery-modal")) return;

    // Inject styles
    const styleEl = document.createElement("style");
    styleEl.textContent = `
      .rebel-rev-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        z-index: 99999999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        box-sizing: border-box;
      }
      .rebel-rev-modal-card {
        background: #ffffff;
        border-radius: 16px;
        width: 100%;
        max-width: 520px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 24px;
        box-shadow: 0 20px 40px rgba(0,0,0,0.2);
        box-sizing: border-box;
        position: relative;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #111827;
      }
      .rebel-rev-close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        background: #f3f4f6;
        border: none;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        font-size: 16px;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #4b5563;
      }
      .rebel-rev-close-btn:hover { background: #e5e7eb; color: #111; }
      .rebel-rev-stars { display: flex; gap: 6px; margin: 8px 0 16px; }
      .rebel-rev-star {
        background: none; border: none; font-size: 32px; color: #d1d5db; cursor: pointer; padding: 0;
        transition: transform 0.15s, color 0.15s;
      }
      .rebel-rev-star.active, .rebel-rev-star.hover { color: #f59e0b; }
      .rebel-rev-star:hover { transform: scale(1.15); }
      .rebel-rev-input, .rebel-rev-textarea {
        width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1.5px solid #d1d5db;
        border-radius: 8px; font-size: 14px; margin-bottom: 12px; outline: none;
      }
      .rebel-rev-input:focus, .rebel-rev-textarea:focus {
        border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1);
      }
      .rebel-rev-upload {
        border: 1.5px dashed #cbd5e1; border-radius: 8px; padding: 12px; text-align: center;
        background: #f8fafc; cursor: pointer; margin-bottom: 12px; position: relative;
      }
      .rebel-rev-upload input[type="file"] {
        position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; height: 100%;
      }
      .rebel-rev-previews { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
      .rebel-rev-thumb {
        width: 60px; height: 60px; border-radius: 6px; overflow: hidden; position: relative;
        border: 1px solid #cbd5e1;
      }
      .rebel-rev-thumb img { width: 100%; height: 100%; object-fit: cover; }
      .rebel-rev-thumb-del {
        position: absolute; top: 2px; right: 2px; background: rgba(0,0,0,0.7); color: #fff;
        border: none; width: 16px; height: 16px; border-radius: 50%; font-size: 10px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
      }
      .rebel-rev-submit {
        width: 100%; background: #111827; color: #fff; border: none; padding: 12px;
        border-radius: 8px; font-weight: 600; font-size: 15px; cursor: pointer;
      }
      .rebel-rev-submit:hover:not(:disabled) { background: #000; }
    `;
    document.head.appendChild(styleEl);

    // Create modal element
    const modalEl = document.createElement("div");
    modalEl.id = "rebel-post-delivery-modal";
    modalEl.className = "rebel-rev-modal-overlay";
    modalEl.innerHTML = `
      <div class="rebel-rev-modal-card">
        <button type="button" class="rebel-rev-close-btn" id="rebel-rev-close">✕</button>
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:28px;">🎁</span>
          <div>
            <h3 style="margin:0; font-size:18px; font-weight:700;">Rate Your Delivered Order</h3>
            <p style="margin:2px 0 0; font-size:13px; color:#6b7280;">Order #${orderId} — Rebel Gifts & Mosambi</p>
          </div>
        </div>

        <label style="display:block; font-size:12px; font-weight:600; text-transform:uppercase; color:#374151; margin-bottom:4px;">
          Your Star Rating *
        </label>
        <div class="rebel-rev-stars" id="rebel-rev-star-row">
          <button type="button" class="rebel-rev-star" data-val="1">★</button>
          <button type="button" class="rebel-rev-star" data-val="2">★</button>
          <button type="button" class="rebel-rev-star" data-val="3">★</button>
          <button type="button" class="rebel-rev-star" data-val="4">★</button>
          <button type="button" class="rebel-rev-star" data-val="5">★</button>
        </div>

        <label style="display:block; font-size:12px; font-weight:600; text-transform:uppercase; color:#374151; margin-bottom:4px;">
          Your Name *
        </label>
        <input type="text" class="rebel-rev-input" id="rebel-rev-name" placeholder="e.g. Rahul Sharma" />

        <label style="display:block; font-size:12px; font-weight:600; text-transform:uppercase; color:#374151; margin-bottom:4px;">
          Your Email *
        </label>
        <input type="email" class="rebel-rev-input" id="rebel-rev-email" placeholder="e.g. rahul@example.com" />

        <label style="display:block; font-size:12px; font-weight:600; text-transform:uppercase; color:#374151; margin-bottom:4px;">
          Review & Feedback *
        </label>
        <textarea class="rebel-rev-textarea" id="rebel-rev-body" rows="3" placeholder="Tell us about the gift quality, packaging, and delivery experience..."></textarea>

        <label style="display:block; font-size:12px; font-weight:600; text-transform:uppercase; color:#374151; margin-bottom:4px;">
          Upload Photos / Unboxing (Optional)
        </label>
        <div class="rebel-rev-upload">
          <input type="file" id="rebel-rev-files" accept="image/jpeg,image/png,image/webp,image/jpg" multiple />
          <span style="font-size:13px; color:#4b5563;">📸 Tap to add photos from your phone or gallery</span>
        </div>
        <div id="rebel-rev-upload-status" style="display:none; font-size:12px; color:#2563eb; margin-bottom:8px;">⏳ Uploading photos... please wait</div>
        <div class="rebel-rev-previews" id="rebel-rev-previews"></div>

        <button type="button" class="rebel-rev-submit" id="rebel-rev-submit-btn">Submit Review</button>
        <div id="rebel-rev-success" style="display:none; margin-top:12px; padding:12px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:14px; text-align:center; font-weight:600;">
          🎉 Thank you! Your review has been submitted successfully!
        </div>
      </div>
    `;

    document.body.appendChild(modalEl);

    // Close handlers
    const closeBtn = document.getElementById("rebel-rev-close");
    closeBtn?.addEventListener("click", () => modalEl.remove());
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) modalEl.remove();
    });

    let rating = 0;
    const starBtns = modalEl.querySelectorAll(".rebel-rev-star");
    starBtns.forEach((b) => {
      const v = parseInt(b.dataset.val);
      b.addEventListener("mouseenter", () => {
        starBtns.forEach((s) => s.classList.toggle("hover", parseInt(s.dataset.val) <= v));
      });
      b.addEventListener("mouseleave", () => {
        starBtns.forEach((s) => s.classList.remove("hover"));
      });
      b.addEventListener("click", () => {
        rating = v;
        starBtns.forEach((s) => s.classList.toggle("active", parseInt(s.dataset.val) <= v));
      });
    });

    let uploadedMedia = [];
    const fileInput = document.getElementById("rebel-rev-files");
    const previewsWrap = document.getElementById("rebel-rev-previews");
    const uploadStatus = document.getElementById("rebel-rev-upload-status");

    fileInput?.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      if (!files.length) return;
      uploadStatus.style.display = "block";
      const formData = new FormData();
      files.slice(0, 5).forEach((f) => formData.append("files", f));

      try {
        const res = await fetch(`${getAppUrl()}/api/upload`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.urls)) {
          data.urls.forEach((url) => {
            uploadedMedia.push(url);
            const thumb = document.createElement("div");
            thumb.className = "rebel-rev-thumb";
            thumb.innerHTML = `
              <img src="${url}" />
              <button type="button" class="rebel-rev-thumb-del">✕</button>
            `;
            thumb.querySelector(".rebel-rev-thumb-del").addEventListener("click", () => {
              uploadedMedia = uploadedMedia.filter((u) => u !== url);
              thumb.remove();
            });
            previewsWrap.appendChild(thumb);
          });
        }
      } catch (err) {
        console.error(err);
      } finally {
        uploadStatus.style.display = "none";
        e.target.value = "";
      }
    });

    const submitBtn = document.getElementById("rebel-rev-submit-btn");
    submitBtn?.addEventListener("click", async () => {
      if (!rating) { alert("Please choose a star rating (1-5 stars)"); return; }
      const name = document.getElementById("rebel-rev-name").value.trim();
      const email = document.getElementById("rebel-rev-email").value.trim();
      const bodyText = document.getElementById("rebel-rev-body").value.trim();
      if (!name) { alert("Please enter your name"); return; }
      if (!email || !email.includes("@")) { alert("Please enter a valid email"); return; }
      if (!bodyText) { alert("Please enter your review"); return; }

      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting Review...";

      try {
        const res = await fetch(`${getAppUrl()}/api/reviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop: window.location.hostname,
            productId: "order-" + orderId,
            authorName: name,
            authorEmail: email,
            rating,
            title: "Verified Order #" + orderId,
            reviewBody: bodyText,
            mediaUrls: uploadedMedia,
            orderId,
            orderName: "#" + orderId,
          }),
        });
        const d = await res.json();
        if (d.success) {
          submitBtn.style.display = "none";
          document.getElementById("rebel-rev-success").style.display = "block";
          setTimeout(() => modalEl.remove(), 3500);
        } else {
          alert(d.error || "Submission failed");
          submitBtn.disabled = false;
          submitBtn.textContent = "Submit Review";
        }
      } catch (err) {
        alert("Network error, please try again");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Review";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupPostDeliveryReviewModal);
  } else {
    setupPostDeliveryReviewModal();
  }
})();
