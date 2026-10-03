/**
 * Rebel Custom App — Product Page Customizer
 * Replicates the Mosambi Media "POP UP FRAME" flow:
 * - "Enter Text" field
 * - "Select (4-6) Images" (Collage background)
 * - "Select 1 Pop-Out Image" (Single foreground popout)
 * - Strict validation before Add to Cart ("bina image dale add to cart nahi hoga")
 * - Direct upload to Supabase Storage via /api/upload
 * - Attaches line item properties with image URLs
 * - Renders clickable 🔗 links in Cart Drawer
 */
(function () {
  "use strict";

  if (window.__REBEL_PRODUCT_CUSTOMIZER_INIT__) return;
  window.__REBEL_PRODUCT_CUSTOMIZER_INIT__ = true;

  const DEFAULT_APP_URL = "https://main-pink-phi.vercel.app";
  const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
  const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp"];
  const MAX_SIZE_MB = 10;

  function getBackendUrl() {
    let url = window.__REBEL_APP_URL__ || DEFAULT_APP_URL;
    const container = document.querySelector(".rebel-product-customizer");
    if (container && container.dataset.appUrl) {
      url = container.dataset.appUrl;
    }
    return (url || "").trim().replace(/\/$/, "");
  }

  // State
  let collageImages = []; // [{ id, file, url, preview, uploading }]
  let popoutImage = null; // { id, file, url, preview, uploading }
  let isSubmitting = false;

  function init() {
    const container = document.querySelector(".rebel-product-customizer");
    if (!container) return;

    setupVariantWatchers(container);
    setupCollageDropzone(container);
    setupPopoutDropzone(container);
    setupActionInterception(container);
    setupCartDrawerLinkFormatter();
    setupHeaderCartInterceptor();
  }

  function setupHeaderCartInterceptor() {
    document.addEventListener(
      "click",
      function (e) {
        const cartTrigger = e.target.closest("#cart-icon-bubble, a[href*='/cart'], .header__icon--cart, .cart-icon");
        if (!cartTrigger) return;
        const dawnDrawer = document.querySelector("cart-drawer, #CartDrawer");
        if (!dawnDrawer) {
          e.preventDefault();
          e.stopPropagation();
          renderRebelSlideDrawer();
        }
      },
      true
    );
  }

  // 1. Detect Pack / Variant selection to adjust requirements & text field
  function setupVariantWatchers(container) {
    function checkVariant() {
      // Check for current variant text in radio buttons or select
      const selectedRadios = document.querySelectorAll(
        'variant-radios input[type="radio"]:checked, variant-selects select, form[action*="/cart/add"] input[name="id"]'
      );
      let variantText = "";
      selectedRadios.forEach((el) => {
        if (el.tagName === "SELECT") {
          variantText += " " + (el.options[el.selectedIndex]?.text || "");
        } else if (el.value) {
          variantText += " " + el.value;
        }
      });

      const textGroup = container.querySelector(".rebel-pc-text-group");
      if (textGroup) {
        // If variant contains "with Text", highlight or show it
        const hasTextOption = /with\s*text/i.test(variantText);
        const textReqStar = textGroup.querySelector(".req");
        if (textReqStar) {
          textReqStar.style.display = hasTextOption ? "inline" : "none";
        }
      }
    }

    document.addEventListener("change", function (e) {
      if (e.target.closest("variant-radios, variant-selects, form[action*='/cart/add']")) {
        checkVariant();
      }
    });

    checkVariant();
  }

  // 2. Setup Collage Images (4-6 Images) Dropzone
  function setupCollageDropzone(container) {
    const dropzone = container.querySelector("#rebel-pc-collage-drop");
    const fileInput = container.querySelector("#rebel-pc-collage-input");
    const thumbContainer = container.querySelector("#rebel-pc-collage-thumbs");
    const counterEl = container.querySelector("#rebel-pc-collage-counter");
    if (!dropzone || !fileInput) return;

    function updateCounter() {
      if (counterEl) {
        counterEl.textContent = `(${collageImages.length} selected)`;
      }
    }

    // Drag events
    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) handleCollageFiles(files, container);
    });

    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) handleCollageFiles(files, container);
      e.target.value = "";
    });

    updateCounter();
  }

  function handleCollageFiles(files, container) {
    clearError(container);
    const maxFiles = parseInt(container.dataset.maxImages, 10) || 6;

    if (maxFiles === 1) {
      // Single photo mode: replace previous selection
      collageImages = [];
    } else if (collageImages.length + files.length > maxFiles) {
      showError(container, `You can select maximum ${maxFiles} images. (Already have ${collageImages.length})`);
      return;
    }

    for (const file of files) {
      const ext = (file.name.substring(file.name.lastIndexOf(".")) || "").toLowerCase();
      const mime = (file.type || "").toLowerCase();
      if (!ALLOWED_MIME.includes(mime) && !ALLOWED_EXT.includes(ext)) {
        showError(container, `"${file.name}" is not supported. Use JPG, PNG, or WEBP.`);
        return;
      }
      const mb = file.size / (1024 * 1024);
      if (mb > MAX_SIZE_MB) {
        showError(container, `"${file.name}" is too large (${mb.toFixed(1)}MB). Max is ${MAX_SIZE_MB}MB.`);
        return;
      }
    }

    files.forEach((file) => {
      const item = {
        id: "col-" + Math.random().toString(36).substring(2, 9),
        file: file,
        url: null,
        preview: URL.createObjectURL(file),
        uploading: true,
      };
      collageImages.push(item);
      renderCollageThumbs(container);
      uploadSingleImage(item, container, () => renderCollageThumbs(container));
    });

    renderCollageThumbs(container);
  }

  function renderCollageThumbs(container) {
    const thumbContainer = container.querySelector("#rebel-pc-collage-thumbs");
    const counterEl = container.querySelector("#rebel-pc-collage-counter");
    if (!thumbContainer) return;

    if (counterEl) {
      counterEl.textContent = `(${collageImages.length} selected)`;
    }

    thumbContainer.innerHTML = "";
    collageImages.forEach((img, idx) => {
      const thumb = document.createElement("div");
      thumb.className = "rebel-pc-thumb";
      thumb.innerHTML = `
        <img src="${img.preview}" alt="Collage Photo ${idx + 1}" />
        <button type="button" class="remove-btn" title="Remove image" data-id="${img.id}">×</button>
        ${img.uploading ? '<div class="uploading-overlay"><div class="rebel-pc-spinner"></div></div>' : ""}
      `;
      thumb.querySelector(".remove-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        collageImages = collageImages.filter((x) => x.id !== img.id);
        renderCollageThumbs(container);
      });
      thumbContainer.appendChild(thumb);
    });
  }

  // 3. Setup Pop-Out Image (1 Image) Dropzone
  function setupPopoutDropzone(container) {
    const dropzone = container.querySelector("#rebel-pc-popout-drop");
    const fileInput = container.querySelector("#rebel-pc-popout-input");
    if (!dropzone || !fileInput) return;

    ["dragenter", "dragover"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((ev) => {
      dropzone.addEventListener(ev, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const files = Array.from(e.dataTransfer?.files || []);
      if (files.length > 0) handlePopoutFile(files[0], container);
    });

    fileInput.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) handlePopoutFile(files[0], container);
      e.target.value = "";
    });
  }

  function handlePopoutFile(file, container) {
    clearError(container);
    const ext = (file.name.substring(file.name.lastIndexOf(".")) || "").toLowerCase();
    const mime = (file.type || "").toLowerCase();
    if (!ALLOWED_MIME.includes(mime) && !ALLOWED_EXT.includes(ext)) {
      showError(container, `"${file.name}" is not supported. Use JPG, PNG, or WEBP.`);
      return;
    }
    const mb = file.size / (1024 * 1024);
    if (mb > MAX_SIZE_MB) {
      showError(container, `"${file.name}" is too large (${mb.toFixed(1)}MB). Max is ${MAX_SIZE_MB}MB.`);
      return;
    }

    const item = {
      id: "pop-" + Math.random().toString(36).substring(2, 9),
      file: file,
      url: null,
      preview: URL.createObjectURL(file),
      uploading: true,
    };
    popoutImage = item;
    renderPopoutThumb(container);
    uploadSingleImage(item, container, () => renderPopoutThumb(container));
  }

  function renderPopoutThumb(container) {
    const thumbContainer = container.querySelector("#rebel-pc-popout-thumbs");
    if (!thumbContainer) return;

    thumbContainer.innerHTML = "";
    if (!popoutImage) return;

    const thumb = document.createElement("div");
    thumb.className = "rebel-pc-thumb";
    thumb.innerHTML = `
      <img src="${popoutImage.preview}" alt="Pop-Out Photo" />
      <button type="button" class="remove-btn" title="Remove image">×</button>
      ${popoutImage.uploading ? '<div class="uploading-overlay"><div class="rebel-pc-spinner"></div></div>' : ""}
    `;
    thumb.querySelector(".remove-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      popoutImage = null;
      renderPopoutThumb(container);
    });
    thumbContainer.appendChild(thumb);
  }

  // 4. Async Upload to Supabase Storage
  async function uploadSingleImage(item, container, onComplete) {
    try {
      const backendUrl = getBackendUrl();
      const formData = new FormData();
      formData.append("files", item.file);

      const res = await fetch(`${backendUrl}/api/upload`, {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (res.ok && data.success && data.urls && data.urls.length > 0) {
        item.url = data.urls[0];
        item.uploading = false;
      } else {
        item.uploading = false;
        showError(container, data.error || "Image upload failed. Please try again.");
      }
    } catch (err) {
      item.uploading = false;
      showError(container, "Server connection failed while uploading image.");
    } finally {
      if (onComplete) onComplete();
    }
  }

  // 5. Intercept "Add to cart" AND "Buy it now" with strict validation & checkout redirect
  function setupActionInterception(container) {
    function handleActionClick(e) {
      if (!document.contains(container)) return;

      // Check for Buy It Now (Shopify Payment Button / Accelerated Checkout)
      const buyBtn = e.target.closest(
        ".shopify-payment-button__button, .shopify-payment-button button, [data-testid='Checkout-button'], .shopify-payment-button, [data-shopify='payment-button'], button[name='checkout']"
      );

      // Check for standard Add to Cart
      const addBtn = e.target.closest(
        'button[name="add"], #ProductSubmitButton, .product-form__submit, form[action*="/cart/add"] button[type="submit"], form[action*="/cart/add"] [type="submit"]'
      );

      if (!buyBtn && !addBtn) return;

      const isBuyNow = Boolean(buyBtn);
      const actionBtn = buyBtn || addBtn;

      // Strict validation: Images MUST be selected first
      const validation = validateInputs(container, isBuyNow);
      if (!validation.valid) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        showError(container, validation.error);
        container.scrollIntoView({ behavior: "smooth", block: "center" });
        return false;
      }

      // Images are selected -> prevent native submit to allow uploads & attach properties
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      executeAction(container, actionBtn, isBuyNow);
    }

    // Capture phase on document to intercept before Shopify scripts
    document.addEventListener("click", handleActionClick, true);

    // Watch for dynamically rendered .shopify-payment-button
    function guardPaymentButtons() {
      document.querySelectorAll(".shopify-payment-button").forEach((btnContainer) => {
        if (!btnContainer.__rebelGuarded) {
          btnContainer.__rebelGuarded = true;
          btnContainer.addEventListener("click", handleActionClick, true);
        }
      });
    }

    guardPaymentButtons();
    setTimeout(guardPaymentButtons, 800);
    setTimeout(guardPaymentButtons, 2000);

    // Intercept form submission
    document.addEventListener(
      "submit",
      function (e) {
        const form = e.target.closest("form[action*='/cart/add']");
        if (!form || !document.contains(container)) return;

        // Stop native form submit that causes full page redirect to /cart!
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        const validation = validateInputs(container, false);
        if (!validation.valid) {
          showError(container, validation.error);
          container.scrollIntoView({ behavior: "smooth", block: "center" });
          return false;
        }

        const actionBtn = form.querySelector('[type="submit"], button[name="add"]') || form;
        executeAction(container, actionBtn, false);
        return false;
      },
      true
    );
  }

  function validateInputs(container, isBuyNow) {
    const actionLabel = isBuyNow ? "buying now" : "adding to cart";
    const enableImages = container.dataset.enableImages !== "false";
    const minImages = parseInt(container.dataset.minImages, 10) || 1;
    const maxImages = parseInt(container.dataset.maxImages, 10) || 6;
    const enablePopout = container.dataset.enablePopout !== "false";
    const popoutRequired = container.dataset.popoutRequired === "true";
    const enableText = container.dataset.enableText !== "false";
    const textRequired = container.dataset.textRequired === "true";

    // 1. Check images if enabled
    if (enableImages) {
      if (collageImages.length < minImages) {
        const drop = container.querySelector("#rebel-pc-collage-drop");
        if (drop) drop.classList.add("error");
        const msg = minImages === 1
          ? `⚠️ Please select your photo before ${actionLabel}.`
          : `⚠️ Please select at least ${minImages} image(s) before ${actionLabel}.`;
        return { valid: false, error: msg };
      }
    }

    // 2. Check popout image if enabled & required
    if (enablePopout && popoutRequired) {
      if (!popoutImage) {
        const drop = container.querySelector("#rebel-pc-popout-drop");
        if (drop) drop.classList.add("error");
        return {
          valid: false,
          error: `⚠️ Please select 1 Pop-Out image before ${actionLabel}.`,
        };
      }
    }

    // 3. Check custom text if enabled & required (or variant says "with Text")
    if (enableText) {
      const textGroup = container.querySelector(".rebel-pc-text-group");
      const textInput = container.querySelector("#rebel-pc-text-input");
      const reqStar = textGroup?.querySelector(".req");
      const isMandatory = textRequired || (reqStar && reqStar.style.display !== "none");
      if (isMandatory && textInput && !textInput.value.trim()) {
        textInput.focus();
        return {
          valid: false,
          error: `⚠️ Please enter your custom text before ${actionLabel}.`,
        };
      }
    }

    return { valid: true };
  }

  async function waitForUploads() {
    return new Promise((resolve) => {
      let elapsed = 0;
      const interval = setInterval(() => {
        elapsed += 250;
        const still = collageImages.some((x) => x.uploading) || (popoutImage && popoutImage.uploading);
        if (!still || elapsed > 30000) {
          clearInterval(interval);
          resolve();
        }
      }, 250);
    });
  }

  function syncHiddenFormInputs(form, properties) {
    if (!form) return;
    form.querySelectorAll(".rebel-injected-prop").forEach((el) => el.remove());
    for (const [key, val] of Object.entries(properties)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = `properties[${key}]`;
      input.value = val;
      input.className = "rebel-injected-prop";
      form.appendChild(input);
    }
  }

  // 6. Execute Add To Cart OR Buy It Now (with direct Checkout redirect)
  async function executeAction(container, actionBtn, isBuyNow) {
    if (isSubmitting) return;
    isSubmitting = true;

    // Check if still uploading files to Supabase
    const isStillUploading =
      collageImages.some((x) => x.uploading) || (popoutImage && popoutImage.uploading);

    if (isStillUploading) {
      showStatus(container, "Uploading photos to cloud... Please wait a moment.");
      await waitForUploads();
      clearStatus(container);
    }

    // Show button loading state
    const originalText = actionBtn.innerHTML;
    actionBtn.disabled = true;
    actionBtn.innerHTML = `<span>${isBuyNow ? "Preparing checkout..." : "Adding to cart..."}</span>`;

    try {
      // Find variant id
      let variantId = null;
      const form = document.querySelector('form[action*="/cart/add"]');
      const idInput = form?.querySelector('input[name="id"]');
      if (idInput) {
        variantId = idInput.value;
      } else {
        const urlParams = new URLSearchParams(window.location.search);
        variantId = urlParams.get("variant") || window.ShopifyAnalytics?.meta?.selectedVariantId;
      }

      // Quantity
      let quantity = 1;
      const qtyInput = form?.querySelector('input[name="quantity"], .quantity__input');
      if (qtyInput) {
        quantity = parseInt(qtyInput.value, 10) || 1;
      }

      // Text input
      const textInput = container.querySelector("#rebel-pc-text-input");
      const customText = textInput ? textInput.value.trim() : "";

      // Product Title prefix for property names
      let productTitle = container.dataset.productTitle || "POP UP FRAME";

      // Build properties matching dynamic configuration
      const properties = {};
      const enableText = container.dataset.enableText !== "false";
      const enableImages = container.dataset.enableImages !== "false";
      const enablePopout = container.dataset.enablePopout !== "false";
      const maxImages = parseInt(container.dataset.maxImages, 10) || 6;
      const textLabel = container.dataset.textLabel || "Enter Text";

      if (enableText && customText) {
        properties[textLabel] = customText;
      }

      if (enableImages) {
        if (maxImages === 1 && collageImages.length === 1) {
          if (collageImages[0].url) {
            properties[`${productTitle} Photo`] = collageImages[0].url;
          }
        } else {
          collageImages.forEach((img, idx) => {
            if (img.url) {
              properties[`${productTitle}_${idx + 1}`] = img.url;
            }
          });
        }
      }

      if (enablePopout && popoutImage && popoutImage.url) {
        properties["upload - Single Pop Out Image_1"] = popoutImage.url;
      }

      // Sync into hidden form inputs as fallback
      syncHiddenFormInputs(form, properties);

      // Add to Shopify Cart with line item properties
      const addRes = await fetch((window.Shopify?.routes?.root || "/") + "cart/add.js", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          id: variantId,
          quantity: quantity,
          properties: properties,
          sections: isBuyNow ? "" : "cart-drawer,cart-icon-bubble",
        }),
      });

      const cartData = await addRes.json();

      if (addRes.ok) {
        if (isBuyNow) {
          // USER REQUEST: After selecting images, go directly to checkout!
          window.location.href = (window.Shopify?.routes?.root || "/") + "checkout";
          return;
        }

        // Standard Add To Cart -> Open Cart Drawer Sidebar (never redirect to /cart page!)
        await openCartSidebar(cartData);
      } else {
        showError(container, cartData.description || "Could not process order. Please try again.");
      }
    } catch (err) {
      console.error("[Customizer Error]", err);
      showError(container, "An error occurred. Please try again.");
    } finally {
      isSubmitting = false;
      actionBtn.disabled = false;
      actionBtn.innerHTML = originalText;
    }
  }

  // 7. Open Cart Sidebar (Handles both Dawn native drawer AND fallback slide drawer)
  async function openCartSidebar(cartData) {
    const dawnDrawer = document.querySelector("cart-drawer, #CartDrawer");

    if (dawnDrawer) {
      // 1. If Dawn's native cart-drawer is in the DOM
      try {
        if (typeof dawnDrawer.renderContents === "function") {
          dawnDrawer.renderContents(cartData);
        } else if (cartData?.sections && cartData.sections["cart-drawer"]) {
          const parser = new DOMParser();
          const doc = parser.parseFromString(cartData.sections["cart-drawer"], "text/html");
          const newContent = doc.querySelector("#CartDrawer") || doc.querySelector("cart-drawer");
          if (newContent) dawnDrawer.innerHTML = newContent.innerHTML;
        }
      } catch (_) {}

      if (typeof dawnDrawer.open === "function") {
        dawnDrawer.open();
      } else {
        dawnDrawer.classList.add("animate", "active");
        document.body.classList.add("overflow-hidden");
      }

      document.dispatchEvent(new CustomEvent("cart:updated", { detail: { cart: cartData } }));
      document.dispatchEvent(new CustomEvent("cart-drawer:open"));
      setTimeout(formatDrawerPropertyLinks, 150);
      setTimeout(formatDrawerPropertyLinks, 500);
      return;
    }

    // 2. If Dawn's drawer is not in the DOM (theme setting is Page/Notification)
    // Open our sleek, responsive slide-out cart sidebar!
    await renderRebelSlideDrawer();
  }

  // 8. Standalone Slide-Out Cart Drawer Sidebar (Guaranteed to open on any page)
  async function renderRebelSlideDrawer() {
    let overlay = document.querySelector(".rebel-slide-drawer-overlay");
    let drawer = document.querySelector(".rebel-slide-drawer");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "rebel-slide-drawer-overlay";
      document.body.appendChild(overlay);

      overlay.addEventListener("click", () => {
        overlay.classList.remove("active");
        drawer?.classList.remove("active");
        document.body.classList.remove("overflow-hidden");
      });
    }

    if (!drawer) {
      drawer = document.createElement("div");
      drawer.className = "rebel-slide-drawer";
      document.body.appendChild(drawer);
    }

    try {
      const res = await fetch((window.Shopify?.routes?.root || "/") + "cart.js");
      const cart = await res.json();

      let itemsHtml = "";
      (cart.items || []).forEach((item) => {
        let propsHtml = "";
        if (item.properties) {
          for (const [k, v] of Object.entries(item.properties)) {
            if (!v || k.startsWith("_")) continue;
            let valHtml = v;
            if (typeof v === "string" && (v.startsWith("http://") || v.startsWith("https://"))) {
              valHtml = `<a href="${v}" target="_blank" class="rebel-property-link" title="View Image">🔗</a>`;
            }
            propsHtml += `<div class="rebel-drawer-item-prop"><strong>${k}:</strong> ${valHtml}</div>`;
          }
        }

        const priceFormatted = (item.final_line_price / 100).toFixed(2);
        const itemImg = item.image || item.featured_image?.url || "";

        itemsHtml += `
          <div class="rebel-drawer-item">
            ${itemImg ? `<img src="${itemImg}" class="rebel-drawer-item-img" alt="${item.title}" />` : ""}
            <div class="rebel-drawer-item-details">
              <div class="rebel-drawer-item-title">${item.product_title || item.title}</div>
              ${item.variant_title ? `<div style="font-size: 12px; color: #6b7280; margin-bottom: 2px;">${item.variant_title}</div>` : ""}
              <div class="rebel-drawer-item-price">Rs. ${priceFormatted} (Qty: ${item.quantity})</div>
              ${propsHtml}
            </div>
          </div>
        `;
      });

      const totalFormatted = (cart.total_price / 100).toFixed(2);

      drawer.innerHTML = `
        <div class="rebel-drawer-head">
          <h3>Your Cart (${cart.item_count || 0})</h3>
          <button type="button" class="rebel-drawer-close-btn" aria-label="Close cart">✕</button>
        </div>
        <div class="rebel-drawer-items-list">
          ${itemsHtml || '<p style="text-align:center; color:#6b7280; padding: 40px 0;">Your cart is empty</p>'}
        </div>
        <div class="rebel-drawer-footer">
          <div class="rebel-drawer-subtotal">
            <span>Estimated Total</span>
            <span>Rs. ${totalFormatted}</span>
          </div>
          <a href="${(window.Shopify?.routes?.root || '/') + 'checkout'}" class="rebel-drawer-checkout-btn">
            Proceed to Checkout
          </a>
        </div>
      `;

      drawer.querySelector(".rebel-drawer-close-btn")?.addEventListener("click", () => {
        overlay.classList.remove("active");
        drawer.classList.remove("active");
        document.body.classList.remove("overflow-hidden");
      });

      requestAnimationFrame(() => {
        overlay.classList.add("active");
        drawer.classList.add("active");
        document.body.classList.add("overflow-hidden");
      });

      // Update header bubbles
      document.querySelectorAll(".cart-count-bubble, [data-cart-count]").forEach((el) => {
        el.textContent = cart.item_count;
        el.classList.remove("hidden");
      });
    } catch (e) {
      console.error("[Drawer Render Error]", e);
    }
  }

  // 9. Format Cart Drawer Property Links safely without recursive DOM loops
  let isFormattingLinks = false;
  function formatDrawerPropertyLinks() {
    if (isFormattingLinks) return;
    const drawer = document.querySelector("cart-drawer, #CartDrawer, .rebel-slide-drawer");
    if (!drawer) return;

    isFormattingLinks = true;
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
            }
            dd.dataset.rebelFormatted = "true";
          }
        } else if (text.startsWith("http://") || text.startsWith("https://")) {
          dd.innerHTML = `<a href="${text}" target="_blank" class="link rebel-property-link" title="View Image" style="color: #2563eb; text-decoration: underline; font-size: 13px;">🔗</a>`;
          dd.dataset.rebelFormatted = "true";
        }
      });
    } finally {
      setTimeout(() => {
        isFormattingLinks = false;
      }, 100);
    }
  }

  function setupCartDrawerLinkFormatter() {
    document.addEventListener("cart:updated", () => setTimeout(formatDrawerPropertyLinks, 100));
    document.addEventListener("cart-drawer:open", () => setTimeout(formatDrawerPropertyLinks, 100));
    document.addEventListener("DOMContentLoaded", () => setTimeout(formatDrawerPropertyLinks, 500));
  }

  // Helper UI methods
  function showError(container, msg) {
    const errorBanner = container.querySelector(".rebel-pc-error-banner");
    const errorText = container.querySelector(".rebel-pc-error-text");
    if (errorBanner && errorText) {
      errorText.textContent = msg;
      errorBanner.style.display = "flex";
    }
  }

  function clearError(container) {
    const errorBanner = container.querySelector(".rebel-pc-error-banner");
    if (errorBanner) errorBanner.style.display = "none";
    container.querySelectorAll(".rebel-pc-dropzone.error").forEach((el) => el.classList.remove("error"));
  }

  function showStatus(container, msg) {
    const statusBox = container.querySelector(".rebel-pc-status");
    const statusText = container.querySelector(".rebel-pc-status-text");
    if (statusBox && statusText) {
      statusText.textContent = msg;
      statusBox.style.display = "flex";
    }
  }

  function clearStatus(container) {
    const statusBox = container.querySelector(".rebel-pc-status");
    if (statusBox) statusBox.style.display = "none";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
