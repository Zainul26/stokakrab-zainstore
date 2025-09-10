// CommonJS agar aman di Vercel Node
// ENV yang dipakai: SUPPLIER_URL, SUPPLIER_KEY (opsional), SUPPLIER_TOKEN (opsional), CORS_ORIGIN (opsional), FETCH_TIMEOUT_MS (opsional)

module.exports = async (req, res) => {
  // --- CORS ---
  const origin = process.env.CORS_ORIGIN || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ ok: false, error: "Method not allowed" });
    return;
  }

  const { sku, number } = req.query || {};
  if (!sku && !number) {
    res.status(400).json({ ok: false, error: "Parameter 'sku' atau 'number' wajib ada" });
    return;
  }
  if (!process.env.SUPPLIER_URL) {
    res.status(500).json({ ok: false, error: "SUPPLIER_URL belum di-set di Environment Vercel" });
    return;
  }

  // --- rakit URL upstream ---
  const u = new URL(process.env.SUPPLIER_URL);
  if (sku) u.searchParams.set("sku", sku);
  if (number) u.searchParams.set("number", number);

  // --- timeout & fetch ---
  const timeoutMs = Number(process.env.FETCH_TIMEOUT_MS || 15000);
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = {
      "Content-Type": "application/json",
    };
    // dukung 2 pola umum auth
    if (process.env.SUPPLIER_KEY) headers["x-api-key"] = process.env.SUPPLIER_KEY;
    if (process.env.SUPPLIER_TOKEN) headers["Authorization"] = `Bearer ${process.env.SUPPLIER_TOKEN}`;

    const upstream = await fetch(u.toString(), {
      method: "GET",
      headers,
      signal: controller.signal,
    });
    clearTimeout(t);

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!upstream.ok) {
      res.status(502).json({
        ok: false,
        error: `Upstream ${upstream.status} ${upstream.statusText}`,
        data,
      });
      return;
    }

    // cache ringan di edge vercel
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    res.status(200).json({ ok: true, upstream_status: upstream.status, data });
  } catch (err) {
    const isAbort = err && (err.name === "AbortError" || err.code === "ABORT_ERR");
    res.status(isAbort ? 504 : 502).json({
      ok: false,
      error: isAbort ? "Timeout ke server suplier" : (err.message || "Proxy error"),
    });
  }
};
