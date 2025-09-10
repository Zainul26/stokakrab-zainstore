// api/stok.js — Vercel Serverless Function (Node 18+)
export default async function handler(req, res) {
  // CORS (aman, meski same-origin di Vercel biasanya tak perlu)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // Upstream asli — samakan dengan yang dipakai bot WA-mu
  const upstream =
    process.env.STOCK_UPSTREAM ||
    'https://panel.khfy-store.com/api/api-xl-v7/cek_stock_akrab';
    // contoh lain:
    // 'https://xlstock.serversaya.site/api/api-xl-v7/cek_stock_akrab';

  try {
    const r = await fetch(upstream, {
      cache: 'no-store',
      headers: {
        'Accept': 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'zain-store-stok/1.0'
      }
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); }
    catch { data = { message: text }; } // fallback bila upstream kirim plain text

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.status(r.ok ? 200 : r.status).end(JSON.stringify(data));
  } catch (e) {
    res.status(502).json({ error: 'upstream_error', message: e.message });
  }
}
