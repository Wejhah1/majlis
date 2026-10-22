# مجلس · Majlis

Party games for one friend group: **Passnames**, **Mafia**, **كَلَك Kalak** and **فكّها Picture Puzzle**.
Cards are made from your own photos. Fork it, deploy it free on Cloudflare, and make it yours.

> Passnames and the room system are built on [spacexmzez-bit/passnames](https://github.com/spacexmzez-bit/passnames).

## How a game night works

1. Someone opens a room from the home page and drops the link in Discord.
2. Friends tap the link, pick their face, and land in the lobby (teams and roles are set there).
3. Optional: open `/tv/CODE` on a TV or laptop for the shared board. Picture Puzzle needs it;
   the other games just look great on it.
4. The admin presses Start. After a game, **End game** returns everyone to the same lobby,
   where the admin can switch to another game without anyone re-joining.

## Deploy your own (free, ~5 minutes)

You need a free Cloudflare account and Node 22+.

```bash
git clone <your fork> majlis && cd majlis
npm install
npx wrangler login
npm run deploy
```

`npm run deploy` creates the D1 database automatically and prints your site address
(`https://majlis.<you>.workers.dev`).

**Then, straight away, open `/admin` on that address and set the admin password.**
A new site is unclaimed until someone does: whoever sets it first owns the dashboard.
(Or skip the claim by setting a secret: `npx wrangler secret put ADMIN_PASSWORD`.)

In `/admin`:

- **Friends**: add everyone with a photo. Photos show in lobbies, on Mafia role cards and on the TV.
- **Group**: your group's name and colour.
- **Passnames**: your own word list and photo cards (for the "Our photos" board).
- **Mafia**: custom art for each role and the card back (otherwise friends' photos are used).
- **Kalak**: questions about your group (they're dealt before the built-in ones).
- **Picture Puzzle**: puzzles made of photos or emoji tiles.

Photos are cropped and compressed **in your browser** (iPhone HEIC works) into three small
WebP sizes, so a full deck stays light. They're stored in D1 by default. If you've enabled R2
on your account, uncomment `r2_buckets` in `wrangler.jsonc` to store them there instead.

Everything fits Cloudflare's free tier: Workers, Durable Objects (one per room) and D1.

## Develop

```bash
npm run dev      # app + Worker on http://localhost:5173 (also on your LAN IP for phones)
npm test         # rules engines, room logic, hidden-information leak tests
npm run build    # typecheck + production build
```

Test alone with bots that join a room and play:

```bash
BOT_SCRIPT=./scripts/brains/mafia.mjs node scripts/bots.mjs ROOMCODE 5
```

## Adding a game

Create `src/games/<id>/` with:

| File | What |
|---|---|
| `meta.ts` | Name, player range, lobby teams/roles, settings shown in the lobby |
| `index.ts` | `GameModule`: `setup`, `transition`, `view` (the hidden-info filter), optional timers |
| `client.tsx` | React views: `Player` (phones) and optional `Screen` (TV) |
| `engine.test.ts` | Rules tests, including a leak test for `view()` |

The registries pick the folder up automatically. See `src/games/types.ts` for the contract and
`DESIGN.md` before designing its look.

## Credits & licences

- Passnames rules and room architecture: spacexmzez-bit/passnames.
- Codenames is a trademark of Czech Games Edition; Passnames is an independent fan game with
  its own name, art and word list.
- Fonts: Alexandria, Montserrat, Marhey (SIL Open Font License), self-hosted.
