# SkyHangar: design changes, round 2 (style reference)

Apply together with `design-changes-1.md`. Where the two overlap, this file's layout and style rules win; round 1's behavior rules still stand.

Source: the owner's reference was a Vision Pro flight-tracker demo. We take its structure and polish, not its content. Do NOT copy: map tiles, real aircraft photos, airline logos or liveries, any app name or branding. Everything must be our own drawn assets.

## What to take from the reference

1. **Aim reticle.** When I aim at a plane, four thin corner brackets frame it. Beside it is a small label block: callsign (large), airline code and aircraft type (small), then "ORIGIN > DEST" in large letters, with "Departed 10:00 ago · Arriving in 00:05" in small type underneath. It appears only for the aimed plane.
2. **Trail.** One smooth thin line with a soft gradient (bright near the plane, fading away). Behind the plane: solid with a fade. Ahead: dotted with a fade. Keep it elegant, not thick.
3. **Sky markers.** Tiny and precise: a small plane silhouette (rotated to its heading) with no frame until aimed. Same idea for the helicopter (amber, rotor cross) and the satellite (a small bright cyan dot with a faint ring).
4. **Info card as glass.** A large rounded panel, frosted pale blue-gray with a thin bright edge, slightly tilted toward me in perspective. Layout:
   - Top: callsign large, with airline name beneath, and small code and aircraft-type tags beside it. A close button (x) at the top right.
   - A thin divider.
   - Two columns: origin code large with the city name and "Departed ... ago"; destination code large with the city and "Arriving in ...".
   - A thin divider.
   - Bottom: "ALTITUDE" and "GROUND SPEED" as big numerals with small units, next to the aircraft image and its type name.
   - A small pill at the bottom edge with two tabs, **Route | Info**.
5. **Route tab instead of a map.** Don't use map tiles. Draw our own clean route diagram: origin and destination dots on a dark glass panel joined by a great-circle arc, with the plane glyph on the arc at its current position and a progress fill. Show the airport codes at the ends.
6. **Aircraft image.** Render a clean side view from our own 3D model for each aircraft type, in neutral generated colors. No liveries, logos or tail marks.
7. **Menu.** A cluster of round glass buttons (we need three: Sky, Radar, Hangar), with the active one in a bright accent blue and the rest pale frosted gray. Keep the lazy-follow behavior from round 1. Each button has a simple icon and a small label.
8. **Type.** One clean rounded sans-serif. Large numerals for key data, small light all-caps labels, consistent padding and corner radius. Large and bright enough to read at arm's length (see the size rule in round 1).
9. **Palette.** Pale cool glass with white text, accent blue for the active and tappable elements, green for the plane trail, amber for helicopters, cyan for satellites.

## Differentiators to keep prominent
Pulling an aircraft down, the hangar, the Sky return pad, throw and return, radar, satellites and helicopters. These are what make SkyHangar different from a plain tracker; give them equal polish.
