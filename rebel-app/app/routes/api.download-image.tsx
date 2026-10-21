import type { LoaderFunctionArgs } from "@remix-run/node";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get("url");
  let requestedFilename = requestUrl.searchParams.get("filename") || "image.jpg";

  if (!targetUrl) {
    return new Response("Missing 'url' query parameter", {
      status: 400,
      headers: CORS_HEADERS,
    });
  }

  // Security: only allow http and https protocols
  try {
    const parsedTarget = new URL(targetUrl);
    if (!["http:", "https:"].includes(parsedTarget.protocol)) {
      return new Response("Invalid protocol", { status: 400, headers: CORS_HEADERS });
    }
  } catch {
    return new Response("Invalid target URL", { status: 400, headers: CORS_HEADERS });
  }

  try {
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return new Response(`Failed to fetch image from source: ${response.statusText}`, {
        status: response.status,
        headers: CORS_HEADERS,
      });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();

    // Ensure filename has proper extension
    if (!/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(requestedFilename)) {
      const ext = contentType.includes("png")
        ? ".png"
        : contentType.includes("webp")
        ? ".webp"
        : contentType.includes("gif")
        ? ".gif"
        : contentType.includes("svg")
        ? ".svg"
        : ".jpg";
      requestedFilename += ext;
    }

    // Clean filename for HTTP header
    const safeFilename = requestedFilename.replace(/[^a-zA-Z0-9._-]/g, "_");

    return new Response(new Uint8Array(arrayBuffer), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(
          safeFilename
        )}`,
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch (error: any) {
    console.error("[Download Image Error]", error);
    return new Response(`Download error: ${error?.message || "Unknown error"}`, {
      status: 500,
      headers: CORS_HEADERS,
    });
  }
};
