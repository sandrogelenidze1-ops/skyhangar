# SkyHangar — a Specs Lens

## Open it

1. Install [Lens Studio 5.23.2](https://ar.snap.com/lens-studio) (or newer).
2. Open `specs lens.esproj` in this folder.
3. Click **Preview**. If the preview panel shows a red "Spectacles Interaction Kit" warning, open the Preview panel's settings and set **Simulation Mode** (or **Device Type Override**) to **Spectacles**, then re-run Preview.
4. If the preview feels slow, shrink the Preview panel and close the Inspector/Logger tabs — a huge preview panel costs frames.
5.Turn off tint background for better experience from preview settings>SPECS>Tint background


Look up at the sky, tap a plane for its flight card, pinch-hold-drag it down into your hand as a
small 3D model in its airline's colours, and drop it on the glowing hangar pad to add it to your
hangar shelf. Throw it anywhere else and it loops back to your hand (helicopters spin their rotors).
A tilted tower-style radar and the hangar shelf open from a slim lazy-follow menu bar.

Design brief: [`devpost/design-brief.md`](devpost/design-brief.md).

## The data is a recorded sample, not live

The Lens **never fetches anything at runtime**. All sky objects come from a one-time snapshot taken
at build time (28 Oct 2026, 13:24 UTC, around Ealing, west London) and stored in the project:

- `Assets/Data/flights.json` — the recorded snapshot (human-readable).
- `Assets/Data/coastline.json` — simplified land outlines for the Route tab world map (bundled; nothing is fetched).
- `Assets/Data/heli_basemap.json` — simplified local basemaps for the helicopter Route tab map (bundled; nothing is fetched).
- `Assets/Scripts/SkyHangarFlightData.ts` — the same data as a TypeScript module the Lens loads.

What's in it: 12 airliners, 2 helicopters and 4 satellites (ISS, Hubble, Tiangong/CSS core module,
NOAA 19).

- **Aircraft positions, altitude, speed, track, aircraft type and category**: [adsb.lol](https://adsb.lol)
  (`https://api.adsb.lol/v2/point/51.50/-0.30/35`). adsb.lol data is licensed under the
  [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/).
- **Airline and route (origin / destination) by callsign**: [adsbdb.com](https://www.adsbdb.com)
  (`https://api.adsbdb.com/v0/callsign/<callsign>`). The two helicopters had no filed route, so
  their cards say "Local flight".
- **Satellites**: two-line element sets from [CelesTrak](https://celestrak.org) (GP data), placed
  with a simple two-body (Kepler) orbit calculation at the snapshot time.

Simplifications made for the preview stand-in (stated honestly):

- Trails: each plane's route great circle (origin/destination from a static airport table in the data) is projected onto the stand-in dome with the same distance-to-elevation mapping as the markers, so the arc rises from the horizon or the departure airport, passes through the plane and sets toward the destination. Helicopter trails are 24 km back along the recorded track; satellite arcs are ±14 minutes of the TLE orbit.
- Takeoff and landing times are **estimates** from great-circle distance and a typical block
  speed; neither source provides schedules.
- Azimuths (compass directions) are real. Elevations are **remapped** into the comfortable
  20–70° band (closer aircraft sit higher), and a few objects were nudged apart so markers don't
  overlap. Satellites were all below the horizon at snapshot time, so their elevation is remapped too.
- "Where collected" on plaques is a hard-coded place name matching the snapshot location.
- Livery colours are hand-assigned per airline.

## The stand-in (preview only)

The real version would use your location, compass heading and live flight data. In Lens Studio's
preview, the root object **`SkyHangar / StandIn_VirtualSky`** draws a virtual sky dome around you
(4 m radius, faint dashed horizon ring with a north tick). Mouse-look is turning your head.

## Scene map

```
SkyHangar                       SkyHangarMain (orchestrator + public test API)
├── StandIn_VirtualSky          SkyHangarSkyController (markers, trails, tap vs pinch-drag)
├── EdgeArrows                  SkyHangarEdgeArrows (off-screen pointers)
├── HandAndHangarPad            SkyHangarHeldController (pull, Hangar + Sky pads, collect, send back to sky, throw-and-return)
├── HangarShelf                 SkyHangarShelfController (paged collection, 5 per page; + ShelfContent, ShelfPlaquesUI)
├── Radar                       SkyHangarRadarController (+ RadarDisc, tilted 45°)
├── UI
│   ├── MenuBar                 SkyHangarMenuBarUI (Sky / Radar / Hangar)
│   ├── InfoCard                SkyHangarInfoCardUI
│   └── WorldLabels             SkyHangarLabelsUI (trail codes, arrow label, Collected stamp)
└── Audio                       SkyHangarAudioController
```

Models are code-authored low-poly geometry built from primitive meshes
(`SkyHangarModelFactory.ts`); sound effects are generated locally (`Assets/GeneratedSFX/`);
icons are Google Material Symbols.

## Credits

- Flight positions: adsb.lol — ODbL.
- Routes and airlines: adsbdb.com.
- Satellite orbital elements: CelesTrak.
- World map land outlines: Natural Earth 110m land (naturalearthdata.com), public domain, simplified for this Lens.
- Map data © OpenStreetMap contributors (ODbL) — helicopter route maps (`Assets/Data/heli_basemap.json`, simplified, bundled; openstreetmap.org/copyright).
- Font: Plus Jakarta Sans by Tokotype (The Plus Jakarta Sans Project Authors), SIL Open Font License 1.1 (licence text in `licenses/PlusJakartaSans-OFL.txt`).
- Built with Lens Studio, Spectacles Interaction Kit and Spectacles UI Kit.

## Disclosures

- Motion is time-compressed for demo: in the preview every aircraft flies along its recorded track at its real ground speed multiplied by `TIME_SCALE` (40, in `SkyHangarSkyController.ts`); helicopters and satellites use a gentler share of it. The recorded data itself is a static sample.
- Live card values: the info card ticks altitude, ground speed and "Departed … ago" / "Arriving in …" every second, but the data is still a recorded snapshot (one altitude/speed sample per flight). The card replays that sample along a climb / cruise / descent profile of the flight, anchored so it starts exactly at the recorded values; it is not live tracking.
- Route tab map: planes show the great-circle arc between the two airports, satellites a ground track propagated from the recorded TLE, and helicopters only the path already flown. The recording has no geographic history for helicopters, so that path is dead-reckoned backwards from the recorded position, heading and speed.
