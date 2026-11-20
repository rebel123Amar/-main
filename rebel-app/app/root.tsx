import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "@remix-run/react";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "preconnect", href: "https://cdn.shopify.com" },
  { rel: "stylesheet", href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css" },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" type="image/x-icon" href="data:image/x-icon;base64," />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : JSON.stringify(error);

  const isDbError =
    errorMessage.toLowerCase().includes("database") ||
    errorMessage.toLowerCase().includes("prisma") ||
    errorMessage.toLowerCase().includes("supabase") ||
    errorMessage.toLowerCase().includes("pooler") ||
    errorMessage.toLowerCase().includes("can't reach database server");

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Rebel Custom App — Notice</title>
        <Links />
      </head>
      <body
        style={{
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
          margin: 0,
          padding: "40px 20px",
          background: "#f8fafc",
          color: "#0f172a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
        }}
      >
        <div
          style={{
            maxWidth: "540px",
            width: "100%",
            background: "#ffffff",
            borderRadius: "16px",
            padding: "36px 32px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            border: "1px solid #e2e8f0",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              borderRadius: "50%",
              background: isDbError ? "#fef3c7" : "#fee2e2",
              color: isDbError ? "#d97706" : "#dc2626",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              marginBottom: "16px",
            }}
          >
            {isDbError ? "⚡" : "⚠️"}
          </div>

          <h2 style={{ fontSize: "20px", fontWeight: "800", margin: "0 0 10px 0", color: "#0f172a" }}>
            {isDbError ? "Database Server Sleeping or Paused" : "Application Temporary Issue"}
          </h2>

          <p style={{ fontSize: "14px", color: "#64748b", lineHeight: "1.6", margin: "0 0 20px 0" }}>
            {isDbError
              ? "Your Supabase PostgreSQL database project appears to be paused due to free-tier inactivity or reconnecting. Please unpause/restore it in the Supabase Dashboard, then click Reload."
              : "A temporary issue occurred while loading this view. Please click the button below to reload."}
          </p>

          <div
            style={{
              background: "#f1f5f9",
              borderRadius: "8px",
              padding: "12px",
              fontSize: "12px",
              fontFamily: "monospace",
              color: "#475569",
              wordBreak: "break-all",
              textAlign: "left",
              marginBottom: "24px",
              maxHeight: "110px",
              overflowY: "auto",
            }}
          >
            {errorMessage}
          </div>

          <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "12px 22px",
                borderRadius: "8px",
                border: "none",
                background: "#0f172a",
                color: "#ffffff",
                fontWeight: "700",
                fontSize: "14px",
                cursor: "pointer",
                transition: "opacity 0.2s",
              }}
            >
              🔄 Reload App
            </button>
            {isDbError && (
              <a
                href="https://supabase.com/dashboard"
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "12px 22px",
                  borderRadius: "8px",
                  border: "1px solid #cbd5e1",
                  background: "#ffffff",
                  color: "#0f172a",
                  fontWeight: "700",
                  fontSize: "14px",
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                Go to Supabase Dashboard ➔
              </a>
            )}
          </div>
        </div>
        <Scripts />
      </body>
    </html>
  );
}
