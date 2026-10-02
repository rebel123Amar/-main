import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma } from "../shopify.server";
import { handleOrderCreate } from "../order-customization.server";
import crypto from "crypto";

// Verify Shopify webhook HMAC
function verifyWebhook(rawBody: string, hmacHeader: string | null): boolean {
  if (!hmacHeader) return false;
  const digest = crypto
    .createHmac("sha256", process.env.SHOPIFY_API_SECRET!)
    .update(rawBody, "utf8")
    .digest("base64");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const topic = request.headers.get("X-Shopify-Topic");
  const shop = request.headers.get("X-Shopify-Shop-Domain");
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");
  const rawBody = await request.text();

  if (process.env.SHOPIFY_API_SECRET && !verifyWebhook(rawBody, hmac)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  switch (topic) {
    case "orders/create":
    case "orders/updated": {
      await handleOrderCreate(shop || payload?.domain || "rebel-gifts-dev.myshopify.com", payload);
      break;
    }
    case "app/uninstalled": {
      if (shop) {
        await Promise.all([
          prisma.review.deleteMany({ where: { shopDomain: shop } }),
          prisma.orderCustomization.deleteMany({ where: { shopDomain: shop } }),
          prisma.appSettings.deleteMany({ where: { shopDomain: shop } }),
        ]);
      }
      break;
    }
    default:
      break;
  }

  return json({ received: true });
};
