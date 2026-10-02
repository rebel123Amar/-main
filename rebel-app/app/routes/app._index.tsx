import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Badge,
  Button,
  Banner,
} from "@shopify/polaris";
import { authenticate, prisma } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const [
    totalReviews,
    pendingReviews,
    approvedReviews,
    totalOrders,
    recentReviews,
    recentOrders,
  ] = await Promise.all([
    prisma.review.count({ where: { shopDomain: shop } }),
    prisma.review.count({ where: { shopDomain: shop, status: "pending" } }),
    prisma.review.count({ where: { shopDomain: shop, status: "approved" } }),
    prisma.orderCustomization.count({ where: { shopDomain: shop } }),
    prisma.review.findMany({
      where: { shopDomain: shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.orderCustomization.findMany({
      where: { shopDomain: shop },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return json({
    shop,
    stats: { totalReviews, pendingReviews, approvedReviews, totalOrders },
    recentReviews,
    recentOrders,
  });
};

export default function Index() {
  const { stats, recentReviews, recentOrders } = useLoaderData<typeof loader>();

  const starDisplay = (rating: number) =>
    "★".repeat(rating) + "☆".repeat(5 - rating);

  return (
    <Page title="Rebel App Dashboard">
      <Layout>
        {stats.pendingReviews > 0 && (
          <Layout.Section>
            <Banner
              title={`${stats.pendingReviews} review${stats.pendingReviews > 1 ? "s" : ""} awaiting moderation`}
              tone="warning"
              action={{ content: "Moderate Reviews", url: "/app/reviews" }}
            />
          </Layout.Section>
        )}

        {/* Stats Cards */}
        <Layout.Section>
          <InlineGrid columns={{ xs: 1, sm: 2, md: 4 }} gap="400">
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Total Reviews</Text>
                <Text variant="heading2xl" as="p">{stats.totalReviews}</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Pending</Text>
                <Text variant="heading2xl" as="p">
                  <Badge tone="warning">{String(stats.pendingReviews)}</Badge>
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Approved</Text>
                <Text variant="heading2xl" as="p">
                  <Badge tone="success">{String(stats.approvedReviews)}</Badge>
                </Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text variant="headingMd" as="h3">Orders with Requests</Text>
                <Text variant="heading2xl" as="p">{stats.totalOrders}</Text>
              </BlockStack>
            </Card>
          </InlineGrid>
        </Layout.Section>

        {/* Recent Reviews */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent Reviews</Text>
              {recentReviews.length === 0 ? (
                <Text as="p" tone="subdued">No reviews yet.</Text>
              ) : (
                <BlockStack gap="300">
                  {recentReviews.map((review) => (
                    <div
                      key={review.id}
                      style={{
                        padding: "12px",
                        borderRadius: "8px",
                        background: "#f9f9f9",
                        borderLeft: `4px solid ${
                          review.status === "approved"
                            ? "#00a047"
                            : review.status === "rejected"
                            ? "#d82c0d"
                            : "#f59e0b"
                        }`,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <Text variant="bodyMd" as="span" fontWeight="bold">
                          {review.authorName}
                        </Text>
                        <Badge
                          tone={
                            review.status === "approved"
                              ? "success"
                              : review.status === "rejected"
                              ? "critical"
                              : "warning"
                          }
                        >
                          {review.status}
                        </Badge>
                      </div>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {starDisplay(review.rating)} · Product #{review.productId}
                      </Text>
                      <Text as="p" variant="bodySm">{review.body.substring(0, 100)}{review.body.length > 100 ? "…" : ""}</Text>
                    </div>
                  ))}
                </BlockStack>
              )}
              <Button url="/app/reviews">View All Reviews</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Recent Orders */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Recent Orders with Custom Requests</Text>
              {recentOrders.length === 0 ? (
                <Text as="p" tone="subdued">No custom requests yet.</Text>
              ) : (
                <BlockStack gap="300">
                  {recentOrders.map((order) => {
                    const images = JSON.parse(order.imageUrls || "[]") as string[];
                    return (
                      <div
                        key={order.id}
                        style={{
                          padding: "12px",
                          borderRadius: "8px",
                          background: "#f9f9f9",
                          borderLeft: "4px solid #111",
                        }}
                      >
                        <Text variant="bodyMd" as="p" fontWeight="bold">
                          Order {order.orderName || order.orderId}
                        </Text>
                        {order.specialRequest && (
                          <Text as="p" variant="bodySm">
                            📝 {order.specialRequest.substring(0, 120)}
                          </Text>
                        )}
                        {images.length > 0 && (
                          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                            {images.map((url, i) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Upload ${i + 1}`}
                                style={{
                                  width: 56,
                                  height: 56,
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  border: "1px solid #ddd",
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </BlockStack>
              )}
              <Button url="/app/orders">View All Orders</Button>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Quick Links */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">Quick Actions</Text>
              <InlineGrid columns={3} gap="300">
                <Button url="/app/reviews">Moderate Reviews</Button>
                <Button url="/app/orders">View Orders</Button>
                <Button url="/app/settings">App Settings</Button>
              </InlineGrid>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
