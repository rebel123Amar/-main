import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// In-memory parsed credentials from .env file
const fileEnv: Record<string, string> = {};

function ensureEnvLoaded() {
  try {
    const envPaths = [
      path.resolve(process.cwd(), ".env"),
      path.resolve(process.cwd(), "rebel-app", ".env"),
      "c:\\Users\\AMARJEET\\.gemini\\antigravity\\playground\\rebel\\rebel-app\\.env",
    ];

    for (const envPath of envPaths) {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        content.split(/\r?\n/).forEach((line) => {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith("#")) {
            const eqIdx = trimmed.indexOf("=");
            if (eqIdx > 0) {
              const key = trimmed.slice(0, eqIdx).trim();
              let val = trimmed.slice(eqIdx + 1).trim();
              if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
              ) {
                val = val.slice(1, -1);
              }
              fileEnv[key] = val;
              process.env[key] = val; // Force overwrite placeholders
            }
          }
        });
        break;
      }
    }
  } catch (err) {
    console.warn("[Supabase] Could not auto-load .env file:", err);
  }
}

ensureEnvLoaded();

export function getSupabaseCredentials() {
  ensureEnvLoaded();
  const url = (
    fileEnv.SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "https://nbdncdqteejymeitttzn.supabase.co"
  ).trim();

  const key = (
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ""
  ).trim();

  const bucket = (
    fileEnv.SUPABASE_STORAGE_BUCKET ||
    process.env.SUPABASE_STORAGE_BUCKET ||
    "order-customizations"
  ).trim();

  const isConfigured = Boolean(
    url &&
    key &&
    !url.includes("your-project.supabase.co") &&
    !key.includes("your_supabase")
  );

  return { url, key, bucket, isConfigured };
}

const { url: supabaseUrl, key: supabaseKey, bucket: defaultBucket, isConfigured: initialConfigured } = getSupabaseCredentials();

export const SUPABASE_STORAGE_BUCKET = defaultBucket;

export let isSupabaseConfigured = initialConfigured;

let cachedClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export function getClient() {
  if (cachedClient) return cachedClient;
  const { url, key, isConfigured } = getSupabaseCredentials();
  isSupabaseConfigured = isConfigured;
  if (isConfigured) {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return cachedClient;
}

export const supabase = cachedClient;

// Cache bucket verification so we don't query getBucket on every single upload
let bucketVerified = false;

/**
 * Ensures the target Supabase Storage bucket exists and is public.
 */
export async function ensureBucketExists(bucketName: string = SUPABASE_STORAGE_BUCKET): Promise<void> {
  const client = getClient();
  if (!client || bucketVerified) return;

  try {
    const { data: bucket, error: getErr } = await client.storage.getBucket(bucketName);
    if (!bucket || getErr) {
      // Bucket doesn't exist, create it as public
      const { error: createErr } = await client.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: "10MB",
        allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/jpg"],
      });
      if (createErr && !createErr.message.includes("already exists")) {
        console.warn(`[Supabase] Could not create bucket "${bucketName}":`, createErr.message);
      } else {
        console.log(`[Supabase] Created public storage bucket: "${bucketName}"`);
      }
    }
    bucketVerified = true;
  } catch (err: any) {
    console.warn(`[Supabase] Error ensuring bucket "${bucketName}":`, err?.message || err);
  }
}

/**
 * Uploads a file buffer directly to Supabase Storage and returns its public URL.
 */
export async function uploadFileToSupabase({
  fileBuffer,
  filePath,
  contentType,
  bucketName = SUPABASE_STORAGE_BUCKET,
}: {
  fileBuffer: Buffer;
  filePath: string;
  contentType: string;
  bucketName?: string;
}): Promise<string> {
  const client = getClient();
  if (!client) {
    throw new Error(
      "Supabase Storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }

  await ensureBucketExists(bucketName);

  const { data, error } = await client.storage
    .from(bucketName)
    .upload(filePath, fileBuffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  const { data: publicUrlData } = client.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  if (!publicUrlData?.publicUrl) {
    throw new Error("Failed to retrieve public URL from Supabase Storage.");
  }

  return publicUrlData.publicUrl;
}
