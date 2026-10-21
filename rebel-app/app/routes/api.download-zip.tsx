import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import JSZip from "jszip";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

async function generateZipResponse(urls: string[], orderName: string = "order-images") {
  if (!urls || urls.length === 0) {
    return new Response("No image URLs provided", { status: 400, headers: CORS_HEADERS });
  }

  const zip = new JSZip();
  const safeOrderName = (orderName || "order").replace(/[^a-zA-Z0-9_-]/g, "_");

  // Fetch images in parallel
  const fetchPromises = urls.map(async (url, idx) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`[Download Zip] Failed to fetch image ${idx + 1}: ${response.statusText}`);
        return null;
      }

      const contentType = response.headers.get("content-type") || "image/jpeg";
      const buffer = await response.arrayBuffer();

      let ext = ".jpg";
      if (contentType.includes("png") || url.toLowerCase().endsWith(".png")) ext = ".png";
      else if (contentType.includes("webp") || url.toLowerCase().endsWith(".webp")) ext = ".webp";
      else if (contentType.includes("gif") || url.toLowerCase().endsWith(".gif")) ext = ".gif";

      const filename = `${safeOrderName}_photo_${idx + 1}${ext}`;
      return { filename, data: buffer };
    } catch (err) {
      console.error(`[Download Zip] Error fetching image ${url}:`, err);
      return null;
    }
  });

  const results = await Promise.all(fetchPromises);
  let addedCount = 0;

  for (const item of results) {
    if (item && item.data) {
      zip.file(item.filename, item.data);
      addedCount++;
    }
  }

  if (addedCount === 0) {
    return new Response("Could not download any images to create ZIP", {
      status: 502,
      headers: CORS_HEADERS,
    });
  }

  const zipBuffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const zipFilename = `${safeOrderName}_images.zip`;

  return new Response(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(
        zipFilename
      )}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(request.url);
  const orderName = url.searchParams.get("orderName") || "order";
  
  // Accept urls as multiple url params OR comma/pipe separated
  const rawUrls = url.searchParams.getAll("url");
  let urls: string[] = [];

  if (rawUrls.length > 0) {
    urls = rawUrls;
  } else {
    const raw = url.searchParams.get("urls");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) urls = parsed;
      } catch {
        urls = raw.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  return generateZipResponse(urls, orderName);
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  let urls: string[] = [];
  let orderName = "order";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json();
    urls = body.urls || [];
    orderName = body.orderName || orderName;
  } else {
    const formData = await request.formData();
    orderName = (formData.get("orderName") as string) || orderName;
    const urlsJson = formData.get("urls") as string;
    if (urlsJson) {
      try {
        urls = JSON.parse(urlsJson);
      } catch {
        urls = urlsJson.split(",").map((s) => s.trim()).filter(Boolean);
      }
    }
  }

  return generateZipResponse(urls, orderName);
};
