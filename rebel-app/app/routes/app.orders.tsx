import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Divider,
  EmptyState,
  Pagination,
  Badge,
  Button,
  Banner,
  Modal,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate, prisma } from "../shopify.server";
import { handleOrderCreate } from "../order-customization.server";

const ORDERS_PER_PAGE = 10;

// Helper to sync recent orders from Shopify Admin GraphQL API
async function syncRecentOrdersFromShopify(admin: any, shop: string) {
  try {
    const response = await admin.graphql(
      `#graphql
      query getRecentOrders {
        orders(first: 20, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              note
              customAttributes {
                key
                value
              }
            }
          }
        }
      }`
    );

    const jsonRes = await response.json();
    const edges = jsonRes?.data?.orders?.edges || [];

    for (const edge of edges) {
      const node = edge.node;
      const orderId = node.id.replace("gid://shopify/Order/", "");
      const noteAttributes = (node.customAttributes || []).map((attr: any) => ({
        name: attr.key,
        value: attr.value,
      }));

      await handleOrderCreate(shop, {
        id: orderId,
        name: node.name,
        note: node.note,
        note_attributes: noteAttributes,
      });
    }
  } catch (err) {
    console.error("[Orders Sync Error]", err);
  }
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const shop = session.shop;

  // Sync recent orders from Shopify on load
  await syncRecentOrdersFromShopify(admin, shop);

  const where = { shopDomain: shop };

  const [orders, total] = await Promise.all([
    prisma.orderCustomization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PER_PAGE,
      take: ORDERS_PER_PAGE,
    }),
    prisma.orderCustomization.count({ where }),
  ]);

  return json({
    orders,
    total,
    page,
    totalPages: Math.ceil(total / ORDERS_PER_PAGE) || 1,
    shop,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "sync") {
    await syncRecentOrdersFromShopify(admin, session.shop);
    return json({ success: true, message: "Orders synced successfully with Shopify!" });
  }

  return json({ success: true });
};

