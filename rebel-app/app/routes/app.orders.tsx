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
  ButtonGroup,
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
              lineItems(first: 20) {
                edges {
                  node {
                    id
                    title
                    customAttributes {
                      key
                      value
                    }
                  }
                }
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

      const lineItems = (node.lineItems?.edges || []).map((le: any) => ({
        title: le.node.title,
        properties: (le.node.customAttributes || []).map((attr: any) => ({
          name: attr.key,
          value: attr.value,
        })),
      }));

      await handleOrderCreate(shop, {
        id: orderId,
        name: node.name,
        note: node.note,
        note_attributes: noteAttributes,
        line_items: lineItems,
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

  const [selectedImage, setSelectedImage] = useState<{
    url: string;
    orderName: string;
    index: number;
  } | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);
  const [downloadingZipId, setDownloadingZipId] = useState<string | null>(null);
  const [downloadingUrl, setDownloadingUrl] = useState<string | null>(null);

  const handleCopy = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(id);
    setTimeout(() => setCopiedIndex(null), 2000);
  }, []);

  // Download a single customer image via our proxy endpoint
  const handleDownloadSingle = useCallback((url: string, baseFilename: string) => {
    setDownloadingUrl(url);
    const cleanFilename = baseFilename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const downloadUrl = `/api/download-image?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(cleanFilename)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.setAttribute("download", `${cleanFilename}.jpg`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingUrl(null), 1000);
  }, []);

  // Download all images of an order bundled into a single ZIP archive
  const handleDownloadZip = useCallback((urls: string[], orderName: string, orderId: string) => {
    setDownloadingZipId(orderId);
    const safeOrderName = (orderName || `Order_${orderId}`).replace(/[^a-zA-Z0-9_-]/g, "_");
    const downloadUrl = `/api/download-zip?orderName=${encodeURIComponent(safeOrderName)}&urls=${encodeURIComponent(JSON.stringify(urls))}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingZipId(null), 2500);
  }, []);

  // Download all individual images one by one with a slight stagger
  const handleDownloadAllIndividual = useCallback(async (urls: string[], orderName: string) => {
    const safeOrderName = (orderName || "order").replace(/[^a-zA-Z0-9_-]/g, "_");
    for (let i = 0; i < urls.length; i++) {
      handleDownloadSingle(urls[i], `${safeOrderName}_photo_${i + 1}`);
      if (i < urls.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }
  }, [handleDownloadSingle]);

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

                        {/* Quick Post-Delivery Review Request */}
                        <div
                          style={{
                            marginTop: 10,
                            marginBottom: 8,
                            padding: "8px 12px",
                            background: "#fefce8",
                            borderRadius: 8,
                            border: "1px solid #fef08a",
                          }}
                        >
                          <InlineStack align="space-between" blockAlign="center">
                            <InlineStack gap="150" blockAlign="center">
                              <Text as="span" variant="bodySm" fontWeight="semibold">
                                ⭐ Post-Delivery Review:
                              </Text>
                              <Text as="span" variant="bodySm" tone="subdued">
                                Ask customer for rating & unboxing photos
                              </Text>
                            </InlineStack>
                            <InlineStack gap="200" blockAlign="center">
                              <Button
                                size="micro"
                                url={`https://wa.me/?text=${encodeURIComponent(
                                  `Hi! Hope you loved your order ${order.orderName || ''} from Rebel Gifts. We would love your review and unboxing photos! Please rate your experience here: https://${shop}/?review_order=${order.orderId}`
                                )}`}
                                target="_blank"
                              >
                                📱 WhatsApp Review Link
                              </Button>
                              <Button
                                size="micro"
                                variant="plain"
                                onClick={() =>
                                  handleCopy(
                                    `https://${shop}/?review_order=${order.orderId}`,
                                    `rev-${order.id}`
                                  )
                                }
                              >
                                {copiedIndex === `rev-${order.id}` ? "Copied Link!" : "📋 Copy Link"}
                              </Button>
                            </InlineStack>
                          </InlineStack>
                        </div>

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
                          <div
                            style={{
                              marginTop: 14,
                              padding: "14px 16px",
                              background: "#f8fafc",
                              borderRadius: 10,
                              border: "1px solid #e2e8f0",
                            }}
                          >
                            <BlockStack gap="300">
                              <InlineStack align="space-between" blockAlign="center">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="p" variant="bodySm" fontWeight="semibold">
                                    🖼️ Customer Uploaded Images ({images.length}):
                                  </Text>
                                  <Badge tone="success">{`${images.length} Image${images.length > 1 ? "s" : ""}`}</Badge>
                                </InlineStack>

                                <InlineStack gap="200" blockAlign="center">
                                  {images.length > 1 ? (
                                    <ButtonGroup>
                                      <Button
                                        size="slim"
                                        variant="primary"
                                        loading={downloadingZipId === order.id}
                                        onClick={() =>
                                          handleDownloadZip(
                                            images,
                                            order.orderName || `Order_${order.orderId}`,
                                            order.id
                                          )
                                        }
                                      >
                                        📦 Download All (ZIP)
                                      </Button>
                                      <Button
                                        size="slim"
                                        onClick={() =>
                                          handleDownloadAllIndividual(
                                            images,
                                            order.orderName || `Order_${order.orderId}`
                                          )
                                        }
                                      >
                                        ⬇️ Download Each
                                      </Button>
                                    </ButtonGroup>
                                  ) : (
                                    <Button
                                      size="slim"
                                      variant="primary"
                                      loading={downloadingUrl === images[0]}
                                      onClick={() =>
                                        handleDownloadSingle(
                                          images[0],
                                          `${order.orderName || `Order_${order.orderId}`}_photo_1`
                                        )
                                      }
                                    >
                                      ⬇️ Download Photo
                                    </Button>
                                  )}
                                </InlineStack>
                              </InlineStack>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 14,
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
                                      padding: "8px",
                                      background: "#ffffff",
                                      borderRadius: 8,
                                      border: "1px solid #e2e8f0",
                                      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                                    }}
                                  >
                                    <div
                                      onClick={() =>
                                        setSelectedImage({
                                          url,
                                          orderName: order.orderName || `Order_${order.orderId}`,
                                          index: i,
                                        })
                                      }
                                      style={{
                                        width: 100,
                                        height: 100,
                                        borderRadius: 6,
                                        overflow: "hidden",
                                        border: "1.5px solid #cbd5e1",
                                        cursor: "pointer",
                                        background: "#f1f5f9",
                                        position: "relative",
                                        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                                        transition: "transform 0.15s, border-color 0.15s",
                                      }}
                                      title="Click to view full image"
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.transform = "scale(1.03)";
                                        e.currentTarget.style.borderColor = "#0f172a";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.transform = "scale(1)";
                                        e.currentTarget.style.borderColor = "#cbd5e1";
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
                                      <span
                                        style={{
                                          position: "absolute",
                                          bottom: 4,
                                          right: 4,
                                          background: "rgba(0,0,0,0.7)",
                                          color: "#ffffff",
                                          fontSize: "10px",
                                          padding: "1px 5px",
                                          borderRadius: 3,
                                          fontWeight: "bold",
                                        }}
                                      >
                                        #{i + 1}
                                      </span>
                                    </div>

                                    {/* Action buttons below each thumbnail */}
                                    <InlineStack gap="100" blockAlign="center">
                                      <Button
                                        size="micro"
                                        variant="primary"
                                        loading={downloadingUrl === url}
                                        onClick={() =>
                                          handleDownloadSingle(
                                            url,
                                            `${order.orderName || `Order_${order.orderId}`}_photo_${i + 1}`
                                          )
                                        }
                                      >
                                        ⬇️ Download
                                      </Button>
                                      <Button
                                        size="micro"
                                        variant="plain"
                                        onClick={() =>
                                          setSelectedImage({
                                            url,
                                            orderName: order.orderName || `Order_${order.orderId}`,
                                            index: i,
                                          })
                                        }
                                      >
                                        Preview
                                      </Button>
                                      <Button
                                        size="micro"
                                        variant="plain"
                                        onClick={() => handleCopy(url, `url-${order.id}-${i}`)}
                                      >
                                        {copiedIndex === `url-${order.id}-${i}` ? "Copied" : "Copy"}
                                      </Button>
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

      {/* Lightbox Modal with direct Download button */}
      {selectedImage && (
        <Modal
          open={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          title={`Customer Photo #${selectedImage.index + 1} — ${selectedImage.orderName}`}
          primaryAction={{
            content: "⬇️ Download Image",
            onAction: () =>
              handleDownloadSingle(
                selectedImage.url,
                `${selectedImage.orderName}_photo_${selectedImage.index + 1}`
              ),
          }}
          secondaryActions={[
            {
              content: "Open in New Tab",
              onAction: () => window.open(selectedImage.url, "_blank"),
            },
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
                background: "#09090b",
                borderRadius: 8,
                overflow: "hidden",
                maxHeight: "70vh",
                padding: "8px",
              }}
            >
              <img
                src={selectedImage.url}
                alt="Enlarged reference"
                style={{
                  maxWidth: "100%",
                  maxHeight: "68vh",
                  objectFit: "contain",
                  borderRadius: 4,
                }}
              />
            </div>
            <div
              style={{
                marginTop: 12,
                padding: "10px 14px",
                background: "#f1f5f9",
                borderRadius: 6,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
              }}
            >
              <div style={{ wordBreak: "break-all", fontSize: "12px", color: "#334155" }}>
                <strong>URL:</strong> {selectedImage.url}
              </div>
              <Button
                size="micro"
                onClick={() => handleCopy(selectedImage.url, "modal-url")}
              >
                {copiedIndex === "modal-url" ? "✓ Copied" : "Copy URL"}
              </Button>
            </div>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
