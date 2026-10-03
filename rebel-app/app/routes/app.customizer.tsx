import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Banner,
  Checkbox,
  RangeSlider,
  Divider,
  Modal,
  Badge,
  Thumbnail,
  EmptyState,
  Select,
  Box,
  RadioButton,
} from "@shopify/polaris";
import { useState, useCallback, useMemo } from "react";
import { authenticate } from "../shopify.server";

export interface CustomizerConfig {
  enabled: boolean;
  preset: string; // '1-photo' | '2-photos' | 'popup-frame' | 'text-only' | 'no-text' | 'disabled' | 'custom'
  enableText: boolean;
  textLabel: string;
  textPlaceholder: string;
  textRequired: boolean;
  enablePhotos: boolean;
  photosLabel: string;
  minPhotos: number;
  maxPhotos: number;
  enablePopout: boolean;
  popoutLabel: string;
  popoutRequired: boolean;
}

export interface ProductNode {
  id: string;
  title: string;
  handle: string;
  featuredImage?: {
    url: string;
    altText?: string;
  } | null;
  tags: string[];
  config: CustomizerConfig | null;
  effectivePreset: string;
}

const DEFAULT_CONFIG: CustomizerConfig = {
  enabled: true,
  preset: "1-photo",
  enableText: true,
  textLabel: "Enter Text / Name",
  textPlaceholder: "e.g. Rahul & Priya",
  textRequired: false,
  enablePhotos: true,
  photosLabel: "Upload Photo",
  minPhotos: 1,
  maxPhotos: 1,
  enablePopout: false,
  popoutLabel: "Pop-Out Photo",
  popoutRequired: false,
};

