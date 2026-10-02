import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  Badge,
  Button,
  ButtonGroup,
  Select,
  InlineStack,
  Divider,
  EmptyState,
  Pagination,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate, prisma } from "../shopify.server";

const REVIEWS_PER_PAGE = 10;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const statusFilter = url.searchParams.get("status") || "all";

  const where = {
    shopDomain: session.shop,
    ...(statusFilter !== "all" ? { status: statusFilter } : {}),
  };

  const [reviews, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * REVIEWS_PER_PAGE,
      take: REVIEWS_PER_PAGE,
    }),
    prisma.review.count({ where }),
  ]);

  return json({
    reviews,
    total,
    page,
    totalPages: Math.ceil(total / REVIEWS_PER_PAGE),
    statusFilter,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const reviewId = formData.get("reviewId") as string;

  if (!reviewId) return json({ error: "Missing reviewId" }, { status: 400 });

  const review = await prisma.review.findFirst({
    where: { id: reviewId, shopDomain: session.shop },
  });
  if (!review) return json({ error: "Review not found" }, { status: 404 });

  if (intent === "approve") {
    await prisma.review.update({ where: { id: reviewId }, data: { status: "approved" } });
  } else if (intent === "reject") {
    await prisma.review.update({ where: { id: reviewId }, data: { status: "rejected" } });
  } else if (intent === "delete") {
    await prisma.review.delete({ where: { id: reviewId } });
  }

  return json({ success: true });
};

export default function ReviewsPage() {
  const { reviews, total, page, totalPages, statusFilter } =
    useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [filter, setFilter] = useState(statusFilter);

  const handleFilterChange = useCallback(
    (value: string) => {
      setFilter(value);
      submit({ status: value, page: "1" }, { method: "get" });
    },
    [submit]
  );

  const handleAction = useCallback(
    (intent: string, reviewId: string) => {
      if (
        intent === "delete" &&
        !confirm("Are you sure you want to permanently delete this review?")
      )
        return;
      submit({ intent, reviewId }, { method: "post" });
    },
    [submit]
  );

  const starDisplay = (rating: number) =>
    "★".repeat(rating) + "☆".repeat(5 - rating);

  return (
    <Page
      title="Review Moderation"
      subtitle={`${total} total review${total !== 1 ? "s" : ""}`}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <Text variant="headingMd" as="h2">Filter Reviews</Text>
                <div style={{ width: 200 }}>
                  <Select
                    label=""
                    options={[
                      { label: "All Reviews", value: "all" },
                      { label: "Pending", value: "pending" },
                      { label: "Approved", value: "approved" },
                      { label: "Rejected", value: "rejected" },
                    ]}
                    value={filter}
                    onChange={handleFilterChange}
                  />
                </div>
              </InlineStack>

              <Divider />

              {reviews.length === 0 ? (
                <EmptyState
                  heading="No reviews found"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>There are no reviews matching this filter.</p>
                </EmptyState>
              ) : (
                <BlockStack gap="400">
                  {reviews.map((review) => {
                    const mediaUrls = JSON.parse(review.mediaUrls || "[]") as string[];
                    return (
                      <div
                        key={review.id}
                        style={{
                          padding: 16,
                          borderRadius: 8,
                          border: "1px solid #e1e1e1",
                          background:
                            review.status === "pending"
                              ? "#fffbf0"
                              : review.status === "approved"
                              ? "#f0fff4"
                              : "#fff0f0",
                        }}
                      >
                        {/* Header */}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            marginBottom: 8,
                          }}
                        >
                          <BlockStack gap="100">
                            <InlineStack gap="200">
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
                            </InlineStack>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {review.authorEmail} · Product #{review.productId} ·{" "}
                              {new Date(review.createdAt).toLocaleDateString("en-IN")}
                            </Text>
                          </BlockStack>
                          <Text as="p" variant="bodyMd" tone="caution">
                            {starDisplay(review.rating)}
                          </Text>
                        </div>

                        {/* Title */}
                        {review.title && (
                          <Text as="p" variant="bodyMd" fontWeight="semibold">
                            {review.title}
                          </Text>
                        )}

                        {/* Body */}
                        <Text as="p" variant="bodySm">
                          {review.body}
                        </Text>

                        {/* Media Thumbnails */}
                        {mediaUrls.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              marginTop: 12,
                              flexWrap: "wrap",
                            }}
                          >
                            {mediaUrls.map((url, i) => {
                              const isVideo = url.match(/\.(mp4|webm|mov)$/i);
                              return isVideo ? (
                                <video
                                  key={i}
                                  src={url}
                                  style={{
                                    width: 80,
                                    height: 80,
                                    objectFit: "cover",
                                    borderRadius: 6,
                                    border: "1px solid #ddd",
                                  }}
                                  controls
                                />
                              ) : (
                                <a key={i} href={url} target="_blank" rel="noreferrer">
                                  <img
                                    src={url}
                                    alt={`Review media ${i + 1}`}
                                    style={{
                                      width: 80,
                                      height: 80,
                                      objectFit: "cover",
                                      borderRadius: 6,
                                      border: "1px solid #ddd",
                                    }}
                                  />
                                </a>
                              );
                            })}
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ marginTop: 12 }}>
                          <ButtonGroup>
                            {review.status !== "approved" && (
                              <Button
                                size="slim"
                                variant="primary"
                                tone="success"
                                loading={isSubmitting}
                                onClick={() => handleAction("approve", review.id)}
                              >
                                ✓ Approve
                              </Button>
                            )}
                            {review.status !== "rejected" && (
                              <Button
                                size="slim"
                                tone="critical"
                                loading={isSubmitting}
                                onClick={() => handleAction("reject", review.id)}
                              >
                                ✗ Reject
                              </Button>
                            )}
                            <Button
                              size="slim"
                              variant="plain"
                              tone="critical"
                              loading={isSubmitting}
                              onClick={() => handleAction("delete", review.id)}
                            >
                              Delete
                            </Button>
                          </ButtonGroup>
                        </div>
                      </div>
                    );
                  })}
                </BlockStack>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 16 }}>
                  <Pagination
                    hasPrevious={page > 1}
                    onPrevious={() => submit({ page: String(page - 1), status: filter }, { method: "get" })}
                    hasNext={page < totalPages}
                    onNext={() => submit({ page: String(page + 1), status: filter }, { method: "get" })}
                  />
                </div>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
