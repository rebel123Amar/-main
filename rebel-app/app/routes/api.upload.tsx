import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import {
  isSupabaseConfigured,
  getSupabaseCredentials,
  uploadFileToSupabase,
  SUPABASE_STORAGE_BUCKET,
} from "../supabase.server";

const MAX_FILE_SIZE_MB = 10; // 10MB per file
const MAX_FILES_PER_UPLOAD = 15; // Up to 15 files per order

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/jpg",
];

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
  "Access-Control-Allow-Headers": "Content-Type, X-Shop-Domain",
};

// OPTIONS — CORS preflight & health check
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
};

// POST /api/upload — multipart/form-data
export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files || files.length === 0) {
      return json(
        { success: false, error: "No files provided for upload." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if (files.length > MAX_FILES_PER_UPLOAD) {
      return json(
        {
          success: false,
          error: `You can upload up to ${MAX_FILES_PER_UPLOAD} images at once.`,
        },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // 1. Validate all files first (format and size)
    for (const file of files) {
      const fileType = file.type?.toLowerCase();
      if (!ALLOWED_MIME_TYPES.includes(fileType)) {
        return json(
          {
            success: false,
            error: `"${file.name || "File"}" is not a supported format. Please upload JPG, JPEG, PNG, or WEBP images.`,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }

      const rawExt = path.extname(file.name || "").toLowerCase();
      const ext = ALLOWED_EXTENSIONS.includes(rawExt)
        ? rawExt
        : fileType === "image/png"
        ? ".png"
        : fileType === "image/webp"
        ? ".webp"
        : ".jpg";

      const fileSizeMb = file.size / (1024 * 1024);
      if (fileSizeMb > MAX_FILE_SIZE_MB) {
        return json(
          {
            success: false,
            error: `"${file.name}" is too large (${fileSizeMb.toFixed(1)} MB). Maximum allowed size is ${MAX_FILE_SIZE_MB} MB per image.`,
          },
          { status: 400, headers: CORS_HEADERS }
        );
      }
    }

    // 2. Verify Supabase configuration before uploading
    const { isConfigured } = getSupabaseCredentials();
    if (!isConfigured) {
      return json(
        {
          success: false,
          error:
            "Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file.",
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // 3. Upload all files to Supabase Storage
    const urls: string[] = [];

    for (const file of files) {
      const fileType = file.type?.toLowerCase() || "image/jpeg";
      const rawExt = path.extname(file.name || "").toLowerCase();
      const ext = ALLOWED_EXTENSIONS.includes(rawExt)
        ? rawExt
        : fileType === "image/png"
        ? ".png"
        : fileType === "image/webp"
        ? ".webp"
        : ".jpg";

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const uniqueFilename = `order-uploads/${uuidv4()}${ext}`;

      const publicUrl = await uploadFileToSupabase({
        fileBuffer,
        filePath: uniqueFilename,
        contentType: fileType,
        bucketName: SUPABASE_STORAGE_BUCKET,
      });

      urls.push(publicUrl);
    }

    return json(
      {
        success: true,
        urls,
        count: urls.length,
        message: `${urls.length} image${urls.length > 1 ? "s" : ""} uploaded successfully to Supabase Storage`,
      },
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error("[Supabase Upload Error]", error);
    return json(
      {
        success: false,
        error: error?.message || "Upload failed. Please try again.",
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
};
