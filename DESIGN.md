# Majlis — Design Brief

Read this before touching any UI. Every screen should look like *our* game night, not a template.

## The idea
A majlis is the room where everyone gathers at night. The site is that room: warm, a bit
smoky, lit by one lamp. The **shell** (home, lobby, admin) is that room. Each **game** is a
deck of cards brought to the table, and each deck has its own art direction.

Cards are the hero. They are physical objects: cream stock, real corner radius, a weight when
dealt, a sheen when they catch the light. Everything else steps back so the cards and our
friends' faces carry the page.

## Shell identity
| Token | Value | Use |
|---|---|---|
| `--ink-0` | warm near-black `oklch(0.17 0.012 60)` | page background (never pure #000) |
| `--ink-1/2` | raised warm darks | panels, inputs |
| `--paper` | cream `oklch(0.95 0.025 85)` | card faces (never pure #fff) |
| `--brass` | `oklch(0.80 0.13 78)` | the one accent: focus, primary action, highlights |
| `--ember` | `oklch(0.63 0.18 35)` | danger, Mafia, red team |
| `--group-accent` | set by the admin | small touches of the group's own colour |

**Motif:** Sadu weaving (Gulf tent textile): rows of triangles and diamonds in brass/ember/cream.
Used as a thin band and on card backs. Never as a full-page wallpaper.

## Type
- Arabic UI + body: **Alexandria** (variable). Latin pair: **Montserrat** (same designer, matching DNA).
- Display (Arabic headings, card titles): **Marhey**. Used big and sparingly.
- Numbers: tabular figures for codes, scores and timers.
- Banned as the only font: Inter, Cairo, Tajawal, system-ui.
- Arabic gets more line-height than Latin: tune with `:lang(ar)`.

## Per-game art direction
| Game | Mood | Palette | Motion |
|---|---|---|---|
| Passnames | spy dossier: paper, stamps, typewriter | cream + team blue/red + black | snappy flips, stamp thud |
| Mafia | noir: smoke, low light, cigarette-burn vignettes | ink + ember + bone | slow fades at night, sudden reveals |
| Kalak | loud, playful quiz show | brass + saturated pops | bouncy springs, confetti only on wins |
| Picture Puzzle | TV game-show set, big type for the TV | stage lights on ink | big score counters, team swells |

## Card rules
- Aspect 5:7, radius ≈ 5.5% of width (real playing card), 1px inner keyline.
- Pointer tilt (max ~8°) with spring back; foil sheen only on special cards (roles, assassin, winners).
- Deal and flip with springs, not linear durations. Every reveal has a sound (with a mute toggle).
- Photos load through the image pipeline with a ThumbHash placeholder: no layout jump, no spinner.

## Layout rules
- The game board dominates. Chrome stays small and out of the way.
- Asymmetry over centred stacks. No "centred hero + 3 feature cards".
- Logical CSS properties only (`margin-inline-start`, `inset-inline-end`). `dir` is set per container.
- Mirror directional arrows in RTL; never mirror logos or play icons.
- Design the empty, loading, reconnecting and waiting-for-players states.
- Phone first (375px); every game also scales to a 1920px TV.

## Banned (AI-slop tells)
Purple/indigo gradients · glassmorphism · `rounded-2xl` shadow cards everywhere · emoji as icons ·
coloured side-border on cards · cards inside cards · eyebrow chips over every heading ·
identical fade-ins on everything · placeholder-only form labels · "Lorem"/"John Doe" copy.
Copy is written in our own voice (Gulf Arabic first, plain English second).

## Tooling
- Generator skill: **Impeccable** (pbakaus/impeccable). Don't stack a second generator skill on it.
- Before merging UI: run Impeccable's detector and Vercel's Web Interface Guidelines audit.
- Check RTL and LTR at 375px and 1920px, and with `prefers-reduced-motion`.
