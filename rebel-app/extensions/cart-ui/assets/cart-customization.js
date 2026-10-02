/**
 * Rebel Cart Customization — Storefront JavaScript
 * Features:
 * - Special Instructions auto-save to Cart Attributes & Note
 * - Multi-image upload (JPG, JPEG, PNG, WEBP)
 * - File size and format client-side validation with helpful error messages
 * - Image previews with removal
 * - Cart change & page refresh persistence (Shopify AJAX API + sessionStorage)
 * - Dawn theme AJAX cart listener & MutationObserver
 */
(function () {
  "use strict";

  // Prevent duplicate execution
  if (window.__REBEL_CART_INITIALIZED__) {
    if (typeof window.__REBEL_INIT_BLOCK__ === "function") {
      window.__REBEL_INIT_BLOCK__();
    }
    return;
  }
  window.__REBEL_CART_INITIALIZED__ = true;

  const STORAGE_KEY_TEXT = "rebel_custom_special_request";
  const STORAGE_KEY_URLS = "rebel_custom_upload_urls";
  const ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
  ];
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

  let uploadedUrls = [];
  let debounceSaveTimer = null;
  let statusFadeTimer = null;

  function optimizeCartPageLayout(block) {
    if (!block) return;
    const cartFooter = document.querySelector(".cart__footer");
    if (cartFooter && block.parentElement && block.parentElement.classList.contains("cart__blocks")) {
      const cartItems = document.querySelector("cart-items") || document.querySelector(".cart__items") || document.getElementById("main-cart-items");
      if (cartItems && cartItems.parentNode) {
        cartItems.parentNode.insertBefore(block, cartFooter);
      } else if (cartFooter.parentNode) {
        cartFooter.parentNode.insertBefore(block, cartFooter);
      }
    }
  }

  function initCustomizationBlock() {
    const block = document.getElementById("rebel-cart-customization");
    if (!block) return;

    // Reposition block on cart page if trapped inside narrow cart__blocks
    optimizeCartPageLayout(block);

    // Config from block data attributes
    const MAX_FILES = parseInt(block.dataset.maxFiles || "5", 10);
    const MAX_SIZE_MB = parseInt(block.dataset.maxSizeMb || "10", 10);
    let appUrl = (block.dataset.appUrl || "").trim().replace(/\/$/, "");

    // Fallback if appUrl is placeholder, outdated tunnel, empty, or insecure HTTP on HTTPS page
    if (
      !appUrl ||
      appUrl.includes("your-app-url.com") ||
      appUrl.includes("trycloudflare") ||
      (window.location.protocol === "https:" && appUrl.startsWith("http://"))
    ) {
      appUrl =
        window.__REBEL_APP_URL__ ||
        "https://main-pink-phi.vercel.app";
    }

    const textarea = document.getElementById("rebel-special-request");
    const charCount = document.getElementById("rebel-char-count");
    const saveStatus = document.getElementById("rebel-save-status");
    const fileInput = document.getElementById("rebel-file-input");
    const dropArea = document.getElementById("rebel-upload-drop");
    const errorBox = document.getElementById("rebel-error-box");
    const errorText = document.getElementById("rebel-error-text");
    const errorClose = document.getElementById("rebel-error-close");
    const uploadStatus = document.getElementById("rebel-upload-status");
    const uploadStatusText = document.getElementById("rebel-upload-status-text");
    const previewsWrap = document.getElementById("rebel-previews-wrap");
    const previewsContainer = document.getElementById("rebel-previews");
    const previewsCount = document.getElementById("rebel-previews-count");
    const placeholder = document.getElementById("rebel-upload-placeholder");

    // ─── Error Handling ──────────────────────────────────────────
    function showError(msg) {
      if (!errorBox || !errorText) return;
      errorText.textContent = msg;
      errorBox.style.display = "flex";
    }

    function clearError() {
      if (!errorBox) return;
      errorBox.style.display = "none";
      if (errorText) errorText.textContent = "";
    }

    if (errorClose) {
      errorClose.addEventListener("click", clearError);
    }

    // ─── Textarea Character Count & Autosave ─────────────────────
    if (textarea) {
      // Update character count
      const updateCount = () => {
        const len = textarea.value.length;
        if (charCount) {
          charCount.textContent = len;
          charCount.style.color = len > 950 ? "#dc2626" : "#9ca3af";
        }
      };

      textarea.addEventListener("input", () => {
        updateCount();
        try {
          sessionStorage.setItem(STORAGE_KEY_TEXT, textarea.value);
        } catch (_) {}

        clearTimeout(debounceSaveTimer);
        debounceSaveTimer = setTimeout(() => {
          saveToCart(false);
        }, 600);
      });

      textarea.addEventListener("blur", () => {
        saveToCart(false);
      });

      updateCount();
    }

    // ─── Drag & Drop ─────────────────────────────────────────────
    if (dropArea) {
      ["dragenter", "dragover"].forEach((evtName) => {
        dropArea.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.add("drag-over");
        });
      });

      ["dragleave", "dragend", "drop"].forEach((evtName) => {
        dropArea.addEventListener(evtName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          dropArea.classList.remove("drag-over");
        });
      });

      dropArea.addEventListener("drop", (e) => {
        const files = Array.from(e.dataTransfer?.files || []);
        if (files.length > 0) {
          handleSelectedFiles(files);
        }
      });
    }

    // ─── File Input Change ───────────────────────────────────────
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
          handleSelectedFiles(files);
        }
        e.target.value = ""; // Reset to allow re-upload of same file
      });
    }

    // ─── Validate & Upload Files ─────────────────────────────────
    async function handleSelectedFiles(files) {
      clearError();

      if (!files || files.length === 0) return;

      // 1. Max count check
      if (uploadedUrls.length + files.length > MAX_FILES) {
        showError(
          `You can upload a maximum of ${MAX_FILES} images. You currently have ${uploadedUrls.length} attached.`
        );
        return;
      }

      // 2. Validate format and size for each file
      for (const file of files) {
        const fileExt = (file.name.substring(file.name.lastIndexOf(".")) || "").toLowerCase();
        const mimeType = (file.type || "").toLowerCase();

        const isAllowedMime = ALLOWED_MIME_TYPES.includes(mimeType);
        const isAllowedExt = ALLOWED_EXTENSIONS.includes(fileExt);

        if (!isAllowedMime && !isAllowedExt) {
          showError(
            `"${file.name}" is not a supported format. Please upload JPG, JPEG, PNG, or WEBP images.`
          );
          return;
        }

        const sizeInMb = file.size / (1024 * 1024);
        if (sizeInMb > MAX_SIZE_MB) {
          showError(
            `"${file.name}" is too large (${sizeInMb.toFixed(1)} MB). Maximum allowed file size is ${MAX_SIZE_MB} MB.`
          );
          return;
        }
      }

      // 3. Perform upload
      showUploadStatus(`Uploading ${files.length} image${files.length > 1 ? "s" : ""}...`);

      try {
        const formData = new FormData();
        formData.append("prefix", "uploads");
        files.forEach((file) => formData.append("files", file));

        const res = await fetch(`${appUrl}/api/upload`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Image upload failed. Please try again.");
        }

        if (Array.isArray(data.urls)) {
          data.urls.forEach((url) => {
            if (!uploadedUrls.includes(url)) {
              uploadedUrls.push(url);
            }
          });
        }

        renderPreviews();
        updateUploadBoxState();
        updateCheckoutGate();
        try {
          sessionStorage.setItem(STORAGE_KEY_URLS, JSON.stringify(uploadedUrls));
        } catch (_) {}

        await saveToCart(true);
      } catch (err) {
        console.error("[Rebel Upload Error]", err);
        showError(err.message || "Failed to upload image. Please try again.");
      } finally {
        hideUploadStatus();
      }
    }

    // ─── Render Previews ─────────────────────────────────────────
    function renderPreviews() {
      if (!previewsContainer || !previewsWrap) return;

      previewsContainer.innerHTML = "";

      if (uploadedUrls.length === 0) {
        previewsWrap.style.display = "none";
        return;
      }

      previewsWrap.style.display = "block";
      if (previewsCount) {
        previewsCount.textContent = `Attached Images (${uploadedUrls.length}/${MAX_FILES})`;
      }

      uploadedUrls.forEach((url, idx) => {
        const item = document.createElement("div");
        item.className = "rebel-cart-custom__preview-item";

        const img = document.createElement("img");
        img.src = url;
        img.alt = `Uploaded image ${idx + 1}`;
        img.loading = "lazy";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "rebel-cart-custom__preview-remove";
        removeBtn.innerHTML = "✕";
        removeBtn.title = "Remove this image";
        removeBtn.setAttribute("aria-label", `Remove image ${idx + 1}`);

        removeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          removeImage(url, item);
        });

        item.appendChild(img);
        item.appendChild(removeBtn);
        previewsContainer.appendChild(item);
      });
    }

    // ─── Remove Image ────────────────────────────────────────────
    async function removeImage(url, itemEl) {
      uploadedUrls = uploadedUrls.filter((u) => u !== url);
      try {
        sessionStorage.setItem(STORAGE_KEY_URLS, JSON.stringify(uploadedUrls));
      } catch (_) {}

      if (itemEl) {
        itemEl.style.opacity = "0";
        itemEl.style.transform = "scale(0.8)";
        itemEl.style.transition = "all 0.2s ease";
        setTimeout(() => {
          itemEl.remove();
          renderPreviews();
          updateUploadBoxState();
          updateCheckoutGate();
        }, 200);
      } else {
        renderPreviews();
        updateUploadBoxState();
        updateCheckoutGate();
      }

      await saveToCart(true);
    }

    // ─── Upload Area State (disabled if max reached) ─────────────
    function updateUploadBoxState() {
      if (!placeholder || !fileInput) return;
      const mainText = placeholder.querySelector(".rebel-cart-custom__upload-main");
      if (!mainText) return;

      if (uploadedUrls.length >= MAX_FILES) {
        mainText.innerHTML = `✓ Maximum ${MAX_FILES} images attached`;
        fileInput.disabled = true;
        if (dropArea) dropArea.style.opacity = "0.7";
      } else {
        const countNotice = uploadedUrls.length > 0 ? ` (${uploadedUrls.length}/${MAX_FILES})` : "";
        mainText.innerHTML = `<strong>Click to upload</strong> or drag & drop images${countNotice}`;
        fileInput.disabled = false;
        if (dropArea) dropArea.style.opacity = "1";
      }
    }

    // ─── Save State to Shopify Cart Attributes & Note ─────────────
    async function saveToCart(showIndicator) {
      const specialText = textarea ? textarea.value.trim() : "";

      const attributes = {
        _rebel_special_request: specialText,
        _rebel_upload_urls: JSON.stringify(uploadedUrls),
        "Special Instructions": specialText,
        "Custom Images Count": String(uploadedUrls.length),
      };

      // Set individual custom image URLs for direct view in Shopify Admin sidebar
      for (let i = 1; i <= 5; i++) {
        attributes[`Custom Image ${i}`] = uploadedUrls[i - 1] || "";
      }

      const bodyData = {
        attributes,
        note: specialText,
      };

      try {
        const res = await fetch("/cart/update.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(bodyData),
        });

        if (res.ok && showIndicator && saveStatus) {
          showSaveIndicator();
        }
      } catch (err) {
        console.warn("[Rebel] Failed to update cart attributes:", err);
      }
    }

    function showSaveIndicator() {
      if (!saveStatus) return;
      saveStatus.classList.add("visible");
      clearTimeout(statusFadeTimer);
      statusFadeTimer = setTimeout(() => {
        saveStatus.classList.remove("visible");
      }, 2000);
    }

    function showUploadStatus(msg) {
      if (uploadStatus && uploadStatusText) {
        uploadStatusText.textContent = msg;
        uploadStatus.style.display = "flex";
      }
    }

    function hideUploadStatus() {
      if (uploadStatus) {
        uploadStatus.style.display = "none";
      }
    }

    // ─── Restore State from Cart & sessionStorage ────────────────
    async function restoreState() {
      try {
        const res = await fetch("/cart.js", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const cart = await res.json();
          const attrs = cart.attributes || {};

          // Restore special instructions
          const text =
            attrs["Special Instructions"] ||
            attrs._rebel_special_request ||
            cart.note ||
            sessionStorage.getItem(STORAGE_KEY_TEXT) ||
            "";

          if (textarea && text && !textarea.value) {
            textarea.value = text;
            if (charCount) charCount.textContent = text.length;
          }

          // Restore image URLs
          let urls = [];
          if (attrs._rebel_upload_urls) {
            try {
              urls = JSON.parse(attrs._rebel_upload_urls);
            } catch (_) {}
          }

          if ((!urls || urls.length === 0) && sessionStorage.getItem(STORAGE_KEY_URLS)) {
            try {
              urls = JSON.parse(sessionStorage.getItem(STORAGE_KEY_URLS));
            } catch (_) {}
          }

          if (Array.isArray(urls) && urls.length > 0) {
            uploadedUrls = urls;
            renderPreviews();
            updateUploadBoxState();
          }
          updateCheckoutGate();
        }
      } catch (err) {
        console.warn("[Rebel] Could not restore cart state:", err);
      } finally {
        updateCheckoutGate();
      }
    }

    // ─── Required Image Upload Checkout Gatekeeper ───────────────
    function updateCheckoutGate() {
      const hasImages = Array.isArray(uploadedUrls) && uploadedUrls.length > 0;
      const checkoutButtons = document.querySelectorAll(
        'button[name="checkout"], #checkout, .cart__checkout-button, [type="submit"][name="checkout"], input[name="checkout"]'
      );

      let notice = document.getElementById("rebel-checkout-notice");

      if (!hasImages) {
        // Block checkout
        checkoutButtons.forEach((btn) => {
          btn.setAttribute("aria-disabled", "true");
          btn.classList.add("rebel-checkout-blocked");
          btn.title = "Please upload at least 1 reference image before checkout";
        });

        // Insert warning notice above checkout buttons if not already present
        if (!notice) {
          notice = document.createElement("div");
          notice.id = "rebel-checkout-notice";
          notice.className = "rebel-checkout-notice";
          notice.innerHTML = `⚠️ <span><strong>Upload Required:</strong> Please upload at least 1 reference image before proceeding to checkout.</span>`;

          const primaryBtn = document.querySelector('button[name="checkout"], #checkout, .cart__checkout-button');
          if (primaryBtn && primaryBtn.parentElement) {
            primaryBtn.parentElement.insertBefore(notice, primaryBtn);
          }
        } else {
          notice.style.display = "flex";
        }
      } else {
        // Unblock checkout
        checkoutButtons.forEach((btn) => {
          btn.removeAttribute("aria-disabled");
          btn.classList.remove("rebel-checkout-blocked");
          btn.title = "";
        });

        if (notice) {
          notice.style.display = "none";
        }
      }
    }

    function handleCheckoutAttempt(e) {
      const hasImages = Array.isArray(uploadedUrls) && uploadedUrls.length > 0;
      if (!hasImages) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Highlight upload area with shake animation
        if (dropArea) {
          dropArea.classList.remove("rebel-shake-error");
          void dropArea.offsetWidth;
          dropArea.classList.add("rebel-shake-error");
          dropArea.scrollIntoView({ behavior: "smooth", block: "center" });
        }

        showError("⚠️ Reference image is required! Please upload at least 1 image before proceeding to checkout.");

        // Pulse warning notice
        const notice = document.getElementById("rebel-checkout-notice");
        if (notice) {
          notice.style.display = "flex";
          notice.classList.remove("rebel-notice-alert");
          void notice.offsetWidth;
          notice.classList.add("rebel-notice-alert");
        }

        return false;
      }
      return true;
    }

    // Attach global click & submit capture listeners once
    if (!window.__REBEL_CHECKOUT_GATE_ATTACHED__) {
      window.__REBEL_CHECKOUT_GATE_ATTACHED__ = true;

      document.addEventListener(
        "click",
        (e) => {
          const target = e.target.closest(
            'button[name="checkout"], #checkout, .cart__checkout-button, [type="submit"][name="checkout"], input[name="checkout"], .additional-checkout-buttons button'
          );
          if (target) {
            handleCheckoutAttempt(e);
          }
        },
        true
      );

      document.addEventListener(
        "submit",
        (e) => {
          const form = e.target;
          if (
            form &&
            (form.id === "cart" ||
              form.action?.includes("/cart") ||
              form.querySelector('button[name="checkout"]'))
          ) {
            handleCheckoutAttempt(e);
          }
        },
        true
      );
    }

    restoreState();
    updateCheckoutGate();
  }

  window.__REBEL_INIT_BLOCK__ = initCustomizationBlock;

  // Initialize on DOM load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCustomizationBlock);
  } else {
    initCustomizationBlock();
  }

  // Listen to Dawn AJAX cart updates
  ["cart:updated", "cart-drawer:updated", "cart:refresh"].forEach((evt) => {
    document.addEventListener(evt, () => {
      setTimeout(initCustomizationBlock, 100);
    });
  });

  // Observe DOM in case Dawn replaces sections via Section Rendering API
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) {
          if (
            node.id === "rebel-cart-customization" ||
            node.querySelector && node.querySelector("#rebel-cart-customization")
          ) {
            initCustomizationBlock();
            return;
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
