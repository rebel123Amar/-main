import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState, useEffect } from "react";
import { prisma } from "../shopify.server";

export const meta: MetaFunction = () => {
  return [
    { title: "Review Your Order — Rebel Gifts 💌" },
    {
      name: "description",
      content: "Share your honest unboxing review & photos for your Rebel Gifts order 🥹❤️",
    },
    { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
  ];
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "rebelgifts.in";
  const orderId =
    url.searchParams.get("order_id") ||
    url.searchParams.get("orderId") ||
    url.searchParams.get("review_order") ||
    "";
  const orderName = url.searchParams.get("order_name") || url.searchParams.get("orderName") || (orderId ? `#${orderId}` : "");
  let customerName = url.searchParams.get("name") || url.searchParams.get("customer_name") || "";
  let customerEmail = url.searchParams.get("email") || url.searchParams.get("customer_email") || "";
  let productTitle =
    url.searchParams.get("product_title") ||
    url.searchParams.get("product") ||
    url.searchParams.get("prod") ||
    "";
  let productImage =
    url.searchParams.get("product_img") ||
    url.searchParams.get("image") ||
    url.searchParams.get("img") ||
    "";
  let productId = url.searchParams.get("product_id") || url.searchParams.get("productId") || "";

  // If orderId is provided but details are missing, fetch from database
  if (orderId && (!productTitle || !customerName)) {
    const cleanOrderId = orderId.replace(/^gid:\/\/shopify\/Order\//, "");
    try {
      const customOrder = await prisma.orderCustomization.findFirst({
        where: { orderId: cleanOrderId },
      });
      if (customOrder) {
        if (!orderName && customOrder.orderName) {
          // use saved order name
        }
        if (!productImage && customOrder.imageUrls) {
          const imgs = JSON.parse(customOrder.imageUrls || "[]");
          if (imgs.length > 0) productImage = imgs[0];
        }
      }
    } catch (_) {}
  }

  return json({
    shop,
    orderId,
    orderName: orderName || (orderId ? `#${orderId}` : "Your Gift Order"),
    customerName,
    customerEmail,
    productTitle: productTitle || "Personalized Rebel Gift",
    productImage: productImage || "",
    productId: productId || (orderId ? `order-${orderId}` : "rebel-custom-gift"),
  });
};

export default function ReviewPage() {
  const data = useLoaderData<typeof loader>();

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [recommend, setRecommend] = useState<boolean>(true);
  const [name, setName] = useState<string>(data.customerName || "");
  const [email, setEmail] = useState<string>(data.customerEmail || "");
  const [reviewBody, setReviewBody] = useState<string>("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const starDescriptions: Record<number, { text: string; emoji: string; color: string }> = {
    1: { text: "Disappointed", emoji: "😞", color: "#ef4444" },
    2: { text: "Could be better", emoji: "😐", color: "#f97316" },
    3: { text: "Good gift", emoji: "🙂", color: "#eab308" },
    4: { text: "Loved it!", emoji: "😊💖", color: "#ec4899" },
    5: { text: "Obsessed & Loved it!", emoji: "🥹🌟❤️", color: "#f43f5e" },
  };

  const activeStar = hoverRating || rating || 5;

  // Handle Photo Uploads to Supabase Storage
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (mediaUrls.length + files.length > 8) {
      alert("You can upload a maximum of 8 unboxing photos.");
      return;
    }

    setIsUploading(true);
    setErrorMessage("");

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append("files", f));

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const resData = await res.json();
      if (resData.success && Array.isArray(resData.urls)) {
        setMediaUrls((prev) => [...prev, ...resData.urls]);
      } else {
        setErrorMessage(resData.error || "Failed to upload photo. Please try again.");
      }
    } catch (err) {
      setErrorMessage("Could not connect to photo uploader. Please check internet connection.");
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const removeMedia = (urlToRemove: string) => {
    setMediaUrls((prev) => prev.filter((u) => u !== urlToRemove));
  };

  // Submit Review
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!rating) {
      setErrorMessage("Please select a star rating (1 to 5 stars).");
      return;
    }
    if (!name.trim()) {
      setErrorMessage("Please tell us your name.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please provide a valid email so we can verify your order.");
      return;
    }
    if (!reviewBody.trim()) {
      setErrorMessage("Please share a few words about your gift experience.");
      return;
    }

    setIsSubmitting(true);

    try {
      const formattedTitle = `${data.productTitle} — ${
        recommend ? "Would Recommend! 🫶🏻" : "Honest Review"
      }`;

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop: data.shop,
          productId: data.productId,
          productHandle: "",
          authorName: name.trim(),
          authorEmail: email.trim(),
          rating,
          title: formattedTitle,
          reviewBody: reviewBody.trim(),
          mediaUrls,
          orderId: data.orderId,
          orderName: data.orderName,
        }),
      });

      const resData = await res.json();
      if (resData.success) {
        setIsSubmitted(true);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setErrorMessage(resData.error || "Submission failed. Please try again.");
      }
    } catch (err) {
      setErrorMessage("Network error while submitting. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rebel-review-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');

        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        body {
          font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background-color: #faf7f8;
          color: #1e293b;
          -webkit-font-smoothing: antialiased;
        }

        .rebel-review-root {
          min-height: 100vh;
          background: radial-gradient(100% 60% at 50% 0%, #ffe4e6 0%, #fff1f2 35%, #faf7f8 100%);
          padding: 24px 16px 64px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .rebel-container {
          width: 100%;
          max-width: 540px;
        }

        /* Top Brand Header */
        .rebel-brand-header {
          text-align: center;
          margin-bottom: 20px;
        }

        .rebel-brand-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(255, 255, 255, 0.9);
          border: 1px solid #fecdd3;
          border-radius: 999px;
          padding: 6px 14px;
          font-size: 13px;
          font-weight: 700;
          color: #e11d48;
          box-shadow: 0 2px 10px rgba(225, 29, 72, 0.08);
          margin-bottom: 12px;
          backdrop-filter: blur(8px);
        }

        .rebel-greeting-title {
          font-size: 26px;
          font-weight: 800;
          line-height: 1.25;
          color: #0f172a;
          margin-bottom: 8px;
          letter-spacing: -0.02em;
        }

        .rebel-greeting-subtitle {
          font-size: 14px;
          color: #475569;
          line-height: 1.5;
        }

        /* Main Card */
        .rebel-card {
          background: #ffffff;
          border-radius: 24px;
          padding: 24px 20px;
          box-shadow: 0 12px 36px -4px rgba(225, 29, 72, 0.08), 0 4px 16px -2px rgba(0, 0, 0, 0.04);
          border: 1px solid #ffe4e6;
          position: relative;
          overflow: hidden;
        }

        @media (min-width: 480px) {
          .rebel-card {
            padding: 32px 28px;
          }
        }

        /* Product Showcase */
        .rebel-prod-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 16px;
          background: #fff5f6;
          border: 1px solid #fed7aa2b;
          border-radius: 16px;
          margin-bottom: 24px;
        }

        .rebel-prod-img-wrap {
          width: 64px;
          height: 64px;
          border-radius: 12px;
          overflow: hidden;
          background: #ffffff;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #fecdd3;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        }

        .rebel-prod-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .rebel-prod-details {
          flex: 1;
          min-width: 0;
        }

        .rebel-prod-title {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        }

        .rebel-prod-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          color: #059669;
          background: #ecfdf5;
          padding: 2px 8px;
          border-radius: 6px;
          border: 1px solid #a7f3d0;
        }

        /* Section Block */
        .rebel-field-section {
          margin-bottom: 22px;
        }

        .rebel-field-label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #1e293b;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }

        .rebel-field-hint {
          font-size: 12px;
          color: #64748b;
          margin-top: 4px;
        }

        /* Interactive Stars */
        .rebel-stars-wrapper {
          display: flex;
          flex-direction: column;
          align-items: center;
          background: #fafaf9;
          border: 1px solid #f5f5f4;
          border-radius: 18px;
          padding: 16px 12px 14px;
          margin-bottom: 22px;
        }

        .rebel-stars-row {
          display: flex;
          gap: 10px;
          margin-bottom: 8px;
        }

        .rebel-star-btn {
          background: none;
          border: none;
          font-size: 40px;
          line-height: 1;
          cursor: pointer;
          color: #e2e8f0;
          transition: transform 0.18s cubic-bezier(0.175, 0.885, 0.32, 1.275), color 0.15s ease;
          user-select: none;
          padding: 4px;
          outline: none;
        }

        .rebel-star-btn:hover {
          transform: scale(1.22);
        }

        .rebel-star-btn.is-active {
          color: #f59e0b;
          filter: drop-shadow(0 2px 8px rgba(245, 158, 11, 0.4));
        }

        .rebel-star-feedback {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 14px;
          font-weight: 700;
          color: #f43f5e;
          animation: fadeIn 0.2s ease-in-out;
        }

        /* Recommend Pill Toggle */
        .rebel-recommend-box {
          display: flex;
          gap: 10px;
          margin-top: 6px;
        }

        .rebel-pill-btn {
          flex: 1;
          background: #ffffff;
          border: 1.5px solid #e2e8f0;
          padding: 12px 14px;
          border-radius: 14px;
          font-size: 13.5px;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s ease;
          font-family: inherit;
        }

        .rebel-pill-btn:hover {
          border-color: #f43f5e;
          background: #fff5f6;
        }

        .rebel-pill-btn.is-selected {
          border-color: #f43f5e;
          background: #ffe4e6;
          color: #be123c;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(244, 63, 94, 0.15);
        }

        /* Inputs & Textareas */
        .rebel-input,
        .rebel-textarea {
          width: 100%;
          border: 1.5px solid #e2e8f0;
          border-radius: 14px;
          padding: 12px 14px;
          font-size: 14px;
          color: #0f172a;
          background: #fafafa;
          transition: border-color 0.15s, background-color 0.15s, box-shadow 0.15s;
          font-family: inherit;
          outline: none;
        }

        .rebel-input:focus,
        .rebel-textarea:focus {
          border-color: #f43f5e;
          background: #ffffff;
          box-shadow: 0 0 0 4px rgba(244, 63, 94, 0.12);
        }

        .rebel-input-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          margin-bottom: 22px;
        }

        @media (min-width: 480px) {
          .rebel-input-grid {
            grid-template-columns: 1fr 1fr;
          }
        }

        /* Photo Upload Dropzone */
        .rebel-dropzone {
          border: 2px dashed #f472b6;
          background: #fff5f7;
          border-radius: 16px;
          padding: 20px 16px;
          text-align: center;
          cursor: pointer;
          position: relative;
          transition: all 0.2s;
        }

        .rebel-dropzone:hover {
          background: #ffe4e6;
          border-color: #e11d48;
        }

        .rebel-dropzone input[type="file"] {
          position: absolute;
          inset: 0;
          opacity: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }

        .rebel-dropzone-icon {
          font-size: 32px;
          margin-bottom: 6px;
          line-height: 1;
        }

        .rebel-dropzone-text {
          font-size: 13.5px;
          font-weight: 700;
          color: #be123c;
          margin-bottom: 2px;
        }

        .rebel-dropzone-sub {
          font-size: 12px;
          color: #9f1239;
          opacity: 0.8;
        }

        /* Upload Previews */
        .rebel-preview-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 10px;
          margin-top: 12px;
        }

        .rebel-preview-item {
          aspect-ratio: 1;
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          border: 1px solid #fbcfe8;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
        }

        .rebel-preview-item img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .rebel-preview-del {
          position: absolute;
          top: 4px;
          right: 4px;
          background: rgba(15, 23, 42, 0.75);
          color: #ffffff;
          border: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: background 0.15s;
        }

        .rebel-preview-del:hover {
          background: #e11d48;
        }

        /* Submit Button */
        .rebel-submit-btn {
          width: 100%;
          background: linear-gradient(135deg, #f43f5e 0%, #e11d48 100%);
          color: #ffffff;
          border: none;
          padding: 16px 20px;
          border-radius: 16px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          box-shadow: 0 8px 24px -4px rgba(225, 29, 72, 0.45);
          transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
          font-family: inherit;
          margin-top: 8px;
        }

        .rebel-submit-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 12px 28px -4px rgba(225, 29, 72, 0.6);
          filter: brightness(1.03);
        }

        .rebel-submit-btn:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        .rebel-error-banner {
          background: #fef2f2;
          border: 1px solid #fecaca;
          color: #b91c1c;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 16px;
          text-align: center;
        }

        /* Success Card */
        .rebel-success-card {
          text-align: center;
          padding: 36px 16px;
        }

        .rebel-success-icon {
          font-size: 56px;
          margin-bottom: 16px;
          animation: bounce 0.6s ease;
        }

        .rebel-success-title {
          font-size: 24px;
          font-weight: 800;
          color: #0f172a;
          margin-bottom: 8px;
        }

        .rebel-success-text {
          font-size: 14.5px;
          color: #475569;
          line-height: 1.6;
          max-width: 400px;
          margin: 0 auto 24px;
        }

        .rebel-store-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: #0f172a;
          color: #ffffff;
          padding: 14px 28px;
          border-radius: 999px;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.15);
          transition: transform 0.15s;
        }

        .rebel-store-btn:hover {
          transform: scale(1.03);
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.15); }
        }
      `}</style>

      <div className="rebel-container">
        {/* Top Brand Greeting */}
        <div className="rebel-brand-header">
          <div className="rebel-brand-badge">
            <span>🎁</span>
            <span>Rebel Gifts & Personalization</span>
          </div>
          <h1 className="rebel-greeting-title">
            Heyyy{name ? ` ${name.split(" ")[0]}` : ""}! 💌
          </h1>
          <p className="rebel-greeting-subtitle">
            Aapko apna Rebel Gifts order kaisa laga? 🥹❤️
            <br />
            Your honest review means the world to our gifting team! 🫶🏻
          </p>
        </div>

        {/* Card Body */}
        <div className="rebel-card">
          {isSubmitted ? (
            <div className="rebel-success-card">
              <div className="rebel-success-icon">🥹❤️🎉</div>
              <h2 className="rebel-success-title">Thank You So Much!</h2>
              <p className="rebel-success-text">
                Aapka honest review aur feedback successfully save ho gaya hai. Aapki
                khushi hi hamare liye sab kuch hai! 🫶🏻✨
              </p>
              <a
                href={`https://${data.shop}`}
                target="_blank"
                rel="noreferrer"
                className="rebel-store-btn"
              >
                <span>Visit Rebel Gifts Store</span>
                <span>🛍️</span>
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {errorMessage && <div className="rebel-error-banner">{errorMessage}</div>}

              {/* Product Showcase */}
              <div className="rebel-prod-banner">
                <div className="rebel-prod-img-wrap">
                  {data.productImage ? (
                    <img
                      src={data.productImage}
                      alt={data.productTitle}
                      className="rebel-prod-img"
                    />
                  ) : (
                    <span style={{ fontSize: "28px" }}>🎁</span>
                  )}
                </div>
                <div className="rebel-prod-details">
                  <div className="rebel-prod-title">{data.productTitle}</div>
                  <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                    <span className="rebel-prod-badge">
                      <span>✓</span>
                      <span>{data.orderName} Verified Purchase</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 1. Rating Stars */}
              <div className="rebel-stars-wrapper">
                <span className="rebel-field-label" style={{ marginBottom: "4px" }}>
                  Aapko Gift Kaisa Laga? Rate Karein:
                </span>
                <div className="rebel-stars-row">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`rebel-star-btn ${star <= activeStar ? "is-active" : ""}`}
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      aria-label={`${star} Star`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <div
                  className="rebel-star-feedback"
                  style={{ color: starDescriptions[activeStar]?.color }}
                >
                  <span>{starDescriptions[activeStar]?.emoji}</span>
                  <span>{starDescriptions[activeStar]?.text}</span>
                </div>
              </div>

              {/* 2. Would you recommend to friends? */}
              <div className="rebel-field-section">
                <label className="rebel-field-label">
                  Would you recommend us to your friends? 🫶🏻
                </label>
                <div className="rebel-recommend-box">
                  <button
                    type="button"
                    className={`rebel-pill-btn ${recommend ? "is-selected" : ""}`}
                    onClick={() => setRecommend(true)}
                  >
                    <span>Yes, absolutely! 🫶🏻</span>
                  </button>
                  <button
                    type="button"
                    className={`rebel-pill-btn ${!recommend ? "is-selected" : ""}`}
                    onClick={() => setRecommend(false)}
                  >
                    <span>Maybe / Not sure</span>
                  </button>
                </div>
              </div>

              {/* 3. Review Body */}
              <div className="rebel-field-section">
                <label className="rebel-field-label" htmlFor="rebel-review-body">
                  Your Honest Review & Unboxing Experience 📝
                </label>
                <textarea
                  id="rebel-review-body"
                  className="rebel-textarea"
                  rows={4}
                  placeholder="Tell us what you loved about the print quality, finishing, packaging and delivery... 🥹❤️"
                  value={reviewBody}
                  onChange={(e) => setReviewBody(e.target.value)}
                />
              </div>

              {/* 4. Photo & Media Upload */}
              <div className="rebel-field-section">
                <label className="rebel-field-label">
                  Unboxing Photos / Gift Pictures (Optional) 📸
                </label>
                <div className="rebel-dropzone">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/jpg"
                    multiple
                    onChange={handleFileUpload}
                    disabled={isUploading}
                  />
                  <div className="rebel-dropzone-icon">📸</div>
                  <div className="rebel-dropzone-text">
                    {isUploading ? "Uploading photos... please wait ⏳" : "Tap here to add photos from gallery or camera"}
                  </div>
                  <div className="rebel-dropzone-sub">
                    Show the gift unboxing or finishing (up to 8 photos)
                  </div>
                </div>

                {mediaUrls.length > 0 && (
                  <div className="rebel-preview-grid">
                    {mediaUrls.map((url, idx) => (
                      <div key={idx} className="rebel-preview-item">
                        <img src={url} alt={`Unboxing ${idx + 1}`} />
                        <button
                          type="button"
                          className="rebel-preview-del"
                          onClick={() => removeMedia(url)}
                          title="Remove photo"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 5. Customer Details */}
              <div className="rebel-input-grid">
                <div>
                  <label className="rebel-field-label" htmlFor="rebel-cust-name">
                    Your Name
                  </label>
                  <input
                    id="rebel-cust-name"
                    type="text"
                    className="rebel-input"
                    placeholder="e.g. Rahul Sharma"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="rebel-field-label" htmlFor="rebel-cust-email">
                    Email Address
                  </label>
                  <input
                    id="rebel-cust-email"
                    type="email"
                    className="rebel-input"
                    placeholder="e.g. rahul@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {/* Submit CTA */}
              <button
                type="submit"
                className="rebel-submit-btn"
                disabled={isSubmitting || isUploading}
              >
                {isSubmitting ? (
                  <span>Submitting Review... ⏳</span>
                ) : (
                  <>
                    <span>Submit Honest Review 💌</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
