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
  Modal,
  Banner,
  Tabs,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate, prisma } from "../shopify.server";
import { handleOrderCreate } from "../order-customization.server";

const ORDERS_PER_PAGE = 15;

export interface EnrichedShopifyOrder {
  orderId: string;
  orderName: string;
  createdAt: string;
  fulfillmentStatus: string;
  customerName: string;
  customerFirstName: string;
  customerPhone: string;
  customerEmail: string;
  productTitle: string;
  productImage: string;
  productId: string;
}

// Helper to sync recent orders from Shopify Admin GraphQL API
async function syncRecentOrdersFromShopify(admin: any, shop: string): Promise<EnrichedShopifyOrder[]> {
  const enrichedList: EnrichedShopifyOrder[] = [];
  try {
    const response = await admin.graphql(
      `#graphql
      query getRecentOrders {
        orders(first: 30, sortKey: CREATED_AT, reverse: true) {
          edges {
            node {
              id
              name
              createdAt
              displayFulfillmentStatus
              customer {
                id
                firstName
                lastName
                displayName
                email
                phone
              }
              shippingAddress {
                name
                phone
              }
              note
              customAttributes {
                key
                value
              }
              lineItems(first: 5) {
                edges {
                  node {
                    id
                    title
                    image {
                      url
                    }
                    product {
                      id
                      title
                      featuredImage {
                        url
                      }
                    }
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

      // Extract customer details
      const customerFirstName = node.customer?.firstName || "";
      const customerName =
        node.customer?.displayName ||
        [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(" ") ||
        node.shippingAddress?.name ||
        "";
      const customerPhone = node.customer?.phone || node.shippingAddress?.phone || "";
      const customerEmail = node.customer?.email || "";

      // Extract first product title and image
      const firstLineItem = node.lineItems?.edges?.[0]?.node;
      const productTitle = firstLineItem?.product?.title || firstLineItem?.title || "Personalized Rebel Gift";
      const productImage = firstLineItem?.image?.url || firstLineItem?.product?.featuredImage?.url || "";
      const productId = firstLineItem?.product?.id?.replace("gid://shopify/Product/", "") || `order-${orderId}`;

      enrichedList.push({
        orderId,
        orderName: node.name || `#${orderId}`,
        createdAt: node.createdAt,
        fulfillmentStatus: node.displayFulfillmentStatus || "UNFULFILLED",
        customerName,
        customerFirstName,
        customerPhone,
        customerEmail,
        productTitle,
        productImage,
        productId,
      });

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
  return enrichedList;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const shop = session.shop;

  // Sync recent orders from Shopify on load
  const shopifyOrders = await syncRecentOrdersFromShopify(admin, shop);

  const where = { shopDomain: shop };

  const [customOrders, total] = await Promise.all([
    prisma.orderCustomization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * ORDERS_PER_PAGE,
      take: ORDERS_PER_PAGE,
    }),
    prisma.orderCustomization.count({ where }),
  ]);

  return json({
    orders: customOrders,
    shopifyOrders,
    total,
    page,
    totalPages: Math.ceil(total / ORDERS_PER_PAGE) || 1,
    shop,
    appUrl: "https://main-pink-phi.vercel.app",
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
  const { orders, shopifyOrders, total, page, totalPages, shop, appUrl } =
    useLoaderData<typeof loader>();
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
    setTimeout(() => setCopiedIndex(null), 2500);
  }, []);

  // Download a single customer image via proxy
  const handleDownloadSingle = useCallback((url: string, baseFilename: string) => {
    setDownloadingUrl(url);
    const cleanFilename = baseFilename.replace(/[^a-zA-Z0-9_-]/g, "_");
    const downloadUrl = `/api/download-image?url=${encodeURIComponent(
      url
    )}&filename=${encodeURIComponent(cleanFilename)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.setAttribute("download", `${cleanFilename}.jpg`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setDownloadingUrl(null), 1000);
  }, []);

  // Download all images of an order bundled into a single ZIP archive
  const handleDownloadZip = useCallback(
    (urls: string[], orderName: string, orderId: string) => {
      setDownloadingZipId(orderId);
      const safeOrderName = (orderName || `Order_${orderId}`).replace(
        /[^a-zA-Z0-9_-]/g,
        "_"
      );
      const downloadUrl = `/api/download-zip?orderName=${encodeURIComponent(
        safeOrderName
      )}&urls=${encodeURIComponent(JSON.stringify(urls))}`;
      const a = document.createElement("a");
      a.href = downloadUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => setDownloadingZipId(null), 2500);
    },
    []
  );

  // Helper to build review link and WhatsApp message
  const getReviewData = (orderId: string, orderName: string) => {
    const matched = shopifyOrders.find(
      (s) => s.orderId === orderId || s.orderName === orderName
    );

    const customerName = matched?.customerName || "";
    const customerFirstName = matched?.customerFirstName || "";
    const customerEmail = matched?.customerEmail || "";
    const customerPhone = matched?.customerPhone || "";
    const productTitle = matched?.productTitle || "Personalized Rebel Gift";
    const productImage = matched?.productImage || "";
    const productId = matched?.productId || `order-${orderId}`;

    // Clean Indian/international phone number
    let cleanPhone = customerPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) cleanPhone = `91${cleanPhone}`;

    // Direct Review Page Link
    const reviewLink = `${appUrl}/review?shop=${encodeURIComponent(
      shop
    )}&order_id=${encodeURIComponent(orderId)}&order_name=${encodeURIComponent(
      orderName
    )}&name=${encodeURIComponent(customerName)}&email=${encodeURIComponent(
      customerEmail
    )}&product_title=${encodeURIComponent(
      productTitle
    )}&product_img=${encodeURIComponent(
      productImage
    )}&product_id=${encodeURIComponent(productId)}`;

    // EXACT TEMPLATE requested by user
    const whatsappMessage = `Heyyy! 💌 Aapko apna Rebel Gifts \nOrder kaisa laga? 🥹❤️\n\nYour honest review means the world to us! Would you recommend us to your friends? 🫶🏻\n\nKindly tell here → ${reviewLink} 💗`;

    const whatsappUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(whatsappMessage)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsappMessage)}`;

    return {
      customerName,
      customerFirstName,
      customerPhone,
      customerEmail,
      productTitle,
      productImage,
      fulfillmentStatus: matched?.fulfillmentStatus || "FULFILLED",
      reviewLink,
      whatsappMessage,
      whatsappUrl,
    };
  };

  return (
    <Page
      title="Orders & Post-Delivery Reviews"
      subtitle="Manage custom gift orders & copy 1-click WhatsApp review request links"
      primaryAction={{
        content: isSyncing ? "Syncing Orders..." : "🔄 Sync from Shopify",
        loading: isSyncing,
        onAction: () => submit({ intent: "sync" }, { method: "post" }),
      }}
    >
      <Layout>
        {/* Banner with template information */}
        <Layout.Section>
          <Banner title="💌 WhatsApp Review Request System is Active!" tone="info">
            <p>
              Har order ke aage <strong>"📱 WhatsApp Review"</strong> button hai. Click
              karte hi customer ke WhatsApp par review request message open ho jayega
              jisme unka <strong>purchased product, order details aur photo review link</strong> pre-filled hoga!
            </p>
          </Banner>
        </Layout.Section>

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
                    When customers place orders, their details will automatically be
                    linked and shown here. Click "Sync from Shopify" to refresh.
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

                    const hasRequest = Boolean(
                      order.specialRequest && order.specialRequest.trim()
                    );
                    const hasImages = images.length > 0;
                    const cleanShopDomain = shop.replace(".myshopify.com", "");
                    const shopifyAdminOrderUrl = `https://admin.shopify.com/store/${cleanShopDomain}/orders/${order.orderId}`;

                    const revData = getReviewData(
                      order.orderId,
                      order.orderName || `Order #${order.orderId}`
                    );

                    return (
                      <div
                        key={order.id}
                        style={{
                          padding: 20,
                          borderRadius: 14,
                          border: "1px solid #e1e3e5",
                          background: "#ffffff",
                          boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                        }}
                      >
                        {/* Order Header */}
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="100">
                            <InlineStack gap="200" blockAlign="center">
                              <Text variant="headingSm" as="h4">
                                {order.orderName || `Order #${order.orderId}`}
                              </Text>
                              {revData.customerName && (
                                <Badge tone="info">{`👤 ${revData.customerName}`}</Badge>
                              )}
                              {revData.customerPhone && (
                                <Badge tone="attention">{`📞 ${revData.customerPhone}`}</Badge>
                              )}
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
                                {`📸 ${images.length} Image${
                                  images.length > 1 ? "s" : ""
                                }`}
                              </Badge>
                            )}
                          </InlineStack>
                        </InlineStack>

                        <Divider />

                        {/* WhatsApp Post-Delivery Review Generator Card */}
                        <div
                          style={{
                            marginTop: 14,
                            marginBottom: 10,
                            padding: "16px 18px",
                            background: "linear-gradient(135deg, #fff5f7 0%, #fff1f2 100%)",
                            borderRadius: 12,
                            border: "1.5px solid #fecdd3",
                            boxShadow: "0 2px 8px rgba(225, 29, 72, 0.05)",
                          }}
                        >
                          <BlockStack gap="300">
                            <InlineStack align="space-between" blockAlign="center">
                              <InlineStack gap="200" blockAlign="center">
                                <span style={{ fontSize: "20px" }}>💌</span>
                                <div>
                                  <Text as="span" variant="bodyMd" fontWeight="bold">
                                    WhatsApp Review Request (Post-Delivery)
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    Customer ko WhatsApp message bhejein to get 5-star rating & unboxing photos
                                  </Text>
                                </div>
                              </InlineStack>

                              <ButtonGroup>
                                <Button
                                  variant="primary"
                                  tone="success"
                                  url={revData.whatsappUrl}
                                  target="_blank"
                                >
                                  📱 Send on WhatsApp
                                </Button>
                                <Button
                                  onClick={() =>
                                    handleCopy(
                                      revData.whatsappMessage,
                                      `msg-${order.id}`
                                    )
                                  }
                                >
                                  {copiedIndex === `msg-${order.id}`
                                    ? "✓ Copied Message!"
                                    : "📋 Copy WhatsApp Text"}
                                </Button>
                                <Button
                                  variant="plain"
                                  onClick={() =>
                                    handleCopy(
                                      revData.reviewLink,
                                      `link-${order.id}`
                                    )
                                  }
                                >
                                  {copiedIndex === `link-${order.id}`
                                    ? "✓ Copied Link!"
                                    : "🔗 Copy Review Link"}
                                </Button>
                                <Button
                                  variant="plain"
                                  url={revData.reviewLink}
                                  target="_blank"
                                >
                                  👁️ Preview Page
                                </Button>
                              </ButtonGroup>
                            </InlineStack>

                            {/* Message Preview Box */}
                            <div
                              style={{
                                background: "#ffffff",
                                padding: "12px 14px",
                                borderRadius: 8,
                                border: "1px solid #fed7aa44",
                                fontSize: "13px",
                                lineHeight: "1.5",
                                color: "#1e293b",
                                whiteSpace: "pre-wrap",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                              }}
                            >
                              {revData.whatsappMessage}
                            </div>
                          </BlockStack>
                        </div>

                        {/* Special Instructions */}
                        {hasRequest && (
                          <div style={{ marginTop: 12 }}>
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text as="p" variant="bodySm" fontWeight="semibold">
                                  ✏️ Customer Special Instructions:
                                </Text>
                                <Button
                                  size="micro"
                                  variant="plain"
                                  onClick={() =>
                                    handleCopy(order.specialRequest, `req-${order.id}`)
                                  }
                                >
                                  {copiedIndex === `req-${order.id}`
                                    ? "Copied!"
                                    : "Copy Text"}
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
                                    🖼️ Customer Reference Photos ({images.length}):
                                  </Text>
                                  <Badge tone="success">{`${images.length} Image${
                                    images.length > 1 ? "s" : ""
                                  }`}</Badge>
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
                                    </ButtonGroup>
                                  ) : (
                                    <Button
                                      size="slim"
                                      variant="primary"
                                      loading={downloadingUrl === images[0]}
                                      onClick={() =>
                                        handleDownloadSingle(
                                          images[0],
                                          `${
                                            order.orderName ||
                                            `Order_${order.orderId}`
                                          }_photo_1`
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
                                      width: 110,
                                    }}
                                  >
                                    <div
                                      onClick={() =>
                                        setSelectedImage({
                                          url,
                                          orderName:
                                            order.orderName ||
                                            `Order #${order.orderId}`,
                                          index: i + 1,
                                        })
                                      }
                                      style={{
                                        width: 110,
                                        height: 110,
                                        borderRadius: 8,
                                        overflow: "hidden",
                                        border: "1px solid #cbd5e1",
                                        cursor: "pointer",
                                        background: "#e2e8f0",
                                        position: "relative",
                                        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                                      }}
                                    >
                                      <img
                                        src={url}
                                        alt={`Reference ${i + 1}`}
                                        style={{
                                          width: "100%",
                                          height: "100%",
                                          objectFit: "cover",
                                          display: "block",
                                        }}
                                        loading="lazy"
                                      />
                                    </div>

                                    <Button
                                      size="micro"
                                      variant="plain"
                                      loading={downloadingUrl === url}
                                      onClick={() =>
                                        handleDownloadSingle(
                                          url,
                                          `${
                                            order.orderName ||
                                            `Order_${order.orderId}`
                                          }_photo_${i + 1}`
                                        )
                                      }
                                    >
                                      ⬇️ Download
                                    </Button>
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginTop: 20,
                  }}
                >
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => {
                      window.location.search = `?page=${page - 1}`;
                    }}
                    hasNext={page < totalPages}
                    onNext={() => {
                      window.location.search = `?page=${page + 1}`;
                    }}
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
          title={`${selectedImage.orderName} — Image #${selectedImage.index}`}
          primaryAction={{
            content: "⬇️ Download Original",
            onAction: () => {
              handleDownloadSingle(
                selectedImage.url,
                `${selectedImage.orderName}_photo_${selectedImage.index}`
              );
            },
          }}
          secondaryActions={[
            {
              content: "Open in New Tab ↗",
              onAction: () => window.open(selectedImage.url, "_blank"),
            },
          ]}
        >
          <Modal.Section>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                background: "#0f172a",
                borderRadius: 8,
                padding: 16,
                maxHeight: "75vh",
                overflow: "hidden",
              }}
            >
              <img
                src={selectedImage.url}
                alt="Enlarged reference"
                style={{
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  objectFit: "contain",
                  borderRadius: 4,
                }}
              />
            </div>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
