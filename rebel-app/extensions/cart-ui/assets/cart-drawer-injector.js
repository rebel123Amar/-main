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
    // Look for Dawn's cart drawer
    const cartDrawer = document.querySelector("cart-drawer") || document.getElementById("CartDrawer");
    if (!cartDrawer) return;

    // Check if already injected or if liquid snippet already rendered
    if (
      document.getElementById("rebel-injected-customization") ||
      document.getElementById("rebel-cart-custom-drawer")
    ) {
      return;
    }

    // Target location: prefer scrollable itemsForm (below products) or above .cart__ctas
    const itemsForm =
      cartDrawer.querySelector("#CartDrawer-Form") ||
      cartDrawer.querySelector("cart-drawer-items");
    const ctas =
      cartDrawer.querySelector(".cart__ctas") ||
      cartDrawer.querySelector(".drawer__footer");
    if (!itemsForm && !ctas) return;

    // Create the container element
    const container = document.createElement("div");
    container.id = "rebel-injected-customization";
    container.className = "rebel-cart-custom-drawer";
    container.innerHTML = `
      <style>
        .rebel-cart-custom-drawer {
          display: block;
          margin: 14px 0 16px 0;
          padding: 14px 14px 12px 14px;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
          font-family: inherit;
          color: #111827;
          box-sizing: border-box;
          transition: all 0.3s ease;
        }
        .rebel-cart-custom-drawer.rebel-highlight-pulse {
          animation: rebelDrawerPulse 2s ease;
          border-color: #000000;
          box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.12);
        }
        @keyframes rebelDrawerPulse {
          0% { transform: scale(1); border-color: #000000; }
          25% { transform: scale(1.02); border-color: #000000; box-shadow: 0 0 0 5px rgba(0, 0, 0, 0.2); }
          50% { transform: scale(1); border-color: #000000; }
          75% { transform: scale(1.01); border-color: #000000; }
          100% { transform: scale(1); border-color: #e5e7eb; }
        }
        .rebel-drawer-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
          padding-bottom: 10px;
          border-bottom: 1px solid #f3f4f6;
        }
        .rebel-drawer-header__icon {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 26px;
          height: 26px;
          background: #111827;
          color: #ffffff;
          border-radius: 6px;
          flex-shrink: 0;
        }
        .rebel-drawer-header__title {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: #111827;
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        .rebel-drawer-header__sub {
          margin: 2px 0 0 0;
          font-size: 11.5px;
          color: #6b7280;
        }
        .rebel-drawer-body {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        @media (min-width: 520px) {
          .rebel-drawer-body {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            align-items: stretch;
          }
          .rebel-drawer-field {
            display: flex;
            flex-direction: column;
            margin-bottom: 0;
          }
          .rebel-drawer-textarea {
            flex: 1;
            min-height: 75px;
            height: 100%;
          }
          .rebel-drawer-dropzone {
            flex: 1;
            min-height: 75px;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
          }
        }
        .rebel-drawer-field {
          margin-bottom: 12px;
        }
        .rebel-drawer-field:last-child {
          margin-bottom: 0;
        }
        .rebel-drawer-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 6px;
        }
        .rebel-drawer-label {
          font-size: 12.5px;
          font-weight: 600;
          color: #1f2937;
        }
        .rebel-drawer-optional {
          font-size: 11px;
          color: #9ca3af;
        }
        .rebel-drawer-textarea {
          display: block;
          width: 100%;
          min-height: 64px;
          padding: 9px 11px;
          font-family: inherit;
          font-size: 12.5px;
          line-height: 1.45;
          color: #111827;
          background: #fafafa;
          border: 1px solid #d1d5db;
          border-radius: 8px;
          resize: vertical;
          box-sizing: border-box;
          transition: border-color 0.2s, background-color 0.2s;
        }
        .rebel-drawer-textarea:focus {
          outline: none;
          background: #ffffff;
          border-color: #111827;
        }
        .rebel-drawer-textarea::placeholder {
          color: #9ca3af;
          font-size: 11.5px;
        }
        .rebel-drawer-textarea-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 4px;
          font-size: 11px;
        }
        .rebel-drawer-save-status {
          color: #059669;
          font-weight: 500;
          opacity: 0;
          transition: opacity 0.2s ease;
        }
        .rebel-drawer-save-status.visible {
          opacity: 1;
        }
        .rebel-drawer-char-count {
          color: #9ca3af;
          margin-left: auto;
        }
        .rebel-drawer-dropzone {
          position: relative;
          border: 1.5px dashed #d1d5db;
          border-radius: 8px;
          padding: 12px 10px;
          background: #fafafa;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .rebel-drawer-dropzone:hover,
        .rebel-drawer-dropzone.dragover {
          border-color: #111827;
          background: #f3f4f6;
        }
        .rebel-drawer-dropzone input[type="file"] {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        .rebel-drawer-dropzone-icon {
          display: inline-flex;
          color: #4b5563;
          margin-bottom: 4px;
        }
        .rebel-drawer-dropzone-text {
          font-size: 12px;
          color: #374151;
          line-height: 1.3;
        }
        .rebel-drawer-dropzone-text strong {
          color: #111827;
        }
        .rebel-drawer-dropzone-sub {
          display: block;
          font-size: 10.5px;
          color: #9ca3af;
          margin-top: 2px;
        }
        .rebel-drawer-error {
          display: none;
          align-items: center;
          justify-content: space-between;
          gap: 6px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #dc2626;
          padding: 6px 10px;
          border-radius: 6px;
          font-size: 11.5px;
          margin-top: 8px;
        }
        .rebel-drawer-error-close {
          background: none;
          border: none;
          color: #dc2626;
          cursor: pointer;
          font-weight: bold;
          padding: 0 4px;
        }
        .rebel-drawer-status {
          display: none;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11.5px;
          color: #4b5563;
          padding: 6px;
          margin-top: 6px;
        }
        .rebel-drawer-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #e5e7eb;
          border-top-color: #111827;
          border-radius: 50%;
          animation: rebelDrawerSpin 0.7s linear infinite;
        }
        @keyframes rebelDrawerSpin {
          to { transform: rotate(360deg); }
        }
        .rebel-drawer-previews-wrap {
          display: none;
          margin-top: 10px;
          padding-top: 8px;
          border-top: 1px solid #f3f4f6;
        }
        .rebel-drawer-previews-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 6px;
        }
        .rebel-drawer-previews-title {
          font-weight: 600;
          color: #1f2937;
        }
        .rebel-drawer-previews-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
        }
        .rebel-drawer-preview-item {
          position: relative;
          width: 54px;
          height: 54px;
          border-radius: 6px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
          background: #f9fafb;
        }
        .rebel-drawer-preview-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .rebel-drawer-preview-remove {
          position: absolute;
          top: 2px;
          right: 2px;
          width: 18px;
          height: 18px;
          background: rgba(0, 0, 0, 0.75);
          color: #ffffff;
          border: none;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          line-height: 1;
          cursor: pointer;
          padding: 0;
          transition: background-color 0.2s;
        }
        .rebel-drawer-preview-remove:hover {
          background: #dc2626;
        }
      </style>

      <div class="rebel-drawer-header">
        <span class="rebel-drawer-header__icon" aria-hidden="true">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </span>
        <div>
          <h3 class="rebel-drawer-header__title">Customize Your Order</h3>
          <p class="rebel-drawer-header__sub">Add personalization notes & reference photos</p>
        </div>
      </div>

      <div class="rebel-drawer-body">
        <!-- Special Instructions -->
        <div class="rebel-drawer-field">
          <div class="rebel-drawer-label-row">
            <label class="rebel-drawer-label" for="rebel-injected-instructions">Special Instructions</label>
            <span class="rebel-drawer-optional">(Optional)</span>
          </div>
          <textarea
            id="rebel-injected-instructions"
            class="rebel-drawer-textarea"
            placeholder="Add personalization details, gift notes, engraving requests, or specific instructions..."
            rows="2"
            maxlength="1000"
          ></textarea>
          <div class="rebel-drawer-textarea-meta">
            <span class="rebel-drawer-save-status" id="rebel-injected-save-status">Saved ✓</span>
            <span class="rebel-drawer-char-count"><span id="rebel-injected-char-num">0</span>/1000</span>
          </div>
        </div>

        <!-- Upload Reference Images -->
        <div class="rebel-drawer-field">
          <div class="rebel-drawer-label-row">
            <label class="rebel-drawer-label">Upload Reference Images <span style="color:#ef4444; font-weight:bold;">*</span></label>
            <span class="rebel-drawer-optional" id="rebel-injected-limit-hint" style="color: #ef4444; font-weight: 600; background: #fef2f2; border: 1px solid #fee2e2; padding: 1px 6px; border-radius: 10px;">Required · Max 5</span>
          </div>

          <div class="rebel-drawer-dropzone" id="rebel-injected-dropzone">
            <input
              type="file"
              id="rebel-injected-file-input"
              accept="image/jpeg,image/png,image/webp,image/jpg"
              multiple
              aria-label="Upload reference photos"
            />
            <div class="rebel-drawer-dropzone-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
            </div>
            <div class="rebel-drawer-dropzone-text" id="rebel-injected-dropzone-text">
              <strong>Click to upload</strong> or drag & drop images
              <span class="rebel-drawer-dropzone-sub">JPG, JPEG, PNG, or WEBP (Max 10MB each)</span>
            </div>
          </div>

          <!-- Error Banner -->
          <div class="rebel-drawer-error" id="rebel-injected-error" role="alert">
            <span id="rebel-injected-error-text">⚠️ Error</span>
            <button type="button" class="rebel-drawer-error-close" id="rebel-injected-error-close">✕</button>
          </div>

          <!-- Upload Status / Spinner -->
          <div class="rebel-drawer-status" id="rebel-injected-status">
            <span class="rebel-drawer-spinner"></span>
            <span id="rebel-injected-status-text">Uploading to Supabase cloud storage...</span>
          </div>

          <!-- Previews -->
          <div class="rebel-drawer-previews-wrap" id="rebel-injected-previews-wrap">
            <div class="rebel-drawer-previews-header">
              <span class="rebel-drawer-previews-title" id="rebel-injected-previews-title">Attached Images (0/5)</span>
              <span>Click ✕ to remove</span>
            </div>
            <div class="rebel-drawer-previews-grid" id="rebel-injected-previews-grid"></div>
          </div>
        </div>
      </div>
    `;

    // Insert into itemsForm (scrollable area with items) or before CTAs
    if (itemsForm) {
      itemsForm.appendChild(container);
    } else if (ctas) {
      if (ctas.classList.contains("cart__ctas")) {
        ctas.parentNode.insertBefore(container, ctas);
      } else {
        const actualCtas = ctas.querySelector(".cart__ctas");
        if (actualCtas) {
          ctas.insertBefore(container, actualCtas);
        } else {
          ctas.appendChild(container);
        }
      }
    }

    bindInjectedEvents(container);
  }

  function bindInjectedEvents(container) {
    const textarea = container.querySelector("#rebel-injected-instructions");
    const charNum = container.querySelector("#rebel-injected-char-num");
    const saveStatus = container.querySelector("#rebel-injected-save-status");
    const fileInput = container.querySelector("#rebel-injected-file-input");
    const dropzone = container.querySelector("#rebel-injected-dropzone");
    const dropzoneText = container.querySelector("#rebel-injected-dropzone-text");
    const errorBox = container.querySelector("#rebel-injected-error");
    const errorText = container.querySelector("#rebel-injected-error-text");
    const errorClose = container.querySelector("#rebel-injected-error-close");
    const statusBox = container.querySelector("#rebel-injected-status");
    const statusText = container.querySelector("#rebel-injected-status-text");
    const previewsWrap = container.querySelector("#rebel-injected-previews-wrap");
    const previewsGrid = container.querySelector("#rebel-injected-previews-grid");
    const previewsTitle = container.querySelector("#rebel-injected-previews-title");

    function showError(msg) {
      if (!errorBox || !errorText) return;
      errorText.textContent = "⚠️ " + msg;
      errorBox.style.display = "flex";
    }

    function clearError() {
      if (errorBox) errorBox.style.display = "none";
    }

    if (errorClose) errorClose.addEventListener("click", clearError);

    // Textarea handlers
    function updateChars() {
      if (charNum && textarea) {
        charNum.textContent = textarea.value.length;
        charNum.style.color = textarea.value.length > 950 ? "#dc2626" : "#9ca3af";
      }
    }

    textarea.addEventListener("input", function () {
      updateChars();
      try {
        sessionStorage.setItem("rebel_custom_special_request", textarea.value);
      } catch (_) {}
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        persistCartAttributes(false);
      }, 500);
    });

    textarea.addEventListener("blur", function () {
      persistCartAttributes(false);
    });

    // Dropzone handlers
    if (dropzone) {
      ["dragenter", "dragover"].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.add("dragover");
        });
      });

      ["dragleave", "drop"].forEach(function (evt) {
        dropzone.addEventListener(evt, function (e) {
          e.preventDefault();
          e.stopPropagation();
          dropzone.classList.remove("dragover");
        });
      });

      dropzone.addEventListener("drop", function (e) {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) uploadFiles(files);
      });
    }

    fileInput.addEventListener("change", function (e) {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) uploadFiles(files);
      e.target.value = "";
    });

    async function uploadFiles(files) {
      clearError();
      if (!files || files.length === 0) return;

      if (uploadedImages.length + files.length > MAX_FILES) {
        showError(`You can upload up to ${MAX_FILES} images. (${uploadedImages.length} already attached)`);
        return;
      }

      for (const file of files) {
        const ext = (file.name.substring(file.name.lastIndexOf(".")) || "").toLowerCase();
        const mime = (file.type || "").toLowerCase();
        if (!ALLOWED_MIME.includes(mime) && !ALLOWED_EXT.includes(ext)) {
          showError(`"${file.name}" is not supported. Use JPG, PNG, or WEBP.`);
          return;
        }
        const mb = file.size / (1024 * 1024);
        if (mb > MAX_SIZE_MB) {
          showError(`"${file.name}" is too large (${mb.toFixed(1)}MB). Max size is ${MAX_SIZE_MB}MB.`);
          return;
        }
      }

      if (statusBox && statusText) {
        statusText.textContent = `Uploading ${files.length} image${files.length > 1 ? "s" : ""} to storage...`;
        statusBox.style.display = "flex";
      }

      try {
        const formData = new FormData();
        formData.append("prefix", "uploads");
        files.forEach(function (f) {
          formData.append("files", f);
        });

        const appUrl = getAppUrl();
        const res = await fetch(`${appUrl}/api/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Upload failed. Please check app connection.");
        }

        if (Array.isArray(data.urls)) {
          data.urls.forEach(function (u) {
            if (!uploadedImages.includes(u)) uploadedImages.push(u);
          });
        }

        try {
          sessionStorage.setItem("rebel_custom_upload_urls", JSON.stringify(uploadedImages));
        } catch (_) {}

        renderPreviews();
        updateDropzoneUI();
        updateDrawerCheckoutGate();
        await persistCartAttributes(true);
      } catch (err) {
        console.error("[Rebel Upload]", err);
        showError(err.message || "Failed to upload image. Please try again.");
      } finally {
        if (statusBox) statusBox.style.display = "none";
      }
    }

    function renderPreviews() {
      if (!previewsGrid || !previewsWrap) return;
      previewsGrid.innerHTML = "";

      if (uploadedImages.length === 0) {
        previewsWrap.style.display = "none";
        return;
      }

      previewsWrap.style.display = "block";
      if (previewsTitle) {
        previewsTitle.textContent = `Attached Images (${uploadedImages.length}/${MAX_FILES})`;
      }

      uploadedImages.forEach(function (url, idx) {
        const item = document.createElement("div");
        item.className = "rebel-drawer-preview-item";

        const img = document.createElement("img");
        img.src = url;
        img.alt = `Uploaded image ${idx + 1}`;
        img.loading = "lazy";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "rebel-drawer-preview-remove";
        btn.textContent = "✕";
        btn.title = "Remove";

        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          uploadedImages = uploadedImages.filter(function (u) { return u !== url; });
          try {
            sessionStorage.setItem("rebel_custom_upload_urls", JSON.stringify(uploadedImages));
          } catch (_) {}
          renderPreviews();
          updateDropzoneUI();
          updateDrawerCheckoutGate();
          persistCartAttributes(true);
        });

        item.appendChild(img);
        item.appendChild(btn);
        previewsGrid.appendChild(item);
      });
    }

    function updateDropzoneUI() {
      if (!dropzoneText || !fileInput) return;
      if (uploadedImages.length >= MAX_FILES) {
        dropzoneText.innerHTML = `<strong>✓ Maximum ${MAX_FILES} images attached</strong><span class="rebel-drawer-dropzone-sub">Remove an image to upload a new one</span>`;
        fileInput.disabled = true;
        if (dropzone) dropzone.style.opacity = "0.7";
      } else {
        const countNotice = uploadedImages.length > 0 ? ` (${uploadedImages.length}/${MAX_FILES})` : "";
        dropzoneText.innerHTML = `<strong>Click to upload</strong> or drag & drop images${countNotice}<span class="rebel-drawer-dropzone-sub">JPG, JPEG, PNG, or WEBP (Max 10MB each)</span>`;
        fileInput.disabled = false;
        if (dropzone) dropzone.style.opacity = "1";
      }
    }

    async function persistCartAttributes(showFeedback) {
      const instructions = textarea ? textarea.value.trim() : "";
      const attributes = {
        "Special Instructions": instructions,
        "_rebel_special_request": instructions,
        "_rebel_upload_urls": JSON.stringify(uploadedImages),
        "Custom Images Count": String(uploadedImages.length),
      };

      for (let i = 1; i <= 5; i++) {
        attributes[`Custom Image ${i}`] = uploadedImages[i - 1] || "";
      }

      try {
        const res = await fetch("/cart/update.js", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ attributes: attributes, note: instructions }),
        });

        if (res.ok && showFeedback && saveStatus) {
          saveStatus.classList.add("visible");
          clearTimeout(saveFeedbackTimer);
          saveFeedbackTimer = setTimeout(function () {
            saveStatus.classList.remove("visible");
          }, 2000);
        }
      } catch (e) {
        console.warn("[Rebel] cart attribute update failed:", e);
      }
    }

    async function loadCartData() {
      try {
        const res = await fetch("/cart.js", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const cart = await res.json();
          const attrs = cart.attributes || {};

          const note = attrs["Special Instructions"] || attrs._rebel_special_request || cart.note || sessionStorage.getItem("rebel_custom_special_request") || "";
          if (textarea && note && !textarea.value) {
            textarea.value = note;
            updateChars();
          }

          let urls = [];
          if (attrs._rebel_upload_urls) {
            try { urls = JSON.parse(attrs._rebel_upload_urls); } catch (_) {}
          }
          if ((!urls || urls.length === 0) && sessionStorage.getItem("rebel_custom_upload_urls")) {
            try { urls = JSON.parse(sessionStorage.getItem("rebel_custom_upload_urls")); } catch (_) {}
          }

          if (Array.isArray(urls) && urls.length > 0) {
            uploadedImages = urls;
            renderPreviews();
            updateDropzoneUI();
          }
          updateDrawerCheckoutGate();
        }
      } catch (e) {
      } finally {
        updateDrawerCheckoutGate();
      }
    }

    // ─── Required Image Upload Drawer Checkout Gatekeeper ────────
    function updateDrawerCheckoutGate() {
      const hasImages = Array.isArray(uploadedImages) && uploadedImages.length > 0;
      const drawerCheckoutBtn =
        cartDrawer.querySelector("#CartDrawer-Checkout") ||
        cartDrawer.querySelector('button[name="checkout"]') ||
        document.querySelector("#CartDrawer-Checkout");

      let notice = cartDrawer.querySelector("#rebel-drawer-checkout-notice");

      if (!hasImages) {
        if (drawerCheckoutBtn) {
          drawerCheckoutBtn.setAttribute("aria-disabled", "true");
          drawerCheckoutBtn.classList.add("rebel-checkout-blocked");
          drawerCheckoutBtn.title = "Please upload at least 1 reference image to checkout";

          if (!notice) {
            notice = document.createElement("div");
            notice.id = "rebel-drawer-checkout-notice";
            notice.className = "rebel-drawer-checkout-notice";
            notice.style.cssText =
              "background:#fffbeb; border:1px solid #fde68a; color:#92400e; font-size:12px; font-weight:500; padding:8px 12px; border-radius:6px; margin:8px 0; text-align:center; display:flex; align-items:center; justify-content:center; gap:6px; transition:all 0.2s ease;";
            notice.innerHTML = `⚠️ <span><strong>Upload Required:</strong> Please upload reference photo to checkout</span>`;

            if (drawerCheckoutBtn.parentElement) {
              drawerCheckoutBtn.parentElement.insertBefore(notice, drawerCheckoutBtn);
            }
          } else {
            notice.style.display = "flex";
          }
        }
      } else {
        if (drawerCheckoutBtn) {
          drawerCheckoutBtn.removeAttribute("aria-disabled");
          drawerCheckoutBtn.classList.remove("rebel-checkout-blocked");
          drawerCheckoutBtn.title = "";
        }
        if (notice) {
          notice.style.display = "none";
        }
      }
    }

    function handleDrawerCheckoutAttempt(e) {
      const hasImages = Array.isArray(uploadedImages) && uploadedImages.length > 0;
      if (!hasImages) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (dropzone) {
          dropzone.classList.remove("rebel-shake-error");
          void dropzone.offsetWidth;
          dropzone.classList.add("rebel-shake-error");
          dropzone.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        showError("⚠️ Reference image is required! Please upload at least 1 image before checkout.");

        const notice = cartDrawer.querySelector("#rebel-drawer-checkout-notice");
        if (notice) {
          notice.style.background = "#fef2f2";
          notice.style.borderColor = "#f87171";
          notice.style.color = "#991b1b";
          setTimeout(function () {
            if (notice) {
              notice.style.background = "#fffbeb";
              notice.style.borderColor = "#fde68a";
              notice.style.color = "#92400e";
            }
          }, 2000);
        }

        return false;
      }
      return true;
    }

    const drawerCheckoutBtn =
      cartDrawer.querySelector("#CartDrawer-Checkout") ||
      cartDrawer.querySelector('button[name="checkout"]');
    if (drawerCheckoutBtn) {
      drawerCheckoutBtn.addEventListener("click", handleDrawerCheckoutAttempt, true);
    }
    const drawerForm =
      cartDrawer.querySelector("#CartDrawer-Form") ||
      cartDrawer.querySelector("form");
    if (drawerForm) {
      drawerForm.addEventListener("submit", handleDrawerCheckoutAttempt, true);
    }

    loadCartData();
    updateDrawerCheckoutGate();
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
})();