const PRESETS: Record<string, Partial<CustomizerConfig>> = {
  "1-photo": {
    enabled: true,
    preset: "1-photo",
    enableText: true,
    textLabel: "Enter Name / Special Message",
    textPlaceholder: "e.g. Happy Birthday Rahul",
    textRequired: false,
    enablePhotos: true,
    photosLabel: "Upload Your Photo (1 Image)",
    minPhotos: 1,
    maxPhotos: 1,
    enablePopout: false,
    popoutRequired: false,
  },
  "2-photos": {
    enabled: true,
    preset: "2-photos",
    enableText: true,
    textLabel: "Enter Name / Note",
    textPlaceholder: "e.g. Anniversary Wishes",
    textRequired: false,
    enablePhotos: true,
    photosLabel: "Upload 2 Photos",
    minPhotos: 2,
    maxPhotos: 2,
    enablePopout: false,
    popoutRequired: false,
  },
  "popup-frame": {
    enabled: true,
    preset: "popup-frame",
    enableText: true,
    textLabel: "Enter Text / Message",
    textPlaceholder: "e.g. Best Memories",
    textRequired: false,
    enablePhotos: true,
    photosLabel: "Select (4-6) Collage Images",
    minPhotos: 4,
    maxPhotos: 6,
    enablePopout: true,
    popoutLabel: "Select 1 Pop-Out Center Image",
    popoutRequired: true,
  },
  "text-only": {
    enabled: true,
    preset: "text-only",
    enableText: true,
    textLabel: "Enter Name to Engrave",
    textPlaceholder: "e.g. Priya",
    textRequired: true,
    enablePhotos: false,
    minPhotos: 0,
    maxPhotos: 0,
    enablePopout: false,
    popoutRequired: false,
  },
  "no-text": {
    enabled: true,
    preset: "no-text",
    enableText: false,
    enablePhotos: true,
    photosLabel: "Upload Photos",
    minPhotos: 1,
    maxPhotos: 3,
    enablePopout: false,
    popoutRequired: false,
  },
  disabled: {
    enabled: false,
    preset: "disabled",
    enableText: false,
    enablePhotos: false,
    enablePopout: false,
  },
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  let queryFilter = "";
  if (search.trim()) {
    queryFilter = `title:*${search.trim()}*`;
  }

  const response = await admin.graphql(
    `#graphql
      query getProductsList($query: String) {
        products(first: 50, query: $query) {
          edges {
            node {
              id
              title
              handle
              featuredImage {
                url
                altText
              }
              tags
              metafield(namespace: "rebel_customizer", key: "config") {
                id
                value
              }
            }
          }
        }
      }
    `,
    { variables: { query: queryFilter || undefined } }
  );

  const resJson = await response.json();
  const rawProducts = resJson.data?.products?.edges || [];

  const products: ProductNode[] = rawProducts.map(({ node }: any) => {
    let config: CustomizerConfig | null = null;
    if (node.metafield?.value) {
      try {
        config = JSON.parse(node.metafield.value);
      } catch (e) {
        config = null;
      }
    }

    // Determine effective preset based on metafield or tags
    let effectivePreset = "unconfigured";
    if (config) {
      if (!config.enabled) effectivePreset = "disabled";
      else effectivePreset = config.preset || "custom";
    } else {
      const lowerTags = node.tags.map((t: string) => t.toLowerCase().trim());
      if (lowerTags.includes("custom:disable") || lowerTags.includes("no-custom")) {
        effectivePreset = "disabled";
      } else if (lowerTags.includes("custom:1-photo") || lowerTags.includes("1-photo")) {
        effectivePreset = "1-photo";
      } else if (lowerTags.includes("custom:2-photos") || lowerTags.includes("2-photos")) {
        effectivePreset = "2-photos";
      } else if (lowerTags.includes("custom:4-6-photos") || lowerTags.includes("popup-frame")) {
        effectivePreset = "popup-frame";
      } else if (lowerTags.includes("custom:text-only") || lowerTags.includes("text-only")) {
        effectivePreset = "text-only";
      } else if (lowerTags.includes("custom:no-text") || lowerTags.includes("no-text")) {
        effectivePreset = "no-text";
      }
    }

    return {
      id: node.id,
      title: node.title,
      handle: node.handle,
      featuredImage: node.featuredImage,
      tags: node.tags,
      config,
      effectivePreset,
    };
  });

  return json({ products, shop, search });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId") as string;
  const productTitle = formData.get("productTitle") as string;
  const enabled = formData.get("enabled") === "true";
  const preset = formData.get("preset") as string;
  const enableText = formData.get("enableText") === "true";
  const textLabel = (formData.get("textLabel") as string) || "Enter Text";
  const textPlaceholder = (formData.get("textPlaceholder") as string) || "Enter Text";
  const textRequired = formData.get("textRequired") === "true";
  const enablePhotos = formData.get("enablePhotos") === "true";
  const photosLabel = (formData.get("photosLabel") as string) || "Upload Photos";
  const minPhotos = parseInt(formData.get("minPhotos") as string) || 1;
  const maxPhotos = parseInt(formData.get("maxPhotos") as string) || 1;
  const enablePopout = formData.get("enablePopout") === "true";
  const popoutLabel = (formData.get("popoutLabel") as string) || "Pop-Out Photo";
  const popoutRequired = formData.get("popoutRequired") === "true";

  if (!productId) {
    return json({ error: "Product ID is required" }, { status: 400 });
  }

  const configData: CustomizerConfig = {
    enabled,
    preset,
    enableText,
    textLabel,
    textPlaceholder,
    textRequired,
    enablePhotos,
    photosLabel,
    minPhotos,
    maxPhotos,
    enablePopout,
    popoutLabel,
    popoutRequired,
  };

  // 1. Update Metafield on product
  const metafieldResponse = await admin.graphql(
    `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      variables: {
        metafields: [
          {
            ownerId: productId,
            namespace: "rebel_customizer",
            key: "config",
            type: "json",
            value: JSON.stringify(configData),
          },
        ],
      },
    }
  );

  const metafieldJson = await metafieldResponse.json();
  if (metafieldJson.data?.metafieldsSet?.userErrors?.length > 0) {
    const errorMsg = metafieldJson.data.metafieldsSet.userErrors[0].message;
    return json({ error: `Failed to save configuration: ${errorMsg}` }, { status: 500 });
  }

  // 2. Sync product tags for backward-compatibility & Shopify Admin visibility
  const tagsToRemove = [
    "custom:1-photo",
    "custom:2-photos",
    "custom:3-photos",
    "custom:4-6-photos",
    "custom:popup-frame",
    "custom:text-only",
    "custom:no-text",
    "custom:no-popout",
    "custom:disable",
    "custom:disabled",
  ];

  await admin.graphql(
    `#graphql
      mutation tagsRemove($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors {
            field
            message
          }
        }
      }
    `,
    { variables: { id: productId, tags: tagsToRemove } }
  );

  let newTag = "";
  if (!enabled) {
    newTag = "custom:disable";
  } else if (preset === "1-photo") {
    newTag = "custom:1-photo";
  } else if (preset === "2-photos") {
    newTag = "custom:2-photos";
  } else if (preset === "popup-frame") {
    newTag = "custom:4-6-photos";
  } else if (preset === "text-only") {
    newTag = "custom:text-only";
  } else if (preset === "no-text") {
    newTag = "custom:no-text";
  }

  if (newTag) {
    await admin.graphql(
      `#graphql
        mutation tagsAdd($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors {
              field
              message
            }
          }
        }
      `,
      { variables: { id: productId, tags: [newTag] } }
    );
  }

  return json({
    success: true,
    message: `Customizer configuration saved for "${productTitle}"!`,
  });
};

export default function CustomizerPage() {
  const { products, shop, search } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const submit = useSubmit();
  const isSaving = navigation.state === "submitting";

  const [searchTerm, setSearchTerm] = useState(search);
  const [filterPreset, setFilterPreset] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState<ProductNode | null>(null);

  // Form State inside modal
  const [config, setConfig] = useState<CustomizerConfig>(DEFAULT_CONFIG);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Open modal with existing config or preset default
  const openEditModal = useCallback((product: ProductNode) => {
    setSelectedProduct(product);
    if (product.config) {
      setConfig({ ...DEFAULT_CONFIG, ...product.config });
    } else if (product.effectivePreset && PRESETS[product.effectivePreset]) {
      setConfig({
        ...DEFAULT_CONFIG,
        ...PRESETS[product.effectivePreset],
        preset: product.effectivePreset,
      });
    } else {
      // Default to 1-photo configuration
      setConfig({ ...DEFAULT_CONFIG, preset: "1-photo" });
    }
  }, []);

  const closeModal = useCallback(() => {
    setSelectedProduct(null);
  }, []);

  // Handle Preset selection
  const handlePresetChange = useCallback((presetKey: string) => {
    if (PRESETS[presetKey]) {
      setConfig((prev) => ({
        ...prev,
        ...PRESETS[presetKey],
        preset: presetKey,
      }));
    } else if (presetKey === "custom") {
      setConfig((prev) => ({ ...prev, preset: "custom" }));
    }
  }, []);

  const handleSave = useCallback(() => {
    if (!selectedProduct) return;

    submit(
      {
        productId: selectedProduct.id,
        productTitle: selectedProduct.title,
        enabled: String(config.enabled),
        preset: config.preset,
        enableText: String(config.enableText),
        textLabel: config.textLabel,
        textPlaceholder: config.textPlaceholder,
        textRequired: String(config.textRequired),
        enablePhotos: String(config.enablePhotos),
        photosLabel: config.photosLabel,
        minPhotos: String(config.minPhotos),
        maxPhotos: String(config.maxPhotos),
        enablePopout: String(config.enablePopout),
        popoutLabel: config.popoutLabel,
        popoutRequired: String(config.popoutRequired),
      },
      { method: "post" }
    );

    setToastMessage(`Saved settings for ${selectedProduct.title}!`);
    setTimeout(() => setToastMessage(null), 4000);
    closeModal();
  }, [submit, selectedProduct, config, closeModal]);

  const handleSearchSubmit = useCallback(() => {
    submit({ search: searchTerm }, { method: "get" });
  }, [submit, searchTerm]);

  // Filter products by selected preset filter
  const filteredProducts = useMemo(() => {
    if (filterPreset === "all") return products;
    if (filterPreset === "configured")
      return products.filter((p) => p.config !== null || p.effectivePreset !== "unconfigured");
    if (filterPreset === "disabled")
      return products.filter((p) => p.effectivePreset === "disabled");
    return products.filter((p) => p.effectivePreset === filterPreset);
  }, [products, filterPreset]);

  const getPresetBadge = (preset: string) => {
    switch (preset) {
      case "1-photo":
        return <Badge tone="info">📷 1 Photo (Mug / Keychain)</Badge>;
      case "2-photos":
        return <Badge tone="info">👥 2 Photos (Couple Frame)</Badge>;
      case "popup-frame":
        return <Badge tone="success">🖼️ Pop-Up Frame (4-6 Photos + Pop-out)</Badge>;
      case "text-only":
        return <Badge tone="warning">✍️ Text / Engraving Only</Badge>;
      case "no-text":
        return <Badge tone="info">📸 Photos Only (No Text)</Badge>;
      case "disabled":
        return <Badge tone="critical">🚫 Customizer Disabled (Normal)</Badge>;
      case "custom":
        return <Badge tone="attention">⚙️ Custom Setup</Badge>;
      default:
        return <Badge tone="subdued">⚪ Unconfigured (Theme Default)</Badge>;
    }
  };

  return (
    <Page
      title="Product Customizer Settings"
      subtitle="Control which products have custom text, upload limits (1 photo, 2 photos, 4-6 photos), or secondary pop-out images"
    >
      <Layout>
        {toastMessage && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setToastMessage(null)}>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {toastMessage}
              </Text>
            </Banner>
          </Layout.Section>
        )}

        {/* Info card */}
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
              <Text variant="headingMd" as="h2">
                💡 Har Product Par Alag Setup Kaise Kaam Karta Hai?
              </Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Neeche di gayi product list me se kisi bhi product par <strong>"Configure"</strong> par click karein.
                Aap 1-click me Preset choose kar sakte hain (e.g. <strong>Mug / Keychain ke liye 1 Photo</strong>, <strong>Pop-Up Frame ke liye 4-6 Photos</strong>, ya <strong>Jewellery ke liye Sirf Text</strong>), ya fir custom limits set kar sakte hain. Save karte hi live website par wahi structure dikhega!
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Filter & Search Bar */}
        <Layout.Section>
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="400">
              <div style={{ flex: 1, minWidth: "240px" }}>
                <TextField
                  label="Search product by title"
                  labelHidden
                  placeholder="Search product title..."
                  value={searchTerm}
                  onChange={setSearchTerm}
                  autoComplete="off"
                  clearButton
                  onClearButtonClick={() => {
                    setSearchTerm("");
                    submit({ search: "" }, { method: "get" });
                  }}
                  connectedRight={
                    <Button onClick={handleSearchSubmit} variant="secondary">
                      Search
                    </Button>
                  }
                />
              </div>

              <div style={{ width: "260px" }}>
                <Select
                  label="Filter by Preset"
                  labelHidden
                  options={[
                    { label: "All Products", value: "all" },
                    { label: "Configured Products", value: "configured" },
                    { label: "1 Photo Products", value: "1-photo" },
                    { label: "2 Photos Products", value: "2-photos" },
                    { label: "Pop-Up Frame (4-6 Photos)", value: "popup-frame" },
                    { label: "Text / Engraving Only", value: "text-only" },
                    { label: "Disabled / Normal Products", value: "disabled" },
                  ]}
                  value={filterPreset}
                  onChange={setFilterPreset}
                />
              </div>
            </InlineStack>
          </Card>
        </Layout.Section>

        {/* Products List */}
        <Layout.Section>
          <Card>
            {filteredProducts.length === 0 ? (
              <EmptyState
                heading="No products found"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>Try searching for a different product name or clearing filters.</p>
              </EmptyState>
            ) : (
              <BlockStack gap="400">
                <Text variant="headingSm" as="h3">
                  Products ({filteredProducts.length})
                </Text>
                <Divider />

                {filteredProducts.map((prod) => (
                  <Box
                    key={prod.id}
                    padding="300"
                    background="bg-surface-secondary"
                    borderRadius="200"
                  >
                    <InlineStack align="space-between" blockAlign="center" gap="400">
                      {/* Product Thumbnail & Title */}
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={
                            prod.featuredImage?.url ||
                            "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"
                          }
                          alt={prod.featuredImage?.altText || prod.title}
                          size="medium"
                        />
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="semibold" as="span">
                            {prod.title}
                          </Text>
                          <InlineStack gap="200" blockAlign="center">
                            {getPresetBadge(prod.effectivePreset)}
                            <Text variant="bodyXs" tone="subdued" as="span">
                              Handle: /{prod.handle}
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      </InlineStack>

                      {/* Actions */}
                      <InlineStack gap="200">
                        <Button
                          variant="secondary"
                          url={`https://${shop}/products/${prod.handle}`}
                          target="_blank"
                          size="slim"
                        >
                          👁️ View Live
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => openEditModal(prod)}
                          size="slim"
                        >
                          ⚙️ Configure
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* Edit Configuration Modal */}
      {selectedProduct && (
        <Modal
          open={Boolean(selectedProduct)}
          onClose={closeModal}
          title={`Configure Customizer — ${selectedProduct.title}`}
          primaryAction={{
            content: "Save Configuration",
            onAction: handleSave,
            loading: isSaving,
          }}
          secondaryActions={[
            {
              content: "Cancel",
              onAction: closeModal,
            },
            {
              content: "View Product Storefront ↗",
              url: `https://${shop}/products/${selectedProduct.handle}`,
              external: true,
            },
          ]}
        >
          <Modal.Section>
            <BlockStack gap="500">
              {/* Master Enable/Disable */}
              <Box padding="300" background="bg-surface-secondary" borderRadius="200">
                <Checkbox
                  label="Enable Customizer on this product"
                  helpText="Agar disable karenge toh normal Add to Cart button chalega aur photo/text customizer gayab ho jayega."
                  checked={config.enabled}
                  onChange={(val) => setConfig((prev) => ({ ...prev, enabled: val }))}
                />
              </Box>

              {config.enabled && (
                <>
                  {/* Preset Selector */}
                  <BlockStack gap="200">
                    <Text variant="headingSm" as="h3">
                      ⚡ Quick Presets (1-Click Choose)
                    </Text>
                    <InlineStack gap="300" wrap>
                      <RadioButton
                        label="📷 1 Photo (Mug / Keychain / Card)"
                        checked={config.preset === "1-photo"}
                        id="preset-1-photo"
                        name="preset"
                        onChange={() => handlePresetChange("1-photo")}
                      />
                      <RadioButton
                        label="👥 2 Photos (Couple Frame)"
                        checked={config.preset === "2-photos"}
                        id="preset-2-photos"
                        name="preset"
                        onChange={() => handlePresetChange("2-photos")}
                      />
                      <RadioButton
                        label="🖼️ Pop-Up Frame (4-6 Photos + Pop-out)"
                        checked={config.preset === "popup-frame"}
                        id="preset-popup-frame"
                        name="preset"
                        onChange={() => handlePresetChange("popup-frame")}
                      />
                      <RadioButton
                        label="✍️ Text Only (Jewellery / Name Engraving)"
                        checked={config.preset === "text-only"}
                        id="preset-text-only"
                        name="preset"
                        onChange={() => handlePresetChange("text-only")}
                      />
                      <RadioButton
                        label="📸 Photo Only (No Text Field)"
                        checked={config.preset === "no-text"}
                        id="preset-no-text"
                        name="preset"
                        onChange={() => handlePresetChange("no-text")}
                      />
                      <RadioButton
                        label="⚙️ Custom Setup"
                        checked={config.preset === "custom"}
                        id="preset-custom"
                        name="preset"
                        onChange={() => handlePresetChange("custom")}
                      />
                    </InlineStack>
                  </BlockStack>

                  <Divider />

                  {/* 1. Custom Text Input Settings */}
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      1. Custom Text Field
                    </Text>
                    <Checkbox
                      label="Enable Custom Text Input Field"
                      checked={config.enableText}
                      onChange={(val) => setConfig((prev) => ({ ...prev, enableText: val }))}
                    />

                    {config.enableText && (
                      <BlockStack gap="300">
                        <TextField
                          label="Text Field Label"
                          value={config.textLabel}
                          onChange={(val) => setConfig((prev) => ({ ...prev, textLabel: val }))}
                          autoComplete="off"
                        />
                        <TextField
                          label="Placeholder Text"
                          value={config.textPlaceholder}
                          onChange={(val) => setConfig((prev) => ({ ...prev, textPlaceholder: val }))}
                          autoComplete="off"
                        />
                        <Checkbox
                          label="Make Text Field Mandatory (Customer must enter text to add to cart)"
                          checked={config.textRequired}
                          onChange={(val) => setConfig((prev) => ({ ...prev, textRequired: val }))}
                        />
                      </BlockStack>
                    )}
                  </BlockStack>

                  <Divider />

                  {/* 2. Photo Upload Settings */}
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      2. Photo Upload Limits & Field
                    </Text>
                    <Checkbox
                      label="Enable Photo Upload"
                      checked={config.enablePhotos}
                      onChange={(val) => setConfig((prev) => ({ ...prev, enablePhotos: val }))}
                    />

                    {config.enablePhotos && (
                      <BlockStack gap="300">
                        <TextField
                          label="Photo Upload Section Label"
                          value={config.photosLabel}
                          onChange={(val) => setConfig((prev) => ({ ...prev, photosLabel: val }))}
                          autoComplete="off"
                        />

                        <InlineStack gap="400" wrap={false}>
                          <div style={{ flex: 1 }}>
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd">
                                Min Photos Required: <strong>{config.minPhotos}</strong>
                              </Text>
                              <RangeSlider
                                label=""
                                value={config.minPhotos}
                                onChange={(val) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    minPhotos: Number(val),
                                    maxPhotos: Math.max(Number(val), prev.maxPhotos),
                                  }))
                                }
                                min={1}
                                max={10}
                                step={1}
                                output
                              />
                            </BlockStack>
                          </div>

                          <div style={{ flex: 1 }}>
                            <BlockStack gap="100">
                              <Text as="p" variant="bodyMd">
                                Max Photos Allowed: <strong>{config.maxPhotos}</strong>
                              </Text>
                              <RangeSlider
                                label=""
                                value={config.maxPhotos}
                                onChange={(val) =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    maxPhotos: Number(val),
                                    minPhotos: Math.min(Number(val), prev.minPhotos),
                                  }))
                                }
                                min={1}
                                max={10}
                                step={1}
                                output
                              />
                            </BlockStack>
                          </div>
                        </InlineStack>

                        <Text as="p" variant="bodyXs" tone="subdued">
                          💡 Note: If Max Photos is set to 1, selecting a new image automatically replaces the previous one without needing to delete it first!
                        </Text>
                      </BlockStack>
                    )}
                  </BlockStack>

                  <Divider />

                  {/* 3. Pop-Out / Secondary Photo Settings */}
                  <BlockStack gap="300">
                    <Text variant="headingSm" as="h3">
                      3. Pop-Out / Secondary Photo
                    </Text>
                    <Checkbox
                      label="Enable Pop-Out / Center Photo Field"
                      helpText="Khass taur par Pop-Up Frames ya Special Double-focus frames ke liye."
                      checked={config.enablePopout}
                      onChange={(val) => setConfig((prev) => ({ ...prev, enablePopout: val }))}
                    />

                    {config.enablePopout && (
                      <BlockStack gap="300">
                        <TextField
                          label="Pop-Out Field Label"
                          value={config.popoutLabel}
                          onChange={(val) => setConfig((prev) => ({ ...prev, popoutLabel: val }))}
                          autoComplete="off"
                        />
                        <Checkbox
                          label="Make Pop-Out Photo Mandatory"
                          checked={config.popoutRequired}
                          onChange={(val) => setConfig((prev) => ({ ...prev, popoutRequired: val }))}
                        />
                      </BlockStack>
                    )}
                  </BlockStack>
                </>
              )}
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}
    </Page>
  );
}
