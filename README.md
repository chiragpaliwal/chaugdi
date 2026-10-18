# Chaugadi

A four-player trick-taking card game (a Court Piece variant) for the browser: solo against bots, a How to Play tutorial, and online rooms. It is a PWA, so solo mode works offline after the first load.

- **Client:** React + Vite, served as static assets by the Worker.
- **Server:** Cloudflare Worker, one `GameRoom` Durable Object per room, D1 for match history.

## Develop

```sh
npm install
echo "TOKEN_SECRET=$(openssl rand -hex 32)" > .dev.vars
npm run db:migrate      # local D1
npm run dev             # http://localhost:5173
```

| Command | What it runs |
|---|---|
| `npm test` | Unit, property and self-play tests (`SELFPLAY_N=10000 npm test` runs the full self-play set) |
| `npm run typecheck` | Client and server TypeScript |
| `npm run e2e` | Build, then the Playwright suite (solo, tutorial, online, a11y, perf) |
| `npm run e2e:server` | Smoke test against a real workerd |

## Deploy

All of these run once, on the first deploy:

```sh
npx wrangler login
npx wrangler d1 migrations apply chaugadi --remote
npx wrangler secret put TOKEN_SECRET      # paste the output of: openssl rand -hex 32
```

To deploy, run `npm run deploy`. It builds, then uploads the Worker and its assets.

After a schema change, add a file to `migrations/` and run `npx wrangler d1 migrations apply chaugadi --remote` before you deploy.

### Custom domain

The domain's DNS must be on Cloudflare, in the same account as the Worker. Add a route to `wrangler.jsonc`, then deploy:

```jsonc
"routes": [{ "pattern": "example.com", "custom_domain": true }]
```

Cloudflare creates the DNS record and the certificate itself. Don't keep an existing A, AAAA or CNAME record for that hostname. The client builds API and socket URLs from `window.location.host`, so no code changes are needed.

Useful afterwards: `npx wrangler tail` shows live logs, and `npx wrangler rollback` returns to the previous version.
