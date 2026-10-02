import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function configureBucketPolicy() {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Try SQL or RPC if available
  // Or check if storage has updateBucket
  const { data, error } = await supabase.storage.updateBucket("order-customizations", {
    public: true,
    fileSizeLimit: 10485760, // 10MB
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/jpg"],
  });
  console.log("Update bucket result:", { data, error });
}

configureBucketPolicy();
