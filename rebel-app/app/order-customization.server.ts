import { prisma } from "./shopify.server";

export async function handleOrderCreate(shop: string, order: any) {
  try {
    const note = order.note || "";
    const attributes: Array<{ name: string; value: string }> = order.note_attributes || [];

    // Find image URLs stored as cart attributes
    let imageUrls: string[] = [];
    const imageAttr = attributes.find(
      (a) =>
        a.name === "_rebel_upload_urls" ||
        a.name === "rebel_upload_urls" ||
        a.name === "Uploaded Images"
    );

    if (imageAttr?.value) {
      try {
        const parsed = JSON.parse(imageAttr.value);
        if (Array.isArray(parsed)) {
          imageUrls = parsed;
        }
      } catch (_) {
        if (imageAttr.value.startsWith("http")) {
          imageUrls = [imageAttr.value];
        }
      }
    }

    // Fallback: look for individual Custom Image attributes
    for (const attr of attributes) {
      if (/^Custom Image \d+/i.test(attr.name) && attr.value && attr.value.startsWith("http")) {
        if (!imageUrls.includes(attr.value)) {
          imageUrls.push(attr.value);
        }
      }
    }

    // Find special instructions
    const specialRequestAttr = attributes.find(
      (a) =>
        a.name === "_rebel_special_request" ||
        a.name === "rebel_special_request" ||
        a.name === "Special Instructions" ||
        a.name === "special_instructions"
    );

    let specialRequest = (specialRequestAttr?.value || note || "").trim();

    // ALSO: Extract images & text from line item properties (Product Page Customizer)
    const lineItems = order.line_items || order.lineItems || [];
    for (const item of lineItems) {
      const props = item.properties || item.customAttributes || [];
      for (const p of props) {
        const key = p.name || p.key || "";
        const val = typeof p.value === "string" ? p.value.trim() : "";
        if (!val) continue;

        if (val.startsWith("http://") || val.startsWith("https://")) {
          if (!imageUrls.includes(val)) {
            imageUrls.push(val);
          }
        } else if (/enter text|custom text|customization/i.test(key)) {
          if (!specialRequest) {
            specialRequest = val;
          } else if (!specialRequest.includes(val)) {
            specialRequest += ` | ${val}`;
          }
        }
      }
    }

    // Only save if there's actual custom data
    if (!specialRequest && imageUrls.length === 0) {
      return;
    }

    await prisma.orderCustomization.upsert({
      where: { shopDomain_orderId: { shopDomain: shop, orderId: String(order.id) } },
      update: {
        orderName: order.name || `#${order.order_number || order.id}`,
        specialRequest,
        imageUrls: JSON.stringify(imageUrls),
        updatedAt: new Date(),
      },
      create: {
        shopDomain: shop,
        orderId: String(order.id),
        orderName: order.name || `#${order.order_number || order.id}`,
        specialRequest,
        imageUrls: JSON.stringify(imageUrls),
      },
    });

    console.log(`[Rebel] Saved order customization for order ${order.name || order.id} (${shop})`);
  } catch (err) {
    console.error("[Rebel handleOrderCreate error]", err);
  }
}
