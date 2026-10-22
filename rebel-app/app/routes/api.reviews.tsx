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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
};

// GET /api/reviews?shop=xxx&productId=xxx&page=1
export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const productId = url.searchParams.get("productId");
  const page = parseInt(url.searchParams.get("page") || "1");
  const productHandle = url.searchParams.get("handle") || "";
  const orderId = url.searchParams.get("orderId");
  const authorEmail = url.searchParams.get("authorEmail");

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400, headers: CORS_HEADERS });
  }

  // If checking existing reviews by customer/order
  if (authorEmail && productId) {
    const existing = await prisma.review.findFirst({
      where: {
        shopDomain: shop,
        productId,
        authorEmail,
      },
      select: {
        id: true,
        rating: true,
        status: true,
        createdAt: true,
      },
    });

    return json(
      { hasReviewed: Boolean(existing), review: existing },
      { headers: CORS_HEADERS }
    );
  }

  if (!productId) {
    return json({ error: "Missing productId" }, { status: 400, headers: CORS_HEADERS });
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
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
      },
    }
  );
};

// POST /api/reviews — submit a new review
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405, headers: CORS_HEADERS });
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
        headers: CORS_HEADERS,
      }
    );
  }

  let body: Record<string, any>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, { status: 400, headers: CORS_HEADERS });
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
    orderId,
    orderName,
  } = body;

  // Honeypot check
  if (honeypot) {
    return json({ success: true }, { headers: CORS_HEADERS }); // silently discard spam
  }

  // Validation
  if (!shop || !productId || !authorName || !authorEmail || !rating || !reviewBody) {
    return json(
      { error: "Missing required fields" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (rating < 1 || rating > 5) {
    return json(
      { error: "Rating must be between 1 and 5" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!authorEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
    return json(
      { error: "Invalid email address" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Normalize shop domain so reviews are always tied to the active Shopify store
  let resolvedShop = (shop || "").trim().toLowerCase();
  if (!resolvedShop || !resolvedShop.includes(".myshopify.com") || resolvedShop.includes("rebelgifts")) {
    const activeSession = await prisma.session.findFirst({
      orderBy: { id: "desc" },
    });
    resolvedShop = activeSession?.shop || "f83czm-2f.myshopify.com";
  }

  const settings = await prisma.appSettings.findUnique({
    where: { shopDomain: resolvedShop },
  });

  const status = settings?.autoApproveReviews ? "approved" : "pending";

  // Build clean, informative title
  let finalTitle = (title || "").trim();
  const orderRef = orderName || (orderId ? `#${orderId}` : "");
  if (orderRef) {
    if (!finalTitle) {
      finalTitle = `Verified Order ${orderRef}`;
    } else if (!finalTitle.includes(orderRef)) {
      finalTitle = `${finalTitle} (${orderRef})`;
    }
  }

  await prisma.review.create({
    data: {
      shopDomain: resolvedShop,
      productId: String(productId),
      productHandle: productHandle || "",
      authorName: authorName.substring(0, 100),
      authorEmail: authorEmail.substring(0, 200),
      rating: Math.floor(Number(rating)),
      title: finalTitle.substring(0, 200),
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
          ? "Thank you! Your review has been published."
          : "Thank you! Your review has been submitted and will appear shortly.",
    },
    { headers: CORS_HEADERS }
  );
};
