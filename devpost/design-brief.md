---
status: approved
---

# Design brief: SkyHangar

<!-- Filled in by plan-lens from the learner's interview. Use the learner's words. Mark any value they didn't choose as (default). -->

## The one spatial moment
I'm standing outside looking up. A plane is overhead with a faint trail behind it, solid to where it came from and dotted ahead to where it lands. I tap it and a small card drops down with the flight info. Then I pinch it and pull, and it slides down the sky into my hands as a small 3D plane in its airline's colors. A glowing hangar pad fades in beside my hand; I release the plane over it, it shrinks onto the pad with a "Collected" stamp, and it joins my hangar shelf with a plaque showing the airline, flight number and route.

## Why it belongs on glasses
- Uses: shares your view (labels the real aircraft you're looking at) and draws in the world (trails across the sky, models in your hands, a hangar shelf in front of you).
- Why it's better than the phone or laptop version: a flight-tracker app shows a flat map; here the info sits on the actual plane overhead, in the direction you're looking, and you pull it straight out of the sky into your hands.

## Product or overlay
- Type: an overlay on the real sky, with a product inside it (the hangar and the toy models).
- What the real version would sense: my location, compass heading and live flight data.
- Stand-in for the preview: a virtual sky around the user with about 12 planes, 2 helicopters and 4 satellites, placed from a recorded snapshot of real flights (real airlines, routes, aircraft types, times). Mouse-look is turning my head. The sample data is a hard-coded JSON file in the project, and the Devpost description says so.

## Where things live
- Where the user is looking during the main task: up at the sky (20 to 70 degrees above the horizon), then down at their hand and the pad in front of them.
- Sky objects: markers on a dome around me, 20 to 70 degrees above the horizon, so no extreme neck tilt.
- Info card: opens next to the plane I tapped, dropping down to about 1.2 m from me, at eye level.
- Pulled model: flies to my hand and sits about 50 cm in front of me, below chest height, about 25 cm wide.
- Hangar pad: fades in about 60 cm in front of me, below chest height, to the right of my hand, about 25 cm wide.
- Hangar shelf: about 1 m away, slightly below eye level, in the direction I'm facing when I open it (default). Each model on a stand (about 15 cm) with a plaque under it.
- Radar: a flat disc about 40 cm wide, about 1 m in front of me, centered a little below eye level and tilted about 45 degrees toward me like a tablet. I'm at the center, with range rings and a sweep line.
- Menu bar: a slim bar with three big buttons (Sky, Radar, Hangar), each about 6 cm wide, about 70 cm in front of me and below chest height, so it never overlaps the radar. It follows me gently: when I turn around it drifts after me and settles in front of me again after about a second. It never snaps to my head.

## Hands and input
- Quick pinch (tap) on a plane, helicopter or satellite: opens the info card.
- Pinch, hold and drag on a sky object: pulls it to me as a 3D model.
- Release over the hangar pad: collects it.
- Release anywhere else: throws it, and it comes back to my hand (the helicopter spins its rotors).
- Rotate a model: grab it and turn it with one hand.
- Menu bar buttons: tap with a finger; in the preview a mouse click does the same.
- Radar blips: point and pinch (the radar is about 1 m away), which opens the same info card.
- Everything works with one hand, so it works with the mouse. Targets are big and highlight when aimed at.
- Voice: none.

## When things show
- Sky: only small markers (planes, helicopters, satellites in a different color).
- Trails: only for the plane I'm aiming at or have tapped. The sky stays clean.
- Info card: shows on tap, closes when I tap elsewhere.
- Hangar pad: only while I'm holding a plane. It glows brighter when the plane is over it, and fades out after I release.
- Hangar shelf and radar: only when opened from the menu bar. Pressing Sky closes them (default).
- Menu bar: always visible but small and dim while I look at the sky; when I look down at it, it grows and brightens.
- If something needs attention out of view: small edge arrows point to aircraft when none is in view. The arrow for the nearest aircraft is larger, gently pulses, and has a small label with its airline and flight number. I turn my head to follow it. Nothing moves the sky around me.

## Done criteria
Each one can be checked in Lens Studio's preview.
1. Looking around, I see planes, helicopters and satellites as different markers, and satellites are a different color. When none is in view, a larger pulsing edge arrow with an airline and flight label points to the nearest one.
2. Aiming at a plane shows its trail (solid behind, dotted ahead) with origin and destination codes. A quick pinch opens a card with airline, flight number, origin to destination with takeoff and landing times, aircraft type, altitude and speed.
3. Pinch-hold-drag on a plane or satellite brings it to my hand as a 3D model in airline colors and fades in the hangar pad. Releasing it over the pad shows "Collected" and adds it to the shelf with a plaque (airline, flight, route, where and when collected).
4. Clicking Radar on the menu bar shows a tilted top-down disc with blips, range rings and a sweep line, and pointing and pinching a blip opens the same card.
5. Releasing a plane or helicopter away from the pad throws it, and it returns to my hand (the helicopter spins its rotors).

## Out of scope
- Live flight data, real compass and location.
- A 3D globe of all flights, time scrub.
- Saving the hangar between sessions.
- Two-hand gestures, palm-up hand menus, voice.
- A "nearest plane" button or anything that rotates the sky around the user.

## Risks and open questions
- The hangar can't persist between sessions in the preview, so the demo hangar starts with a few models already on it (3, default).
- "Where collected" uses a hard-coded place name matching the snapshot location (default).
- The throw-and-return is a scripted path, not real physics.
- Far-pointing pinch on distant planes, comfort of looking up, and the look-down-to-brighten bar: feel unproven.
- Sample data is recorded, not live.
- Scope is large for one Lens. If time runs short, build in this order: sky markers + tap card, then pull to 3D + hangar pad and shelf, then radar, then satellites, then throw and return. Helicopters ship with planes.

## Build notes for CLAD
- Build for SPECS so it runs and can be demonstrated in Lens Studio's preview. No SPECS device is available.
- Use Spectacles Interaction Kit (SIK) and UI Kit for all interactions, so they work with the mouse in Interactive Preview and with LEAF.
- Build any stand-in exactly as described above, and keep it obvious in the scene.
- Use real-world scale in centimeters. Keep content inside the user's view during the main task.
- The display is additive: black renders as transparent. Don't rely on black or very dark content to be seen; keep text light and readable from where the user stands.
- Get the basic flow working first, then add detail.
- Write LEAF scenarios for each done criterion, run them in preview, and report which pass. Say which criteria have no test.
- Don't record, identify, or follow people.
- Data: create the sample flight file from real data with a one-time snapshot from adsb.lol (https://api.adsb.lol, ODbL, no key) for position, altitude, speed, heading, aircraft type and category, plus a route lookup by callsign (adsbdb.com). Save it as JSON in the project. Satellites: a few real ones (ISS and others) with TLE data from CelesTrak, placed with a simple orbit calculation. Credit these sources in the README. If a fetch fails, hand-write a realistic sample file instead (default); the Lens never fetches at runtime.

## After the build: judge it
This part is for you, after CLAD finishes.

1. **Does it work?** Ask your agent which LEAF tests passed and which done criteria have no test.
2. **Walk around it.** Open the preview in Interactive Preview. Use WASD to move, Q and E to go down and up, and right-drag (or hold Shift) to look around. Clicking acts as a pinch. Stand where a user would and look at the task.
3. **Ask the three questions.**
   - Does it use what I'm looking at?
   - Does it put something in my space, where it belongs?
   - Does it free my hands or let me keep my eyes up?
   - Would it be just as good on a phone? If so, what would make it need the glasses?
4. **Check comfort.**
   - Everything I need is in view while I do the task. Nothing sits at the edges, behind me, or stuck to my face.
   - Every control is within reach of someone standing there.
   - Text reads easily from where I stand. No dark UI disappearing.
   - Things show when needed and get out of the way.
5. **Label what you know.** Write "logic proven" next to anything the tests and preview show working, and "feel unproven" next to anything only real glasses could tell you (comfort over time, real hand tracking, real recognition).
6. **Fix with design notes, not code.** Tell your agent what to change in design terms, for example: "Move the step card 15 cm lower and next to the pan. Make the Next button twice as big. Re-run the tests." If a fix takes under a minute, like nudging a panel, do it yourself in the scene.
7. **Submit.** Record a video under 3 minutes of your Lens in the preview, public on YouTube. Make your repo public with your Lens Studio project and this `devpost/` folder. Details are on the hackathon site: https://learn-specs.devpost.com/resources

## Round 1 changes (Part A: behavior, merged with round 2 behavior items)

Source: `devpost/design-changes-1.md` Part A items 1–7, plus the behavior parts of `devpost/design-changes-2.md` (aim reticle, trail shape). Part B (glass look, card tabs and pictures, round menu buttons, rooftop backdrop, new models, type system) comes later. The original done criteria are unchanged.

1. **Menu bar follows me.** It keeps a spot about 15° below the view centre, about 68 cm away, so it is always in the lower part of the view. When I turn or look up or down it drifts after me and settles in about a second; it never snaps. It is dim and compact while I look at the sky and brightens when I look more than 12° down or aim at a button.
2. **Info card beside the plane.** Tapping opens the card about 10° to the right of the object, at the height I'm looking, about 1.2 m away, facing me. It then keeps that spot in my view: if I move or turn it follows with about a 1 s lag. Tapping empty space (or Close) closes it.
3. **Send it back to the sky.** While I hold a model a second pad, "Sky" (up-arrow), appears above the Hangar pad. Releasing over it flies the model back to its place in the sky (state `returningToSky`) and it disappears; the marker flashes. Releasing elsewhere still throws it and it returns. The card has a "Let go" button that sends a pulled model back to the sky without dragging.
4. **Pad glyphs.** The Hangar pad shows a hangar-arch glyph with a plane in the bay and the label "Hangar". The Sky pad shows an up-arrow and the label "Sky".
5. **Hangar paging.** 5 models are shown at a time. Pinch-drag sideways on the shelf to page, or use the ‹ › buttons. Page dots, a "6–10 of 12" counter and a Sort toggle (Newest / Airline) sit under the plaques. The demo pre-fills 12 models.
6. **Full-route trails.** A thin green line runs from where the plane rose over the horizon (or its departure airport) through the plane to where it will set (or its arrival airport). It follows the route's great circle, projected onto the stand-in dome from the snapshot location using a static airport table. Behind the plane: solid, fading out. Ahead: dotted, fading out. Origin and destination codes label the two ends. Helicopters get only a past trail; satellites get an orbit arc (±14 minutes of the TLE orbit).
7. **Small sky markers.** No 3D models in the sky. Flat glyphs about 1.9° across: a white plane silhouette pointing along its heading, an amber helicopter with a spinning rotor cross, a cyan satellite dot with a faint ring. They brighten and grow slightly when aimed at. The pinch target stays generous (about 4° radius).
- **Aim reticle (round 2 #1).** Four thin corner brackets frame the aimed object. Beside it a label block shows the callsign (large), airline code and aircraft type (small), "ORIGIN > DEST" (large) and "Departed h:mm ago · Arriving in h:mm" (small). It appears only for the aimed object, and the label hides while that object's card is open.
