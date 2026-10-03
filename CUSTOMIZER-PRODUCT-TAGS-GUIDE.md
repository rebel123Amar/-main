# 🎯 Product Customizer — Per-Product Configuration Guide
### (Har Product Par Alag-Alag Fields & Image Limits Kaise Lagayein)

Ab aapka customizer **100% Dynamic** hai! Har product par alag fields aur alag photo limit lagane ke **2 aasan tareeqe** hain:

---

## Method 1: Product Tags (⭐ Sabse Aasan — Sirf 5 Seconds Me!)

Client ko theme code ya customizer kholne ki bhi zaroorat nahi hai. Shopify Admin me **Products** me jaakar product ke **Tags** me bas ek tag daalna hai:

| Agar Product Ye Hai | Tag Kya Daalna Hai | Result (Website Par Kya Dikhega) |
|---|---|---|
| **1 Photo Product** (Customized Mug, Keychain, Wallet Card, Acrylic) | `custom:1-photo` | Sirf **1 Photo** upload + Text field. Pop-out image gayab ho jayegi! |
| **2 Photos Product** (Double-sided keychain, Couple frame) | `custom:2-photos` | Sirf **2 Photos** upload + Text field. |
| **3 Photos Product** (3-Photo collage, Trio frame) | `custom:3-photos` | Sirf **3 Photos** upload + Text field. |
| **Pop Up Frame** (4 to 6 photos + Popout) | `custom:4-6-photos` | **4 se 6 Photos** collage + **1 Pop-Out** image + Text field. |
| **Jewellery / Engraving** (Name Necklace, Ring, Bracelet) | `custom:text-only` | Sirf **Text Input** field dikhega, photo upload poori tarah hide ho jayega! |
| **Photo Only (No Text)** | `custom:no-text` | Text input gayab ho jayega, sirf photo upload dikhega. |
| **No Pop-out Photo** | `custom:no-popout` | Pop-out photo field hide ho jayega. |
| **Normal Product** (T-Shirt, Standard items — No customization) | `custom:disable` | Customizer poori tarah hide ho jayega, normal Add to Cart chalega! |

> [!TIP]
> **Example**:
> Agar aapka product hai *"Customized Coffee Mug"*:
> Shopify Admin ➔ Products ➔ "Customized Coffee Mug" kholiye ➔ Tags section me type kijiye `custom:1-photo` ➔ **Save**!
> Website par us product par sirf 1 photo upload aur text aayega!

---

## Method 2: Theme Customize (Settings Ke Zariye)

Shopify Admin me **Online Store ➔ Customize** me jakar bhi control kar sakte hain:

1. Product page par **"Product Image Customizer"** block par click karein.
2. Right side settings me toggle options milenge:
   - ☑️ **Enable Text Input**: On / Off
   - **Text Field Label**: (e.g. "Enter Your Name" ya "Custom Message")
   - ☑️ **Make Text Mandatory**: Required / Optional
   - ☑️ **Enable Photo Upload**: On / Off
   - **Minimum Images Required**: (1, 2, 4, etc.)
   - **Maximum Images Allowed**: (1, 2, 6, etc.)
   - ☑️ **Enable Pop-Out Image**: On / Off
   - ☑️ **Make Pop-Out Mandatory**: On / Off

---

## Method 3: Shopify Metafields (Advanced)

Agar aap Shopify ke Metafields use karte hain, toh in metafields ko use kar sakte hain:
- `product.metafields.custom.min_images` (Number: e.g. 1)
- `product.metafields.custom.max_images` (Number: e.g. 1)
- `product.metafields.custom.enable_text` (Boolean: true/false)
- `product.metafields.custom.enable_popout` (Boolean: true/false)

---

### 🎉 Client Ko Kya Fayda Hoga?
- Ab Pop Up Frame par 4-6 images aayengi.
- Mug aur Keychain par sirf 1 photo aayegi.
- Name jewellery par sirf text aayega.
- Aur normal products par customizer hide ho jayega!