export default function OrdersPage() {
  const { orders, total, page, totalPages, shop } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSyncing = navigation.state === "submitting";

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  return (
    <Page
      title="Custom Orders & Uploads"
      subtitle={`${total} order${total !== 1 ? "s" : ""} with customer reference images or special instructions`}
      primaryAction={{
        content: isSyncing ? "Syncing..." : "Sync from Shopify",
        loading: isSyncing,
        onAction: () => submit({ intent: "sync" }, { method: "post" }),
      }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              {orders.length === 0 ? (
                <EmptyState
                  heading="No custom requests yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{
                    content: "Sync Orders Now",
                    onAction: () => submit({ intent: "sync" }, { method: "post" }),
                  }}
                >
                  <p>
                    When customers enter special instructions or upload reference images in the
                    cart, their details will automatically be linked and shown here.
                  </p>
                </EmptyState>
              ) : (
                <BlockStack gap="400">
                  {orders.map((order) => {
                    let images: string[] = [];
                    try {
                      images = JSON.parse(order.imageUrls || "[]");
                    } catch (_) {
                      images = [];
                    }

                    const hasRequest = Boolean(order.specialRequest && order.specialRequest.trim());
                    const hasImages = images.length > 0;
                    const cleanShopDomain = shop.replace(".myshopify.com", "");
                    const shopifyAdminOrderUrl = `https://admin.shopify.com/store/${cleanShopDomain}/orders/${order.orderId}`;

                    return (
                      <div
                        key={order.id}
                        style={{
                          padding: 18,
                          borderRadius: 10,
                          border: "1px solid #e1e3e5",
                          background: "#ffffff",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
                        }}
                      >
                        {/* Order Header */}
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="headingSm" as="h4">
                                {order.orderName || `Order #${order.orderId}`}
                              </Text>
                              <Button
                                url={shopifyAdminOrderUrl}
                                target="_blank"
                                variant="plain"
                                size="micro"
                              >
                                View in Shopify Admin ↗
                              </Button>
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Received on{" "}
                              {new Date(order.createdAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          </BlockStack>

                          <InlineStack gap="200">
                            {hasRequest && <Badge tone="info">Special Instructions</Badge>}
                            {hasImages && (
                              <Badge tone="success">
                                {`${images.length} Image${images.length > 1 ? "s" : ""}`}
                              </Badge>
                            )}
                          </InlineStack>
                        </InlineStack>

                        <Divider />

                        {/* Special Instructions */}
                        {hasRequest && (
                          <div style={{ marginTop: 12 }}>
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                  ✏️ Special Instructions:
                                </Text>
                                <Button
                                  size="micro"
                                  variant="plain"
                                  onClick={() => handleCopy(order.specialRequest, `req-${order.id}`)}
                                >
                                  {copiedIndex === `req-${order.id}` ? "Copied!" : "Copy Text"}
                                </Button>
                              </InlineStack>
                              <div
                                style={{
                                  padding: "12px 14px",
                                  background: "#f9fafb",
                                  borderRadius: 8,
                                  border: "1px solid #e5e7eb",
                                  whiteSpace: "pre-wrap",
                                  fontSize: "13px",
                                  lineHeight: "1.5",
                                  color: "#111827",
                                }}
                              >
                                {order.specialRequest}
                              </div>
                            </BlockStack>
                          </div>
                        )}

                        {/* Uploaded Reference Images */}
                        {hasImages && (
                          <div style={{ marginTop: 14 }}>
                            <BlockStack gap="200">
                              <Text as="p" variant="bodySm" fontWeight="semibold">
                                🖼️ Customer Uploaded Images ({images.length}):
                              </Text>
                            <div
                              style={{
                                display: "flex",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              {images.map((url, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 6,
                                  }}
                                >
                                  <div
                                    onClick={() => setSelectedImage(url)}
                                    style={{
                                      width: 90,
                                      height: 90,
                                      borderRadius: 8,
                                      overflow: "hidden",
                                      border: "1.5px solid #d1d5db",
                                      cursor: "pointer",
                                      background: "#f3f4f6",
                                      boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                      transition: "transform 0.15s, border-color 0.15s",
                                    }}
                                    title="Click to view full image"
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.transform = "scale(1.03)";
                                      e.currentTarget.style.borderColor = "#111";
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.transform = "scale(1)";
                                      e.currentTarget.style.borderColor = "#d1d5db";
                                    }}
                                  >
                                    <img
                                      src={url}
                                      alt={`Order upload ${i + 1}`}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                      }}
                                    />
                                  </div>
                                  <InlineStack gap="100">
                                    <a
                                      href={url}
                                      target="_blank"
                                      rel="noreferrer"
                                      style={{
                                        fontSize: "11px",
                                        color: "#2563eb",
                                        textDecoration: "underline",
                                      }}
                                    >
                                      Full Size
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => handleCopy(url, `url-${order.id}-${i}`)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                        cursor: "pointer",
                                        fontSize: "11px",
                                        color: "#6b7280",
                                        textDecoration: "underline",
                                      }}
                                    >
                                      {copiedIndex === `url-${order.id}-${i}` ? "Copied" : "Copy URL"}
                                    </button>
                                  </InlineStack>
                                </div>
                              ))}
                            </div>
                          </BlockStack>
                        </div>
                      )}
                      </div>
                    );
                  })}
                </BlockStack>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() =>
                      submit({ page: String(page - 1) }, { method: "get" })
                    }
                    hasNext={page < totalPages}
                    onNext={() =>
                      submit({ page: String(page + 1) }, { method: "get" })
                    }
                  />
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>

      {/* Lightbox Modal */}
      {selectedImage && (
        <Modal
          open={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          title="Reference Image Preview"
          primaryAction={{
            content: "Open in New Tab",
            onAction: () => window.open(selectedImage, "_blank"),
          }}
          secondaryActions={[
            {
              content: "Close",
              onAction: () => setSelectedImage(null),
            },
          ]}
        >
          <Modal.Section>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "#000",
                borderRadius: 8,
                overflow: "hidden",
                maxHeight: "70vh",
              }}
            >
              <img
                src={selectedImage}
                alt="Enlarged reference"
                style={{
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  objectFit: "contain",
                }}
              />
            </div>
            <div style={{ marginTop: 12, wordBreak: "break-all", fontSize: "12px", color: "#666" }}>
              <strong>URL:</strong> {selectedImage}
            </div>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
