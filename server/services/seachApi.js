// לקוח לקטלוג המוצרים החיצוני של Seach (seach-data-api)
// ה-API ללא CORS ולכן תמיד מדובר בקריאה מצד השרת (proxy):
//   GET /products?query=&category=&page_size=&cursor=
//   מחזיר { products: [...], next_cursor } — page_size עד 100, cursor = offset בקידוד base64
// שדות מוצר: product_id, name_he, name_en, brand, category, form,
//            thc_percent, cbd_percent, terpenes, image_url, active

const BASE_URL = (process.env.SEACH_API_URL || 'https://seach-api.hinbit.com').replace(/\/+$/, '');
const PAGE_SIZE = 100;          // המקסימום שה-API מאפשר
const MAX_PRODUCTS = 2000;      // בלם בטיחות מפני לולאת עימוד אינסופית

function apiKey() {
  const key = process.env.SEACH_API_KEY;
  if (!key) {
    throw new Error('חסר מפתח SEACH_API_KEY בהגדרות הסביבה — לא ניתן לסנכרן את קטלוג המוצרים');
  }
  return key;
}

// ───────── שליפת כל הקטלוג (עימוד עם cursor) ─────────
async function fetchAllProducts() {
  const key = apiKey();
  const all = [];
  let cursor = null;

  while (all.length < MAX_PRODUCTS) {
    const url = new URL(`${BASE_URL}/products`);
    url.searchParams.set('page_size', String(PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }
    });
    if (!res.ok) {
      throw new Error(`קטלוג Seach החזיר שגיאה ${res.status} (${res.statusText})`);
    }

    const data = await res.json();
    const products = Array.isArray(data?.products) ? data.products : [];
    all.push(...products);

    cursor = data?.next_cursor || null;
    if (!cursor || products.length === 0) break; // הגענו לסוף הקטלוג
  }

  return all.slice(0, MAX_PRODUCTS);
}

// ───────── סנכרון לטבלת products המקומית (upsert) ─────────
// מחזיר את מספר המוצרים שסונכרנו
async function syncProducts(db) {
  const products = await fetchAllProducts();
  let count = 0;

  for (const p of products) {
    const id = String(p?.product_id || '').trim();
    if (!id) continue; // מוצר ללא מזהה — מדלגים

    await db.run(`
      INSERT INTO products
        (id, name_he, name_en, brand, category, form, thc_percent, cbd_percent, terpenes, image_url, active, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON DUPLICATE KEY UPDATE
        name_he     = VALUES(name_he),
        name_en     = VALUES(name_en),
        brand       = VALUES(brand),
        category    = VALUES(category),
        form        = VALUES(form),
        thc_percent = VALUES(thc_percent),
        cbd_percent = VALUES(cbd_percent),
        terpenes    = VALUES(terpenes),
        image_url   = VALUES(image_url),
        active      = VALUES(active),
        synced_at   = NOW()
    `, [
      id,
      String(p.name_he || p.name_en || id).slice(0, 200),
      p.name_en ? String(p.name_en).slice(0, 200) : null,
      p.brand ? String(p.brand).slice(0, 200) : null,
      p.category ? String(p.category).slice(0, 80) : null,
      p.form ? String(p.form).slice(0, 80) : null,
      p.thc_percent != null && !Number.isNaN(Number(p.thc_percent)) ? Number(p.thc_percent) : null,
      p.cbd_percent != null && !Number.isNaN(Number(p.cbd_percent)) ? Number(p.cbd_percent) : null,
      p.terpenes ? String(Array.isArray(p.terpenes) ? p.terpenes.join(', ') : p.terpenes).slice(0, 300) : null,
      p.image_url ? String(p.image_url).slice(0, 500) : null,
      p.active === false || p.active === 0 ? 0 : 1
    ]);
    count += 1;
  }

  return count;
}

module.exports = { fetchAllProducts, syncProducts };
