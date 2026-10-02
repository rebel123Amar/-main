import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { unauthenticated, prisma } from "../shopify.server";

// Rate limiting map (in-memory, use Redis in production for multi-instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string, maxPerHour = 3): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= maxPerHour) return false;
  entry.count++;
  return true;
}

// GET /api/reviews?shop=xxx&productId=xxx&page=1
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const productHandle = url.searchParams.get("handle") || "";

  if (!shop || !productId) {
    return json({ error: "Missing shop or productId" }, { status: 400 });
  }

  const settings = await prisma.appSettings.findUnique({
    where: { shopDomain: shop },
  });

  const perPage = settings?.reviewsPerPage || 5;
  const instagramUrl = settings?.instagramUrl || "https://www.instagram.com/";

  const [reviews, total, ratingStats] = await Promise.all([
    prisma.review.findMany({
      where: { shopDomain: shop, productId, status: "approved" },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        authorName: true,
        rating: true,
        title: true,
        body: true,
        mediaUrls: true,
        createdAt: true,
      },
    }),
    prisma.review.count({
      where: { shopDomain: shop, productId, status: "approved" },
    }),
    prisma.review.groupBy({
      by: ["rating"],
      where: { shopDomain: shop, productId, status: "approved" },
      _count: { rating: true },
    }),
  ]);

  // Calculate average rating
  const totalRatings = ratingStats.reduce((sum, s) => sum + s._count.rating, 0);
  const sumRatings = ratingStats.reduce(
    (sum, s) => sum + s.rating * s._count.rating,
    0
  );
  const averageRating = totalRatings > 0 ? sumRatings / totalRatings : 0;

  const ratingBreakdown: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  ratingStats.forEach((s) => {
    ratingBreakdown[s.rating] = s._count.rating;
  });

  return json(
    {
      reviews: reviews.map((r) => ({
        ...r,
        mediaUrls: JSON.parse(r.mediaUrls || "[]"),
        createdAt: new Date(r.createdAt).toLocaleDateString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      })),
      total,
      page,
      totalPages: Math.ceil(total / perPage),
      averageRating: Math.round(averageRating * 10) / 10,
      ratingBreakdown,
      instagramUrl,
      allowMediaUploads: settings?.allowMediaUploads ?? true,
      maxUploadSizeMb: settings?.maxUploadSizeMb ?? 10,
    },
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    }
  );
};

// POST /api/reviews — submit a new review
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  if (!checkRateLimit(ip)) {
    return json(
      { error: "Too many submissions. Please try again later." },
      {
        status: 429,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    shop,
    productId,
    productHandle,
    authorName,
    authorEmail,
    rating,
    title,
    reviewBody,
    mediaUrls,
    honeypot, // spam prevention
  } = body;

  // Honeypot check
  if (honeypot) {
    return json({ success: true }); // silently discard spam
  }

  // Validation
  if (!shop || !productId || !authorName || !authorEmail || !rating || !reviewBody) {
    return json(
      { error: "Missing required fields" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  if (rating < 1 || rating > 5) {
    return json(
      { error: "Rating must be between 1 and 5" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  if (!authorEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return json(
      { error: "Invalid email address" },
      { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const settings = await prisma.appSettings.findUnique({
    where: { shopDomain: shop },
  });

  const status = settings?.autoApproveReviews ? "approved" : "pending";

  await prisma.review.create({
    data: {
      shopDomain: shop,
      productId: String(productId),
      productHandle: productHandle || "",
      authorName: authorName.substring(0, 100),
      authorEmail: authorEmail.substring(0, 200),
      rating: Math.floor(Number(rating)),
      title: (title || "").substring(0, 200),
      body: reviewBody.substring(0, 5000),
      status,
      mediaUrls: JSON.stringify(
        Array.isArray(mediaUrls) ? mediaUrls.slice(0, 10) : []
      ),
      ipAddress: ip,
    },
  });

  return json(
    {
      success: true,
      message:
        status === "approved"
          ? "Review published!"
          : "Review submitted! It will appear after moderation.",
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  );
};
