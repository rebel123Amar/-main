import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Form } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  TextField,
  Button,
  Banner,
  InlineStack,
  Checkbox,
  RangeSlider,
  Divider,
} from "@shopify/polaris";
import { useState, useCallback } from "react";
import { authenticate, prisma } from "../shopify.server";

const DEFAULT_SETTINGS = {
  instagramUrl: "https://www.instagram.com/rebelgifts_?igsh=MTh2OGlsNXlwbGRvOA==",
  autoApproveReviews: false,
  reviewsPerPage: 5,
  allowMediaUploads: true,
  maxUploadSizeMb: 10,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  try {
    let settings = await prisma.appSettings.findUnique({
      where: { shopDomain: shop },
    });

    if (!settings) {
      settings = await prisma.appSettings.create({
        data: {
          shopDomain: shop,
          ...DEFAULT_SETTINGS,
        },
      });
    }

    return json({ settings, dbError: null });
  } catch (dbErr: any) {
    console.error("[Settings DB Error]", dbErr.message);
    return json({
      settings: { ...DEFAULT_SETTINGS, id: "fallback", shopDomain: shop },
      dbError: dbErr.message || "Database unreachable",
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();

  const instagramUrl = formData.get("instagramUrl") as string;
  const autoApproveReviews = formData.get("autoApproveReviews") === "true";
  const reviewsPerPage = parseInt(formData.get("reviewsPerPage") as string) || 5;
  const allowMediaUploads = formData.get("allowMediaUploads") === "true";
  const maxUploadSizeMb = parseInt(formData.get("maxUploadSizeMb") as string) || 10;

  // Validate Instagram URL
  if (instagramUrl && !instagramUrl.startsWith("https://")) {
    return json({ error: "Instagram URL must start with https://" });
  }

  try {
    await prisma.appSettings.upsert({
      where: { shopDomain: shop },
      update: {
        instagramUrl,
        autoApproveReviews,
        reviewsPerPage,
        allowMediaUploads,
        maxUploadSizeMb,
      },
      create: {
        shopDomain: shop,
        instagramUrl,
        autoApproveReviews,
        reviewsPerPage,
        allowMediaUploads,
        maxUploadSizeMb,
      },
    });

    return json({ success: true, message: "Settings saved successfully!", dbError: null });
  } catch (err: any) {
    return json({
      error: "Could not save to database: " + (err.message || "Database paused"),
      dbError: err.message,
    });
  }
};

export default function SettingsPage() {
  const { settings, dbError } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSaving = navigation.state === "submitting";

  const [instagramUrl, setInstagramUrl] = useState(settings.instagramUrl);
  const [autoApprove, setAutoApprove] = useState(settings.autoApproveReviews);
  const [reviewsPerPage, setReviewsPerPage] = useState(settings.reviewsPerPage);
  const [allowMedia, setAllowMedia] = useState(settings.allowMediaUploads);
  const [maxSizeMb, setMaxSizeMb] = useState(settings.maxUploadSizeMb);
  const [saved, setSaved] = useState(false);

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      submit(
        {
          instagramUrl,
          autoApproveReviews: String(autoApprove),
          reviewsPerPage: String(reviewsPerPage),
          allowMediaUploads: String(allowMedia),
          maxUploadSizeMb: String(maxSizeMb),
        },
        { method: "post" }
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
    [submit, instagramUrl, autoApprove, reviewsPerPage, allowMedia, maxSizeMb]
  );

  return (
    <Page title="App Settings" subtitle="Configure the Rebel app behaviour">
      <Layout>
        {dbError && (
          <Layout.Section>
            <Banner
              title="Database Paused or Connecting"
              tone="warning"
              action={{
                content: "Refresh",
                onAction: () => window.location.reload(),
              }}
              secondaryAction={{
                content: "Open Supabase Dashboard",
                url: "https://supabase.com/dashboard",
                external: true,
              }}
            >
              <p>Your Supabase project might be paused due to inactivity. Default settings are currently loaded.</p>
            </Banner>
          </Layout.Section>
        )}
        {saved && (
          <Layout.Section>
            <Banner tone="success" title="Settings saved successfully!" />
          </Layout.Section>
        )}

        {/* Product Customizer Management */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <BlockStack gap="100">
                  <Text variant="headingMd" as="h2">
                    🎨 Product Customizer Configuration
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Configure which products have text fields, 1 photo upload (Mugs/Cards), 2 photos (Couple frames), 4-6 photos + pop-out (Pop-Up Frames), or no customizer.
                  </Text>
                </BlockStack>
                <Button variant="primary" url="/app/customizer" size="large">
                  Manage Per-Product Customizer ➔
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Instagram Settings */}
        <Layout.Section>
          <Card>
            <form onSubmit={handleSubmit}>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    📸 Instagram Settings
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    This URL is shown at the bottom of every product's reviews
                    section as: "To check all reviews kindly visit our Instagram
                    highlight 'Reviews'"
                  </Text>
                </BlockStack>

                <TextField
                  label="Instagram Profile URL"
                  value={instagramUrl}
                  onChange={setInstagramUrl}
                  type="url"
                  placeholder="https://www.instagram.com/your_store"
                  helpText="Enter the full URL including https://"
                  autoComplete="off"
                />

                <Divider />

                {/* Reviews Settings */}
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    ⭐ Reviews Settings
                  </Text>
                </BlockStack>

                <Checkbox
                  label="Auto-approve reviews (skip moderation)"
                  checked={autoApprove}
                  onChange={setAutoApprove}
                  helpText="When enabled, all submitted reviews will be immediately visible to customers. Not recommended."
                />

                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">
                    Reviews per page: <strong>{reviewsPerPage}</strong>
                  </Text>
                  <RangeSlider
                    label=""
                    value={reviewsPerPage}
                    onChange={(v) => setReviewsPerPage(Number(v))}
                    min={3}
                    max={20}
                    step={1}
                    output
                  />
                </BlockStack>

                <Divider />

                {/* Upload Settings */}
                <BlockStack gap="200">
                  <Text variant="headingMd" as="h2">
                    📎 Upload Settings
                  </Text>
                </BlockStack>

                <Checkbox
                  label="Allow customers to upload images/videos with reviews"
                  checked={allowMedia}
                  onChange={setAllowMedia}
                />

                <BlockStack gap="100">
                  <Text as="p" variant="bodyMd">
                    Max upload size per file: <strong>{maxSizeMb} MB</strong>
                  </Text>
                  <RangeSlider
                    label=""
                    value={maxSizeMb}
                    onChange={(v) => setMaxSizeMb(Number(v))}
                    min={2}
                    max={50}
                    step={1}
                    output
                  />
                </BlockStack>

                <InlineStack align="end">
                  <Button
                    variant="primary"
                    submit
                    loading={isSaving}
                    size="large"
                  >
                    Save Settings
                  </Button>
                </InlineStack>
              </BlockStack>
            </form>
          </Card>
        </Layout.Section>

        {/* How to enable blocks */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                🎨 How to Enable App Blocks (One-time setup)
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                The app blocks are added to your store's theme non-destructively
                via the Theme Editor.
              </Text>
              <BlockStack gap="200">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Step 1 — Add Reviews Block to Product Pages:
                </Text>
                <Text as="p" variant="bodySm">
                  Online Store → Themes → Customize → Navigate to any Product
                  page → Click "Add block" → Select "Product Reviews"
                </Text>
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  Step 2 — Add Cart Customization Block:
                </Text>
                <Text as="p" variant="bodySm">
                  Online Store → Themes → Customize → Navigate to Cart page /
                  Cart Drawer → Click "Add block" → Select "Cart Customization"
                </Text>
              </BlockStack>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
