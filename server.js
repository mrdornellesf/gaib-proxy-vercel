app.get("/gaib", async (req, res) => {
    const pageNum  = String(req.query.page || "1");
    const pageSize = String(req.query.pageSize || "100");
  
    const API_HOST = "pre-vault-api.gaib.ai";
    const API_URL  = `https://${API_HOST}/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`;
  
    // tente estas combinações se receber "Access denied..."
    const SPOOF_ORIGIN  = "https://gaib.ai";   // alternativas: "https://vault.gaib.ai" | "https://pre-vault.gaib.ai"
    const SPOOF_REFERER = "https://gaib.ai/";  // manter barra no fim
  
    let context;
    try {
      const br = await getBrowser();
      context = await br.newContext({
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
      });
      const page = await context.newPage();
  
      // Intercepta chamadas para a API e injeta headers "autorizados"
      await page.route("**/*", async (route, request) => {
        const url = new URL(request.url());
        if (url.hostname === API_HOST) {
          const headers = {
            ...request.headers(),
            origin: SPOOF_ORIGIN,
            referer: SPOOF_REFERER,
            "sec-fetch-site": "same-origin",
            "sec-fetch-mode": "cors",
            "sec-fetch-dest": "empty",
            accept: "application/json, text/plain, */*",
            "accept-language": "en-US,en;q=0.9",
            // opcional: user-agent consistente
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
          };
          await route.continue({ headers });
        } else {
          await route.continue();
        }
      });
  
      // ---- TENTATIVA 1: navegação HTTP direta (sem fetch JS) ----
      const resp = await page.goto(API_URL, { timeout: 20000, waitUntil: "domcontentloaded" });
      if (resp) {
        const status = resp.status();
        const text   = await resp.text();
        await context.close();
        return res
          .status(status)
          .set("content-type", "application/json; charset=utf-8")
          .set("cache-control", "no-store")
          .set("access-control-allow-origin", "*")
          .send(text);
      }
  
      // Se por algum motivo não houve resp (raro), tenta via fetch no browser:
      const result = await page.evaluate(async (url) => {
        const r = await fetch(url, {
          method: "GET",
          headers: { accept: "application/json, text/plain, */*" },
          credentials: "include",
          cache: "no-store"
        });
        const text = await r.text();
        return { status: r.status, text };
      }, API_URL);
  
      await context.close();
  
      return res
        .status(result.status)
        .set("content-type", "application/json; charset=utf-8")
        .set("cache-control", "no-store")
        .set("access-control-allow-origin", "*")
        .send(result.text);
  
    } catch (e) {
      if (context) try { await context.close(); } catch {}
  
      // ---- TENTATIVA 2 (fallback): fetch no Node (server-to-server) ----
      try {
        const r = await fetch(`https://${API_HOST}/points/leaderboard?page=${encodeURIComponent(pageNum)}&pageSize=${encodeURIComponent(pageSize)}`, {
          method: "GET",
          headers: {
            "accept": "application/json, text/plain, */*",
            "origin": SPOOF_ORIGIN,
            "referer": SPOOF_REFERER,
            "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
          }
        });
        const text = await r.text();
        return res
          .status(r.status)
          .set("content-type", "application/json; charset=utf-8")
          .set("cache-control", "no-store")
          .set("access-control-allow-origin", "*")
          .send(text);
      } catch (e2) {
        console.error("browser error:", e?.message);
        console.error("node fallback error:", e2?.message);
        return res.status(500).json({ error: "proxy_failed", message: String(e2?.message || e2) });
      }
    }
  });
  