// api/stok.js
// Menarik stok dari supplier lalu menormalkan jadi [{sku,name,stock}]
// ENV opsional: UPSTREAM_URL, CORS_ORIGIN, FETCH_TIMEOUT_MS

module.exports = async (req, res) => {
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });

  const UPSTREAM = process.env.UPSTREAM_URL
    // default: endpoint yang sama dipakai bot untuk akrab
    || "https://panel.khfy-store.com/api_v3/cek_stock_akrab";

  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // --- fetch ke supplier (seperti di bot: cekStok) ---
    const r = await fetch(UPSTREAM, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    const text = await r.text();

    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }

    // --- normalisasi seperti extractStockList di bot ---
    function extractStockList(raw) {
      // 1) Coba dari array/objek terstruktur
      const data = Array.isArray(raw?.data) ? raw.data
        : (Array.isArray(raw) ? raw : (raw?.items || raw?.result || raw?.rows || []));

      const out = [];
      for (const it of data) {
        if (!it) continue;
        const lower = {}; for (const k in it) lower[k.toLowerCase()] = it[k];
        const sku = String(lower.sku || lower.kode || lower.code || lower.product || lower.product_code || '').toUpperCase();
        const name = String(lower.nama || lower.name || lower.product_name || lower.title || sku || '-');
        let stock = lower.stock ?? lower.stok ?? lower.qty ?? lower.quantity ?? lower.sisa ?? lower.available ?? lower.status;
        if (!sku) continue;

        let nstock;
        if (typeof stock === 'boolean') nstock = stock ? 1 : 0;
        else if (typeof stock === 'string') {
          const s = stock.trim();
          if (/^-?\d+$/.test(s)) nstock = parseInt(s, 10);
          else if (/ready|tersedia|available|ada/i.test(s)) nstock = 1;
          else if (/habis|sold ?out|kosong|tidak/i.test(s)) nstock = 0;
          else continue;
        } else {
          nstock = Number(stock);
          if (Number.isNaN(nstock)) continue;
        }
        out.push({ sku, name, stock: nstock });
      }
      if (out.length) return out;

      // 2) Fallback: parse baris "(KODE) Nama ... : 0"
      const msg = String(raw?.data?.message || raw?.message || '').trim();
      if (!msg) return [];
      const lines = msg.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
      const seen = new Set();
      for (const line of lines) {
        const m = line.match(/^\(([^)]+)\).*?:\s*(-?\d+)\s*$/);
        if (!m) continue;
        const sku = m[1].toUpperCase();
        const stock = parseInt(m[2], 10);
        if (!Number.isFinite(stock) || seen.has(sku)) continue;
        seen.add(sku);
        out.push({ sku, name: sku, stock });
      }
      return out;
    }

    const list = extractStockList(json);
    if (!list.length) {
      return res.status(502).json({ ok: false, error: "Upstream tidak mengembalikan daftar stok.", upstream_ok: r.ok, upstream_status: r.status, data: json });
    }

    // teks mirip bot: "(KODE) Nama : stok"
    const lines = list.map(it => `(${it.sku}) ${it.name} : ${it.stock}`);
    const textBlock = lines.join("\n");

    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return res.status(200).json({ ok: true, count: list.length, list, text: textBlock });
  } catch (e) {
    const isAbort = e && (e.name === "AbortError" || e.code === "ABORT_ERR");
    return res.status(isAbort ? 504 : 502).json({ ok: false, error: isAbort ? "Timeout ke server suplier" : (e.message || "Proxy error") });
  }
};
