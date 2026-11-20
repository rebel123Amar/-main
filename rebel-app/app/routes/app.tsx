import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError, useNavigation } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import type { LinksFunction } from "@remix-run/node";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
    return json({ apiKey: process.env.SHOPIFY_API_KEY || "", authError: null });
  } catch (err: any) {
    // If it's a Response (like redirect to auth), rethrow so Remix handles it
    if (err instanceof Response) throw err;
    console.error("[App Root Loader Error]", err);
    return json({ apiKey: process.env.SHOPIFY_API_KEY || "", authError: err.message || "Authentication error" });
  }
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isLoading = navigation.state !== "idle";

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <style>{`
        /* Top Animated Progress Bar */
        .rebel-global-topbar {
          position: fixed;
          top: 0;
          left: 0;
          height: 4px;
          width: 100%;
          background: linear-gradient(90deg, #f43f5e 0%, #fb7185 50%, #e11d48 100%);
          background-size: 200% 100%;
          animation: rebelSlide 1s infinite linear;
          z-index: 99999999;
          box-shadow: 0 0 10px rgba(244, 63, 94, 0.7);
        }

        /* Full Screen Animated Loading Overlay */
        .rebel-loading-overlay {
          position: fixed;
          inset: 0;
          background: rgba(255, 255, 255, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          z-index: 99999999;
          animation: fadeIn 0.2s ease;
        }

        .rebel-loading-box {
          background: #ffffff;
          padding: 30px 42px;
          border-radius: 18px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.12);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          border: 1px solid rgba(0, 0, 0, 0.08);
          text-align: center;
        }

        .rebel-spin-circle {
          width: 40px;
          height: 40px;
          border: 3.5px solid #f1f5f9;
          border-top-color: #e11d48;
          border-radius: 50%;
          animation: spin 0.75s linear infinite;
        }

        @keyframes rebelSlide {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* Global Interactive Loading Screen */}
      {isLoading && (
        <>
          <div className="rebel-global-topbar" />
          <div className="rebel-loading-overlay">
            <div className="rebel-loading-box">
              <div className="rebel-spin-circle" />
              <div>
                <h4 style={{ margin: "0 0 6px 0", fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>
                  Loading Rebel Custom App...
                </h4>
                <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>
                  Connecting to Shopify & fetching your data ⏳
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/customizer">Product Customizer</a>
        <a href="/app/reviews">Reviews</a>
        <a href="/app/orders">Orders</a>
        <a href="/app/settings">Settings</a>
      </NavMenu>

      <div
        style={{
          opacity: isLoading ? 0.35 : 1,
          transition: "opacity 0.2s ease",
          pointerEvents: isLoading ? "none" : "auto",
        }}
      >
        <Outlet />
      </div>
    </AppProvider>
  );
}

// Boundary handlers for Shopify app
export function ErrorBoundary() {
  const error = useRouteError();
  const msg = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error);
  const isDb = msg.toLowerCase().includes("database") || msg.toLowerCase().includes("supabase") || msg.toLowerCase().includes("pooler");

  return (
    <div style={{ padding: "40px 20px", maxWidth: "600px", margin: "40px auto", textAlign: "center" }}>
      <div style={{ background: "#ffffff", padding: "32px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.08)", border: "1px solid #e2e8f0" }}>
        <div style={{ fontSize: "32px", marginBottom: "12px" }}>{isDb ? "⚡" : "⚠️"}</div>
        <h3 style={{ fontSize: "18px", fontWeight: "700", marginBottom: "8px", color: "#0f172a" }}>
          {isDb ? "Database Server is Paused or Connecting" : "Application Notice"}
        </h3>
        <p style={{ fontSize: "13.5px", color: "#64748b", lineHeight: "1.5", marginBottom: "18px" }}>
          {isDb
            ? "Your Supabase PostgreSQL project is sleeping or paused. Please click 'Restore project' in the Supabase Dashboard, then click Refresh below."
            : "An unexpected error occurred while loading this view."}
        </p>
        <div style={{ background: "#f8fafc", padding: "10px", borderRadius: "8px", fontSize: "12px", fontFamily: "monospace", color: "#475569", marginBottom: "20px", wordBreak: "break-all" }}>
          {msg}
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <button
            onClick={() => window.location.reload()}
            style={{ padding: "10px 20px", borderRadius: "8px", border: "none", background: "#0f172a", color: "#fff", fontWeight: "700", fontSize: "13px", cursor: "pointer" }}
          >
            🔄 Refresh App
          </button>
          {isDb && (
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              style={{ padding: "10px 20px", borderRadius: "8px", border: "1px solid #cbd5e1", background: "#fff", color: "#0f172a", fontWeight: "700", fontSize: "13px", textDecoration: "none" }}
            >
              Supabase Dashboard ➔
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export const headers = (headersArgs: any) => {
  return boundary.headers(headersArgs);
};
