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
  await authenticate.admin(request);
  return json({ apiKey: process.env.SHOPIFY_API_KEY || "" });
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

        /* Floating Loading Indicator Pill */
        .rebel-global-pill {
          position: fixed;
          top: 14px;
          right: 20px;
          background: #0f172a;
          color: #ffffff;
          padding: 8px 16px;
          border-radius: 999px;
          font-size: 13px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 99999999;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
          animation: rebelSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .rebel-global-spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #f43f5e;
          border-radius: 50%;
          animation: rebelSpin 0.7s linear infinite;
        }

        @keyframes rebelSlide {
          0% { background-position: 100% 0; }
          100% { background-position: -100% 0; }
        }

        @keyframes rebelSpin {
          to { transform: rotate(360deg); }
        }

        @keyframes rebelSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Global Loading Indicators */}
      {isLoading && (
        <>
          <div className="rebel-global-topbar" />
          <div className="rebel-global-pill">
            <span className="rebel-global-spinner" />
            <span>Loading... please wait ⏳</span>
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
          opacity: isLoading ? 0.6 : 1,
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
  return boundary.error(useRouteError());
}

export const headers = (headersArgs: any) => {
  return boundary.headers(headersArgs);
};
