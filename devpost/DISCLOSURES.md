# Disclosures

## Pre-existing code / tooling beyond Lens Studio templates and libraries

- Base project: Lens Studio's **Specs Base Template**, plus the **Spectacles Interaction Kit** and **Spectacles UI Kit** (both shipped Lens Studio packages).
- **Learn AR with SPECS skill pack** (`challengepost/learn-specs`, installed via `npx skills add challengepost/learn-specs`): supplied the `plan-lens` planning workflow and the `devpost/` planning file format used in this repo. No lens runtime code came from it.
- All `Assets/Scripts/*.ts` gameplay/UI code, the procedural low-poly models (`SkyHangarModelFactory.ts`), and the generated sound effects (`Assets/GeneratedSFX/`) were written for this project — none copied from an external Lens or asset pack.

## AI assistance

- The Lens was built through **CLAD + Claude Code + the Lens Studio MCP**, from an owner-approved design brief (`devpost/design-brief.md`). The owner (a product designer, not a programmer) directed every decision; the agent wrote the code.
- The presentation video's voiceover is a **text-to-speech voice** (Kokoro, open-source, run locally), not a real person's voice. The video's sound effects are also generated/synthesized, not recorded or licensed samples.
- No copyrighted music, footage or third-party trademarks are used in the video.

## Flight, satellite and map data

- Aircraft positions, altitude, speed, track, type and category: [adsb.lol](https://adsb.lol) — [ODbL](https://opendatacommons.org/licenses/odbl/).
- Airline and route (origin/destination) by callsign: [adsbdb.com](https://www.adsbdb.com).
- Satellite orbital elements: two-line element sets from [CelesTrak](https://celestrak.org).
- World map land outlines: Natural Earth 110m land (naturalearthdata.com), public domain, simplified for this Lens.
- Map data © OpenStreetMap contributors (ODbL) — used for the helicopter route maps (`Assets/Data/heli_basemap.json`): simplified water, rivers, major roads and parks of the two recorded helicopter areas, bundled in the project and never fetched at runtime. See openstreetmap.org/copyright.
- All of the above is a **one-time recorded snapshot** taken at build time and stored in the project (`Assets/Data/flights.json`, `Assets/Scripts/SkyHangarFlightData.ts`). The Lens never fetches anything at runtime. Full detail and simplifications are documented in `README.md`.

## Fonts and icons

- Font: Plus Jakarta Sans by Tokotype (The Plus Jakarta Sans Project Authors), SIL Open Font License 1.1 (`licenses/PlusJakartaSans-OFL.txt`).
- Icons: Google Material Symbols.
