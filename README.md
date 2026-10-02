# Rebel Gifts — Cart Drawer Customization Setup

Bhai, **image upload sidebar me kyun nahi dikh raha tha:**
- Aapke computer par jo file hai (`snippets/cart-drawer.liquid`), wo local computer me saved thi. 
- Shopify dev server sirf `extensions/` folder ko sync karta hai, local `snippets/` ko online store par automatically upload nahi karta.
- Isliye jab tak aap is code ko Shopify Admin me paste nahi karte ya App Embed ON nahi karte, Shopify store par purana drawer hi chalta rehta hai.

Humne iska **2 tarike se 100% solution** ready kar diya hai:

---

### Option 1 (Sabse Best & Direct — 30 Seconds)
1. Apne editor me file kholo: [`snippets/cart-drawer.liquid`](file:///c:/Users/AMARJEET/.gemini/antigravity/playground/rebel/snippets/cart-drawer.liquid)
2. Saara code select karke copy kar lo (`Ctrl + A`, fir `Ctrl + C`).
3. Shopify Admin me jao:
   - **Online Store** → **Themes** → **... (3 dots)** → **Edit code**.
   - Left search box me type karo: `cart-drawer.liquid`
   - File ka purana code delete karke ye naya code paste karo aur **Save** daba do!

*(Note: Humne section ko products ke theek neeche scrollable area me set kar diya hai taaki Subtotal aur Checkout button ke sath perfect scroll ho).*

---

### Option 2 (Bina Code Touch Kiye — 1-Click App Embed)
Agar aap code copy-paste nahi karna chahte:
1. Shopify Admin me **Online Store** → **Themes** → **Customize** par click karein.
2. Left sidebar me **3rd icon (⬡ App embeds)** par click karein.
3. Wahan **"Rebel Cart Drawer"** toggle ko **ON** karein aur upar **Save** kar dein.
4. Ye feature automatically har page ke sidebar cart drawer me photo upload aur instructions inject kar dega!


