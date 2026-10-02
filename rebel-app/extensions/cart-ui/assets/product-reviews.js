/**
 * Rebel Product Reviews — Storefront JavaScript
 * Handles:
 *  - Fetching and rendering paginated approved reviews
 *  - Rating summary with breakdown bars
 *  - Review submission form with validation
 *  - Star picker interaction
 *  - Media upload (photos + videos) to S3
 *  - Load More pagination
 *  - Instagram link
 *  - Lightbox for media
 */
(function () {
  "use strict";

  const block = document.getElementById("rebel-reviews");
  if (!block) return;

  let APP_URL = block.dataset.appUrl || "";
  if (!APP_URL || APP_URL.includes("your-app-url.com")) {
    APP_URL = "https://orders-taken-canberra-ten.trycloudflare.com";
  }
  const SHOP = block.dataset.shop || "";
  const PRODUCT_ID = block.dataset.productId || "";
  const PRODUCT_HANDLE = block.dataset.productHandle || "";
  const PER_PAGE = parseInt(block.dataset.perPage || "5");

  let currentPage = 1;
  let totalPages = 1;
  let selectedRating = 0;
  let uploadedMediaUrls = [];
  const MAX_MEDIA = 5;
  const MAX_MEDIA_SIZE_MB = 10;

  // ─── DOM refs ────────────────────────────────────────────────
  const writeBtn = document.getElementById("rebel-write-review-btn");
  const formWrap = document.getElementById("rebel-form-wrap");
  const form = document.getElementById("rebel-review-form");
  const cancelBtn = document.getElementById("rebel-cancel-btn");
  const submitBtn = document.getElementById("rebel-submit-btn");
  const ratingInput = document.getElementById("rebel-rating-input");
  const starBtns = document.querySelectorAll(".rebel-reviews__star-btn");
  const reviewsList = document.getElementById("rebel-reviews-list");
  const loadingEl = document.getElementById("rebel-reviews-loading");
  const loadMoreWrap = document.getElementById("rebel-load-more-wrap");
  const loadMoreBtn = document.getElementById("rebel-load-more");
  const formMsg = document.getElementById("rebel-form-msg");
  const ratingSummary = document.getElementById("rebel-rating-summary");
  const igLink = document.getElementById("rebel-instagram-link");
  const igUrl = document.getElementById("rebel-ig-url");
  const mediaFileInput = document.getElementById("rebel-review-files");
  const mediaPreviews = document.getElementById("rebel-review-previews");
  const mediaUploadStatus = document.getElementById("rebel-review-upload-status");

  // ─── Init ─────────────────────────────────────────────────────
  loadReviews(1);

  // ─── Write review toggle ──────────────────────────────────────
  writeBtn?.addEventListener("click", () => {
    formWrap.style.display = formWrap.style.display === "none" ? "block" : "none";
    if (formWrap.style.display === "block") {
      formWrap.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  cancelBtn?.addEventListener("click", () => {
    formWrap.style.display = "none";
    form.reset();
    resetStars();
    uploadedMediaUrls = [];
    if (mediaPreviews) mediaPreviews.innerHTML = "";
  });

  // ─── Star Picker ──────────────────────────────────────────────
  starBtns.forEach((btn) => {
    btn.addEventListener("mouseover", () => highlightStars(parseInt(btn.dataset.value)));
    btn.addEventListener("mouseleave", () => highlightStars(selectedRating));
    btn.addEventListener("click", () => {
      selectedRating = parseInt(btn.dataset.value);
      if (ratingInput) ratingInput.value = selectedRating;
      highlightStars(selectedRating);
    });
  });

  function highlightStars(count) {
    starBtns.forEach((b) => {
      const v = parseInt(b.dataset.value);
      b.classList.toggle("active", v <= count);
    });
  }

  function resetStars() {
    selectedRating = 0;
    if (ratingInput) ratingInput.value = "";
    highlightStars(0);
  }

  // ─── Media Upload in Form ─────────────────────────────────────
  mediaFileInput?.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    await handleReviewMedia(files);
  });

  async function handleReviewMedia(files) {
    const allowed = [
      "image/jpeg", "image/png", "image/webp", "image/gif",
      "video/mp4", "video/webm", "video/quicktime"
    ];

    const valid = files.filter((f) => allowed.includes(f.type));
    if (valid.length === 0) return;

    if (uploadedMediaUrls.length + valid.length > MAX_MEDIA) {
      showFieldError("review-upload", `Maximum ${MAX_MEDIA} files allowed.`);
      return;
    }

    for (const f of valid) {
      if (f.size > MAX_MEDIA_SIZE_MB * 1024 * 1024) {
        showFieldError("review-upload", `"${f.name}" is too large. Max ${MAX_MEDIA_SIZE_MB}MB.`);
        return;
      }
    }

    mediaUploadStatus.style.display = "flex";

    try {
      const formData = new FormData();
      formData.append("prefix", "reviews");
      valid.forEach((f) => formData.append("files", f));

      const res = await fetch(`${APP_URL}/api/upload`, { method: "POST", body: formData });
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      data.urls.forEach((url) => {
        uploadedMediaUrls.push(url);
        addMediaThumb(url);
      });
    } catch (err) {
      showFieldError("review-upload", "Upload failed. Try again.");
    } finally {
      mediaUploadStatus.style.display = "none";
    }
  }

  function addMediaThumb(url) {
    if (!mediaPreviews) return;
    const isVideo = url.match(/\.(mp4|webm|mov)$/i);
    const wrap = document.createElement("div");
    wrap.className = "rebel-reviews__media-thumb";

    const media = document.createElement(isVideo ? "video" : "img");
    media.src = url;
    media.alt = "Preview";
    if (isVideo) media.controls = false;

    const removeBtn = document.createElement("button");
    removeBtn.className = "rebel-reviews__media-remove";
    removeBtn.innerHTML = "✕";
    removeBtn.type = "button";
    removeBtn.addEventListener("click", () => {
      uploadedMediaUrls = uploadedMediaUrls.filter((u) => u !== url);
      wrap.remove();
    });

    wrap.appendChild(media);
    wrap.appendChild(removeBtn);
    mediaPreviews.appendChild(wrap);
  }

  // ─── Form Submit ──────────────────────────────────────────────
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFieldErrors();

    const honeypot = form.querySelector('[name="website"]').value;
    const authorName = form.querySelector('[name="authorName"]').value.trim();
    const authorEmail = form.querySelector('[name="authorEmail"]').value.trim();
    const rating = ratingInput?.value;
    const title = form.querySelector('[name="title"]').value.trim();
    const reviewBody = form.querySelector('[name="reviewBody"]').value.trim();

    // Validation
    let valid = true;
    if (!rating) { showFieldError("rating", "Please select a rating."); valid = false; }
    if (!authorName) { showFieldError("name", "Please enter your name."); valid = false; }
    if (!authorEmail || !authorEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      showFieldError("email", "Please enter a valid email."); valid = false;
    }
    if (!reviewBody) { showFieldError("body", "Please write a review."); valid = false; }
    if (!valid) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
    formMsg.style.display = "none";

    try {
      const res = await fetch(`${APP_URL}/api/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: SHOP,
          productId: PRODUCT_ID,
          productHandle: PRODUCT_HANDLE,
          authorName,
          authorEmail,
          rating: parseInt(rating),
          title,
          reviewBody,
          mediaUrls: uploadedMediaUrls,
          honeypot,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Submission failed");
      }

      formMsg.className = "rebel-reviews__form-msg success";
      formMsg.textContent = data.message;
      formMsg.style.display = "block";
      form.reset();
      resetStars();
      uploadedMediaUrls = [];
      if (mediaPreviews) mediaPreviews.innerHTML = "";

      setTimeout(() => {
        formWrap.style.display = "none";
        formMsg.style.display = "none";
      }, 4000);
    } catch (err) {
      formMsg.className = "rebel-reviews__form-msg error";
      formMsg.textContent = err.message || "Something went wrong. Please try again.";
      formMsg.style.display = "block";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Submit Review";
    }
  });

  // ─── Load Reviews ─────────────────────────────────────────────
  async function loadReviews(page, append = false) {
    if (!append && loadingEl) {
      loadingEl.style.display = "flex";
      reviewsList.innerHTML = "";
      reviewsList.appendChild(loadingEl);
    }

    try {
      const params = new URLSearchParams({
        shop: SHOP,
        productId: PRODUCT_ID,
        handle: PRODUCT_HANDLE,
        page: String(page),
      });

      const res = await fetch(`${APP_URL}/api/reviews?${params}`);
      const data = await res.json();

      if (!append) {
        reviewsList.innerHTML = "";

        // Rating Summary
        if (data.total > 0) {
          renderRatingSummary(data.averageRating, data.total, data.ratingBreakdown);
          ratingSummary.style.display = "flex";
        }
      }

      // Instagram link
      if (data.instagramUrl && igLink && igUrl) {
        igUrl.href = data.instagramUrl;
        igLink.style.display = "flex";
      }

      currentPage = data.page;
      totalPages = data.totalPages;

      if (data.reviews.length === 0 && page === 1) {
        reviewsList.innerHTML = `<div class="rebel-reviews__empty">No reviews yet. Be the first to review this product!</div>`;
      } else {
        data.reviews.forEach((review) => reviewsList.appendChild(renderReview(review)));
      }

      // Load More button
      if (currentPage < totalPages) {
        loadMoreWrap.style.display = "block";
        loadMoreBtn.disabled = false;
        loadMoreBtn.textContent = "Load More Reviews";
      } else {
        loadMoreWrap.style.display = "none";
      }
    } catch (err) {
      reviewsList.innerHTML = `<div class="rebel-reviews__empty">Could not load reviews. Please refresh.</div>`;
    }
  }

  // Load More
  loadMoreBtn?.addEventListener("click", async () => {
    loadMoreBtn.disabled = true;
    loadMoreBtn.textContent = "Loading…";
    await loadReviews(currentPage + 1, true);
  });

  // ─── Render Rating Summary ────────────────────────────────────
  function renderRatingSummary(avg, total, breakdown) {
    const avgScore = document.getElementById("rebel-avg-score");
    const avgStars = document.getElementById("rebel-avg-stars");
    const avgCount = document.getElementById("rebel-avg-count");
    const ratingBars = document.getElementById("rebel-rating-bars");

    if (avgScore) avgScore.textContent = avg.toFixed(1);
    if (avgStars) avgStars.textContent = starsFromRating(Math.round(avg));
    if (avgCount) avgCount.textContent = `${total} review${total !== 1 ? "s" : ""}`;

    if (ratingBars) {
      ratingBars.innerHTML = "";
      for (let i = 5; i >= 1; i--) {
        const count = breakdown[i] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const row = document.createElement("div");
        row.className = "rebel-reviews__rating-bar-row";
        row.innerHTML = `
          <span class="rebel-reviews__rating-bar-label">${i} ★</span>
          <div class="rebel-reviews__rating-bar-track">
            <div class="rebel-reviews__rating-bar-fill" style="width:0%" data-target="${pct}%"></div>
          </div>
          <span class="rebel-reviews__rating-bar-count">${count}</span>
        `;
        ratingBars.appendChild(row);
      }
      // Animate bars
      requestAnimationFrame(() => {
        ratingBars.querySelectorAll(".rebel-reviews__rating-bar-fill").forEach((fill) => {
          fill.style.width = fill.dataset.target;
        });
      });
    }
  }

  // ─── Render a single review ───────────────────────────────────
  function renderReview(review) {
    const item = document.createElement("div");
    item.className = "rebel-reviews__item";

    const mediaUrls = Array.isArray(review.mediaUrls) ? review.mediaUrls : [];

    item.innerHTML = `
      <div class="rebel-reviews__item-header">
        <div>
          <div class="rebel-reviews__item-author">${escHtml(review.authorName)}</div>
          <div class="rebel-reviews__item-date">${review.createdAt}</div>
        </div>
        <div class="rebel-reviews__item-stars">${starsFromRating(review.rating)}</div>
      </div>
      ${review.title ? `<div class="rebel-reviews__item-title">${escHtml(review.title)}</div>` : ""}
      <p class="rebel-reviews__item-body">${escHtml(review.body)}</p>
      ${
        mediaUrls.length > 0
          ? `<div class="rebel-reviews__item-media">
              ${mediaUrls
                .map((url) => {
                  const isVideo = url.match(/\.(mp4|webm|mov)$/i);
                  return isVideo
                    ? `<video src="${url}" preload="none" data-lightbox="${url}"></video>`
                    : `<img src="${url}" alt="Review photo" loading="lazy" data-lightbox="${url}" />`;
                })
                .join("")}
            </div>`
          : ""
      }
    `;

    // Lightbox on media click
    item.querySelectorAll("[data-lightbox]").forEach((el) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => openLightbox(el.dataset.lightbox));
    });

    return item;
  }

  // ─── Lightbox ─────────────────────────────────────────────────
  let lightbox = null;

  function openLightbox(url) {
    if (!lightbox) {
      lightbox = document.createElement("div");
      lightbox.className = "rebel-lightbox";
      lightbox.innerHTML = `<button class="rebel-lightbox__close" aria-label="Close">✕</button>`;
      document.body.appendChild(lightbox);
      lightbox.querySelector(".rebel-lightbox__close").addEventListener("click", closeLightbox);
      lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeLightbox(); });
    }

    // Clear previous media
    lightbox.querySelectorAll("img, video").forEach((el) => el.remove());

    const isVideo = url.match(/\.(mp4|webm|mov)$/i);
    const media = document.createElement(isVideo ? "video" : "img");
    media.src = url;
    if (isVideo) { media.controls = true; media.autoplay = false; }
    media.alt = "Review media";
    lightbox.insertBefore(media, lightbox.querySelector(".rebel-lightbox__close"));
    lightbox.classList.add("open");
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    if (lightbox) {
      lightbox.classList.remove("open");
      lightbox.querySelectorAll("video").forEach((v) => v.pause());
      document.body.style.overflow = "";
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────
  function starsFromRating(r) {
    return "★".repeat(r) + "☆".repeat(5 - r);
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function showFieldError(field, msg) {
    const el = document.getElementById(`rebel-${field}-error`);
    if (el) { el.textContent = msg; el.style.display = "block"; }
  }

  function clearFieldErrors() {
    document.querySelectorAll(".rebel-reviews__field-error").forEach((el) => {
      el.style.display = "none";
    });
  }
})();
