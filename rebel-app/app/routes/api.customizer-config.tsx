import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

// CORS headers to allow storefront fetch requests
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders() });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  let productId = url.searchParams.get("productId") || url.searchParams.get("id");
  const handle = url.searchParams.get("handle");

  if (!shop || (!productId && !handle)) {
    return json(
      { error: "Missing shop and productId/handle parameter" },
      { status: 400, headers: corsHeaders() }
    );
  }

  try {
    const { admin } = await unauthenticated.admin(shop);

    // Format productId to GID if numeric
    if (productId && !productId.startsWith("gid://")) {
      productId = `gid://shopify/Product/${productId}`;
    }

    let query = "";
    let variables = {};

    if (productId) {
      query = `#graphql
        query getProductConfig($id: ID!) {
          product(id: $id) {
            id
            title
            tags
            metafield(namespace: "rebel_customizer", key: "config") {
              value
            }
          }
        }
      `;
      variables = { id: productId };
    } else if (handle) {
      query = `#graphql
        query getProductConfigByHandle($handle: String!) {
          productByHandle(handle: $handle) {
            id
            title
            tags
            metafield(namespace: "rebel_customizer", key: "config") {
              value
            }
          }
        }
      `;
      variables = { handle };
    }

    const response = await admin.graphql(query, { variables });
    const resJson = await response.json();
    const product = resJson.data?.product || resJson.data?.productByHandle;

    if (!product) {
      return json(
        { error: "Product not found" },
        { status: 404, headers: corsHeaders() }
      );
    }

    let config = null;
    if (product.metafield?.value) {
      try {
        config = JSON.parse(product.metafield.value);
      } catch (e) {
        config = null;
      }
    }

    return json(
      {
        success: true,
        productId: product.id,
        tags: product.tags,
        config,
      },
      { headers: corsHeaders() }
    );
  } catch (err: any) {
    console.error("Error in api.customizer-config:", err);
    return json(
      { error: err.message || "Failed to fetch customizer config" },
      { status: 500, headers: corsHeaders() }
    );
  }
};
