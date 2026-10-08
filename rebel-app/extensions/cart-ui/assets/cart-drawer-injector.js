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
})();
