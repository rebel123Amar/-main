import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return {
    shopDomain: "rebel-gifts-dev.myshopify.com",
    appUrl: process.env.SHOPIFY_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"),
  };
};

export default function Index() {
  const { shopDomain } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(135deg, #111827 0%, #1f2937 100%)",
        color: "#f9fafb",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "16px",
          padding: "40px",
          maxWidth: "520px",
          width: "100%",
          boxShadow: "0 20px 40px rgba(0, 0, 0, 0.4)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "64px",
            height: "64px",
            borderRadius: "50%",
            background: "rgba(255, 255, 255, 0.1)",
            fontSize: "32px",
            marginBottom: "20px",
          }}
        >
          🎁
        </div>

        <h1
          style={{
            fontSize: "26px",
            fontWeight: "700",
            marginBottom: "10px",
            letterSpacing: "-0.02em",
          }}
        >
          Rebel Gifts Custom App
        </h1>

        <p
          style={{
            color: "#9ca3af",
            fontSize: "14px",
            lineHeight: "1.6",
            marginBottom: "28px",
          }}
        >
          Custom Shopify app featuring <strong>Cart Customization</strong>,{" "}
          <strong>Multi-Image Uploads</strong>, and{" "}
          <strong>Product Reviews</strong> with moderation.
        </p>

        <div
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: "10px",
            padding: "16px",
            marginBottom: "24px",
            textAlign: "left",
            fontSize: "13px",
          }}
        >
          <div
            style={{
              fontWeight: "600",
              color: "#e5e7eb",
              marginBottom: "8px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "#10b981",
                display: "inline-block",
              }}
            />
            Server Status: Active & Ready
          </div>
          <p style={{ margin: "0 0 10px 0", color: "#9ca3af" }}>
            This is an embedded Shopify app. Open it from Shopify Admin to view the
            merchant dashboard.
          </p>
          <a
            href={`https://admin.shopify.com/store/rebel-gifts-dev/apps/71e800405c3122df8cf8c81daaa6b6b6`}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-block",
              color: "#60a5fa",
              textDecoration: "none",
              fontWeight: "500",
            }}
          >
            Open in Shopify Admin &rarr;
          </a>
        </div>

        <Form
          method="post"
          action="/auth/login"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "12px",
          }}
        >
          <input
            type="text"
            name="shop"
            defaultValue={shopDomain}
            placeholder="store-name.myshopify.com"
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid rgba(255, 255, 255, 0.2)",
              background: "rgba(255, 255, 255, 0.08)",
              color: "#fff",
              fontSize: "14px",
              outline: "none",
              textAlign: "center",
            }}
          />
          <button
            type="submit"
            style={{
              padding: "12px 20px",
              borderRadius: "8px",
              border: "none",
              background: "#ffffff",
              color: "#111827",
              fontWeight: "600",
              fontSize: "14px",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
          >
            Log In via Shopify
          </button>
        </Form>
      </div>
    </div>
  );
}
