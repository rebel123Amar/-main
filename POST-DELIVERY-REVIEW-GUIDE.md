# ⭐ Post-Delivery Product Review System — Complete Guide
### (Product Deliver Hone Ke Baad Customer Se Star Rating, Text & Photos Review Lene Ka System)

Bhai, tumhare requirement ke hisaab se poora **Post-Delivery Product Review System** code aur connect ho chuka hai!

---

## 🚀 1. Yeh System Kaise Kaam Karta Hai? (Customer Flow)

Jab koi customer store par koi customized gift ya product khareedta hai aur wo product **deliver ho jata hai**:

### A) 1-Click WhatsApp Review Link (Admin Dashboard Se):
1. Shopify Admin me **Apps** ➔ **Rebel Custom App** open karein.
2. **"Custom Orders & Uploads"** tab me har order ke aage **"⭐ Post-Delivery Review"** bar dikhega:
   - **📱 WhatsApp Review Link**: Is par click karte hi customer ke WhatsApp par pre-filled message open ho jayega:
     > *"Hi! Hope you loved your order #1042 from Rebel Gifts. We would love your review and unboxing photos! Please rate your experience here: https://your-store.com/?review_order=1042"*
   - **📋 Copy Link**: Is par click karke aap direct link copy kar sakte ho aur customer ko Email, SMS ya Instagram DM par bhej sakte ho.

### B) Customer Review Popup (Website Par):
Jab customer WhatsApp/SMS wale link par click karke website open karega:
1. Website par turant ek modern **Review Popup Card** aayega:
   - 🎁 **Order Reference**: `Order #1042 — Rebel Gifts & Mosambi`
   - ⭐ **Interactive 1 to 5 Star Rating**: Customer 1 se 5 stars select karega.
   - ✍️ **Customer Details**: Name aur Email input.
   - 📝 **Review & Unboxing Feedback (Textarea)**: Quality, packaging, aur delivery ke baare me text likhne ke liye.
   - 📸 **Photo & Media Upload**: Phone ya gallery se multiple product photos aur unboxing pictures select karne ka option. Live photo thumbnail aur remove (✕) button ke sath!
   - 🚀 **"Submit Review"**: Submit karte hi photos Supabase Storage me upload ho jayengi aur review live database me save ho jayega!

---

## 📦 2. Order Status / Thank You Page Par Review Card (Automatic Widget)

Humne `snippets/order-delivered-review.liquid` banaya hai. 

Agar aap chahte hain ki customer jab bhi apna **Order Status / Tracking Page** open kare, wahan automatically unke delivered products ke review cards dikhein:
1. Shopify Admin ➔ **Settings** ➔ **Checkout** me jayein.
2. Scroll karke **Order status page additional scripts** me ye 1 line add karein:
   ```html
   {% render 'order-delivered-review' %}
   ```
3. Save karein! Ab har customer ko unke Order Status page par direct Star Rating, Textarea, aur Photo Upload widget dikhega!

---

## 🛡️ 3. Aapke Rebel App Me Kaise Dikhega? (Admin Moderation)

1. Shopify Admin ➔ **Apps** ➔ **Rebel Custom App** ➔ **"Review Moderation"** (`app.reviews.tsx`) open karein.
2. Saare submitted reviews yahan real-time me list honge:
   - ⭐ Customer ki di hui Star Rating (1 se 5 stars)
   - 🟢 **✓ Verified Order #...** badge (verified purchase proof)
   - 👤 Customer Name, Email, aur Date
   - 💬 Unka likha hua review
   - 🖼️ Unki upload ki hui Photos/Unboxing images (click karke full view dekh sakte ho)
3. Action buttons:
   - **✓ Approve**: Click karte hi review store ke product page par live display ho jayega.
   - **✗ Reject**: Agar review spam ya invalid hai toh reject kar sakte ho.
   - **Delete**: Permanently delete karne ke liye.

---

## 🧪 4. Live Test Kaise Karein? (Testing Steps)

Aap kisi bhi browser tab me apni website ka URL is tarah open karke test kar sakte ho:
```text
https://your-store-url.com/?review_order=1042
```
Turant screen par **Review Popup Card** aayega ➔ Stars select karo ➔ Text likho ➔ Photos select karo ➔ Submit karo ➔ Phir apne Rebel App ke Reviews tab me check karo!
