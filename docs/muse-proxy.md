# Muse Spark proxy for Ehyeh (sketch, not deployed)

The front end (`js/s02.js` `callAssistant`) posts OpenAI-style chat bodies to the same-origin `/api/muse` with `model: "muse-spark-1.3"` and **no Authorization header** when the user hasn't set their own key. This proxy adds the key on the server.

- Meta Model API: base `https://api.meta.ai/v1`, `POST /chat/completions`, `Authorization: Bearer <key>` (keys start with `LLM_`), OpenAI-compatible. Model `muse-spark-1.3`. See https://dev.meta.ai/docs/quickstart
- The key lives only in the server environment as `META_MODEL_API_KEY`. Never commit it.
- `muse-spark-1.3` is a reasoning model. `stop`, `logit_bias`, and `logprobs` return a 400 error. If the API rejects `temperature`, strip it in the proxy (Option B already drops it).
- CSP: `Hagah.html` `connect-src https:` already allows same-origin `/api/muse` on the https site.

## Sketches

### Option A: nginx (key kept in a server-only include file, mode 600)
```nginx
# /etc/nginx/snippets/meta-key.conf  (written by Ren, not in git)
#   set $meta_key "LLM_...";
location = /api/muse {
    limit_except POST { deny all; }
    include snippets/meta-key.conf;
    client_max_body_size 16k;
    limit_req zone=muse burst=5 nodelay;      # define: limit_req_zone $binary_remote_addr zone=muse:1m rate=10r/m;
    proxy_set_header Authorization "Bearer $meta_key";
    proxy_set_header Host api.meta.ai;
    proxy_ssl_server_name on;
    proxy_read_timeout 60s;
    proxy_pass https://api.meta.ai/v1/chat/completions;
}
```
(Stock nginx can't read env vars directly. Use the include file, or `env META_MODEL_API_KEY;` plus njs/perl. Option B is simpler if the key lives in the environment.)

### Option B: tiny Node server (reads META_MODEL_API_KEY, pins the model)
```js
// muse-proxy.js — node >=18, run behind nginx: location = /api/muse { proxy_pass http://127.0.0.1:8787; }
const http = require('http');
const KEY = process.env.META_MODEL_API_KEY;
if (!KEY) { console.error('META_MODEL_API_KEY missing'); process.exit(1); }
http.createServer(async (req, res) => {
  if (req.method !== 'POST') { res.writeHead(405); return res.end(); }
  let raw = ''; for await (const c of req) { raw += c; if (raw.length > 16000) { res.writeHead(413); return res.end(); } }
  let body; try { body = JSON.parse(raw); } catch { res.writeHead(400); return res.end(); }
  const upstream = {
    model: 'muse-spark-1.3',                       // pinned; client can't pick a pricier model
    messages: (body.messages || []).slice(0, 4),
    max_tokens: Math.min(body.max_tokens || 400, 600)
  };
  const r = await fetch('https://api.meta.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(upstream)
  });
  res.writeHead(r.status, { 'Content-Type': 'application/json' });
  res.end(await r.text());
}).listen(8787, '127.0.0.1');
```
Add a per-IP rate limit (nginx `limit_req`) so the public page can't burn the key.

