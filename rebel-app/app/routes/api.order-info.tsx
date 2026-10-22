import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { prisma, unauthenticated } from "../shopify.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const orderId = url.searchParams.get("orderId") || url.searchParams.get("order_id");

  if (!shop || !orderId) {
    return json(
      { success: false, error: "Missing shop or orderId" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const cleanOrderId = orderId.replace(/^gid:\/\/shopify\/Order\//, "");

  // 1. Check local orderCustomization first
  const customOrder = await prisma.orderCustomization.findFirst({
    where: {
      shopDomain: shop,
      orderId: cleanOrderId,
    },
  });

  let productTitle = "Personalized Rebel Gift";
  let productImage = "";
  let orderName = customOrder?.orderName || `#${cleanOrderId}`;
  let customerName = "";
  let customerEmail = "";

  // 2. Try to fetch rich order info via Shopify unauthenticated storefront or admin session if available
  try {
    const session = await prisma.session.findFirst({
      where: { shop },
      orderBy: { id: "desc" },
    });

    if (session?.accessToken) {
      const shopifyApiUrl = `https://${shop}/admin/api/2024-10/graphql.json`;
      const query = `#graphql
        query getOrderForReview($id: ID!) {
          order(id: $id) {
            id
            name
            displayFulfillmentStatus
            customer {
              firstName
              lastName
              displayName
              email
            }
            shippingAddress {
              name
            }
            lineItems(first: 5) {
              edges {
                node {
                  title
                  image {
                    url
                  }
                  product {
                    title
                    featuredImage {
                      url
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const res = await fetch(shopifyApiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": session.accessToken,
        },
        body: JSON.stringify({
          query,
          variables: { id: `gid://shopify/Order/${cleanOrderId}` },
        }),
      });

      const data = await res.json();
      const order = data?.data?.order;
      if (order) {
        orderName = order.name || orderName;
        customerName =
          order.customer?.displayName ||
          [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(" ") ||
          order.shippingAddress?.name ||
          "";
        customerEmail = order.customer?.email || "";

        const firstItem = order.lineItems?.edges?.[0]?.node;
        if (firstItem) {
          productTitle = firstItem.product?.title || firstItem.title || productTitle;
          productImage = firstItem.image?.url || firstItem.product?.featuredImage?.url || "";
        }
      }
    }
  } catch (err) {
    console.warn("[api.order-info] Fallback to standard details:", err);
  }

  // 3. Fallback: if customOrder has uploaded reference images, use first image as preview
  if (!productImage && customOrder?.imageUrls) {
    try {
      const parsed = JSON.parse(customOrder.imageUrls);
      if (Array.isArray(parsed) && parsed.length > 0) {
        productImage = parsed[0];
      }
    } catch (_) {}
  }

  return json(
    {
      success: true,
      order: {
        orderId: cleanOrderId,
        orderName,
        customerName,
        customerEmail,
        productTitle,
        productImage,
      },
    },
    { headers: CORS_HEADERS }
  );
};
