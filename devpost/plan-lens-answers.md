# plan-lens answers (working name: SkyHangar)

Open this file while plan-lens interviews you. Answer each question in your own words, using these as the base. It will ask follow-ups, and you decide.

## 1. The idea
I want to make a sky Lens for glasses. You look up and see the planes, helicopters and satellites overhead, each with a trail showing where it took off from and where it's landing. Tap one for its flight info. Pinch it and drag it down to your hands to get a 3D model of it. You collect them in a hangar, and you can throw them and they come back to your hand. There's also a radar view, like an airport tower, to see more aircraft from above.

## 2. The spatial moment
I'm standing outside looking up. A plane is overhead with a faint trail behind it, solid to where it came from and dotted ahead to where it lands. I tap it and a small card drops down with the flight info. Then I pinch it and pull, and it slides down the sky into my hands as a small 3D plane in its airline's colors. I drop it on the hangar shelf and its plaque shows the airline, flight number and route.

## 3. Product or overlay
It's an overlay on the real sky, with a product inside it (the hangar and the toys). The real version would sense my location, compass heading and live flight data. In the preview that's a stand-in: a virtual sky around the user with about 12 planes, 2 helicopters and 4 satellites, placed from a recorded snapshot of real flights (real airlines, routes, aircraft types, times). Mouse-look is turning my head. The sample data is a hard-coded file, and I'll say so in the description.

## 4. Where things live
- Sky objects sit on a dome around me, 20 to 70 degrees above the horizon, so no extreme neck tilt.
- The info card opens next to the plane I tapped, about 1.2 m from me, at eye level.
- A pulled plane flies to my hand and sits about 50 cm in front of me, below chest height, about 25 cm wide.
- Hangar: a shelf about 1 m away, slightly below eye level, with each model on a stand (about 15 cm) and a plaque under it.
- Radar: a flat disc about 60 cm wide, about 70 cm in front of me at chest height. I'm at the center, with range rings and a sweep line.
- A palm-up menu on my left hand has three big buttons: Sky, Radar, Hangar.

## 5. Hands
- Quick pinch (tap) on a plane: opens the info card.
- Pinch, hold and drag on a plane: pulls it to me as a 3D model. Same for helicopters and satellites.
- Release over the hangar pad: collects it. Release in the air: throws it, and it comes back to my hand (helicopter spins its rotors).
- Rotate a model: grab it and turn it with one hand only.
- Everything works with one hand, so it works with the mouse. No voice. Targets are big and highlight when aimed at.

## 6. When it shows
- In the sky: only small markers (planes, helicopters, satellites in a different color).
- Trails show only for the plane I'm aiming at or have tapped. The sky stays clean.
- The info card shows on tap and closes when I tap elsewhere.
- Small edge arrows point to the nearest aircraft when none is in view. A "nearest plane" button on the menu turns me toward it.
- The hangar and radar show only when opened from the menu.

## 7. Done (check in the preview)
1. Looking around, I see planes, helicopters and satellites as different markers, and satellites are a different color.
2. Aiming at a plane shows its trail (solid behind, dotted ahead) with origin and destination codes. A quick pinch opens a card with airline, flight number, origin to destination with takeoff and landing times, aircraft type, altitude and speed.
3. Pinch-hold-drag on a plane or satellite brings it to my hand as a 3D model in airline colors, and releasing it over the hangar pad adds it to the shelf with a plaque (airline, flight, route, where and when collected).
4. Opening Radar from the menu shows a top-down disc with blips, and tapping a blip opens the same card.
5. Releasing a plane or helicopter in the air throws it, and it returns to my hand (the helicopter spins its rotors).

## Out of scope
Live flight data, a 3D globe of all flights, time scrub, saving the hangar between sessions, two-hand gestures, voice, real compass and location.

## Risks
- The hangar can't persist between sessions in the preview, so the demo hangar starts with a few planes already in it.
- The throw-and-return is a scripted path, not real physics.
- Far-pointing pinch on distant planes and comfort of looking up: feel unproven.
- Sample data is recorded, not live.

## If time runs short, build in this order
Sky markers + tap card, then pull to 3D + hangar, then radar, then satellites, then throw and return. Helicopters ship with planes.

## Data note for CLAD
Create the sample flight file from real data: a one-time snapshot from adsb.lol (https://api.adsb.lol, ODbL, no key) for position, altitude, speed, heading, aircraft type and category, plus a route lookup by callsign (adsbdb.com). Save it as JSON in the project. Satellites: a few real ones (ISS and others) with TLE data from CelesTrak, placed with a simple orbit calculation. Credit these sources in the README.
