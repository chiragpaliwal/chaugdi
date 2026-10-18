# Chaugadi

Chaugadi (also Chaugdi or Chokdi) is an Indian card game for four players in two teams, a bidding variant of Court Piece. This is a free web version for your phone or computer. You can play three bots, even offline, or invite friends to a private room with a five-letter code.

New to the game? Open **How to play** from the home screen to play one guided practice hand.

## How to play

**Teams.** Partners sit opposite each other, and play always passes to the left. The game uses a standard 52-card deck, ranked A high down to 2.

**1. Bid on five cards.** Everyone is dealt 5 cards. Starting left of the dealer, players bid how many of the 13 tricks (*Sar*) their team will win, from 7 to 13, or pass.
- The opener must bid at least 7.
- A player who passed may bid again on a later turn.
- The auction ends after three passes in a row, or straight away on a bid of 13.

**2. Call Hukum.** The highest bidder picks the trump suit (*Hukum*). Everyone is then dealt 8 more cards.

**3. Play the tricks.** The bidder leads the first trick.
- If you have a card of the suit that was led, you must play one.
- If you don't, play anything: a trump to *cut*, or a discard.
- The highest trump wins the trick. If no trump was played, the highest card of the led suit wins.
- The winner of a trick leads the next one.

**4. Score.** The round stops as soon as its result is certain, and all hands are shown.

| Result | Bidding team |
|---|---|
| Made the bid | +bid |
| Missed it | −2 × bid |
| Bid 13 and won all 13 (*Kot*) | Wins the match instantly |

**The score.** Both teams share one running score that shows only the leading team, for example "Us +9". The first team to **+26** (short match) or **+52** (standard) wins. Your team can also climb when the other team misses a bid.

> **Tip:** you gain the bid or lose twice the bid, so only bid when you are more than 2/3 sure of making it.

**Who deals.** A team that is level or behind keeps the deal. Once the dealer's team is ahead, the deal passes to the left.

## Features

- **Solo play** against Easy, Medium or Hard bots. It works offline once the page has loaded, and you can install it as an app.
- **Private online rooms:** share a code, and bots fill any empty seats. If you drop out, a bot plays your turns until you rejoin.
- **Accessibility:** you can play by keyboard, the game is screen-reader friendly, and there is a reduced-motion option and a volume control.

## Run it yourself

The client is built with React, TypeScript and Vite. The server is a Cloudflare Worker, with one Durable Object per room and D1 for match history. The rules engine in `src/engine` is shared by both, so a hand plays the same offline and online.

```sh
npm install
echo "TOKEN_SECRET=$(openssl rand -hex 32)" > .dev.vars
npm run db:migrate      # local database
npm run dev             # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm test` | Unit, property and bot self-play tests |
| `npm run typecheck` | Type-checks the client and the server |
| `npm run e2e` | Builds, then runs the Playwright browser tests |

### Deploy to Cloudflare

First deploy, once:

```sh
npx wrangler login
npx wrangler d1 create chaugadi            # put the printed database_id in wrangler.jsonc
npx wrangler d1 migrations apply chaugadi --remote
npx wrangler secret put TOKEN_SECRET       # paste the output of: openssl rand -hex 32
```

Then run `npm run deploy`. To serve the game from your own domain, the domain must be on Cloudflare. Add this to `wrangler.jsonc` and deploy again:

```jsonc
"routes": [{ "pattern": "play.example.com", "custom_domain": true }]
```
