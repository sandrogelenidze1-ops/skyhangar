# SkyHangar: Devpost description (draft)

## Tagline
Look up. Tap a plane. Pull it into your hands.

## Inspiration
Planes cross the sky above us every minute, and we know nothing about any of them. Information about the sky lives on flat screens, far from the thing it describes. We wanted the opposite: the story sits on the plane itself, and you can reach up and take it.

## What it does
SkyHangar is a Lens for Specs that turns the sky into a place you can explore, collect from and play in.

- **Look up** and see planes, helicopters and satellites as small markers. Satellites have their own color. Aim at a plane to see its trail: solid behind it to where it took off, dotted ahead to where it lands.
- **Tap** a plane for its card: airline, flight number, route, takeoff and landing times, aircraft type, altitude and speed.
- **Pinch and pull** to bring any aircraft down as a 3D model in your hand. A glowing pad appears, and releasing the model on it collects it.
- **Your hangar** is a shelf of everything you've caught, with a plaque for each: airline, flight and route.
- **Throw** a plane like a paper plane and it flies back to your hand. Helicopters spin their rotors.
- **Radar** shows the whole sky from above when you can't look up.
- A slim bar with Sky, Radar and Hangar drifts after you and stays dim until you look down at it. Edge arrows point to aircraft out of view.

## Who it's for
Curious people of every age: plane spotters, families on a terrace, kids who wave at every aircraft. Anyone who has looked up and wondered where that plane is going.

## How we built it
I'm a product designer, not a coder, so the whole project followed the Learn AR with SPECS workflow:

1. I planned the design with the `plan-lens` skill, which turned my decisions into an approved design brief (in `devpost/design-brief.md`).
2. CLAD built the Lens from the brief through the Lens Studio MCP, using the Spectacles Interaction Kit and UI Kit.
3. LEAF scenarios test each of the five done criteria in the preview, and the results are in the repo.

Design choices made for glasses: the bar drifts after you instead of sticking to your face, the pad only appears when you're holding something, and the radar floats at about 1 m so it fits the display. Near controls are tapped, and far objects are pinched.

## Data
The demo runs on a sample sky: a one-time snapshot of flight data from [adsb.lol](https://api.adsb.lol) (ODbL) with routes from [adsbdb.com](https://www.adsbdb.com), and satellite orbits from [CelesTrak](https://celestrak.org). [CHECK: if the build had to hand-write the sample file, say "a sample sky modeled on real flights" instead.] The Lens does not fetch live data. Live data is the next step.

## Challenges
- Everything must work in the Lens Studio preview, so the sky is simulated and a mouse click stands in for a pinch.
- The preview can't keep the hangar between sessions, so the demo hangar starts with a few models in it.
- Throw-and-return is a scripted path, not real physics. Far-pointing pinch and comfort of looking up are unproven without glasses.

## What's next
Live flight data on real Specs, a saved hangar, airline liveries, and a time slider for satellite passes.

## Built with
Lens Studio, CLAD, Lens Studio MCP, Claude Code, Spectacles Interaction Kit, UI Kit, LEAF, plan-lens, adsb.lol, adsbdb, CelesTrak.
