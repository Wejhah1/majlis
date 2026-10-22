# مجلس · Majlis

Party games for one friend group: Passnames, Mafia, Kalak, Picture Puzzle and more.
Cards are made from your own photos. Fork it, deploy it free on Cloudflare, and make it yours.

> Built on the room system and Passnames rules from
> [spacexmzez-bit/passnames](https://github.com/spacexmzez-bit/passnames).

## Run it

```bash
npm install
npm run dev      # app + Worker together on http://localhost:5173 (and your LAN IP for phones)
npm test         # game engine and registry tests
npm run build    # typecheck + production build
```

## How it's put together

```
src/
  games/<id>/meta.ts     name, player range, surfaces (phone / TV / host). Drop a folder in → it appears.
  games/types.ts         GameModule contract: setup / transition / view (hidden-info filter)
  platform/i18n/         [ar, en] strings + language/direction switching
  platform/ui/           design tokens, PlayingCard (tilt + sheen)
  app/                   home screen
worker/index.ts          Cloudflare Worker: /api/*, later /parties/* for rooms
DESIGN.md                the design brief. Read it before touching UI.
```

Design work uses the **Impeccable** skill in `.claude/skills/impeccable` (see DESIGN.md).

## Roadmap

| Phase | What |
|---|---|
| 0 ✅ | Scaffold, design brief, tokens, fonts, home screen |
| 1 | Generic rooms (ported from passnames): seats for player / TV screen / host |
| 2 | Passnames as the first game module |
| 3 | Admin dashboard + photo card pipeline (R2 + D1) |
| 4 | Mafia |
| 5 | Kalak |
| 6 | Picture Puzzle (TV + host phone) |
| 7 | "Deploy your own" kit for other friend groups |
