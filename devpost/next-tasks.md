# SkyHangar: task queue for Claude Code

How to use: after the usage limit resets, open Lens Studio once, open the project, run `/clear`, then `/model` and choose Sonnet 5.5. Paste ONE task at a time. Wait for it to finish, look at the preview, then paste the next. Do not paste several at once.

Rules every task follows (they are repeated in each prompt):
- Keep Lens Studio responsive. Build meshes once at startup, cap segment counts, reuse instances. No heavy loops.
- Work only on the named task. Don't rebuild or rename anything else.
- Save the project when done and report in 3 lines max: what changed, whether it compiles, what you saw in the preview.
- Do not run the full LEAF suite until Task 9.

## Task 0: stability check
Read devpost/design-changes-1.md and design-changes-2.md for context, but do NOT apply them now. Check that the project compiles and the preview loads in under about 10 seconds. If startup is slow or Lens Studio lags, find the cause (likely procedural mesh generation in SkyHangarMeshes.ts and SkyHangarModelFactory.ts) and fix only that by lowering segment counts and building meshes once. Don't change how anything looks. Save and report in 3 lines.

## Task 1: backdrop
Make the preview backdrop visible and good: a dusk rooftop terrace with a skyline of simple buildings around the horizon, a parapet at about 1.1 m, a sky gradient and a few soft clouds. Use SkyHangarRooftopBackdrop.ts if it fits. Keep the triangle count low and add a single toggle to switch it off. Check a preview screenshot: the sky must read as a calm dusk, bright enough for markers to stand out. Save and report in 3 lines.

## Task 2: sky markers and aim reticle
Sky markers only: a small flat glyph per type (plane silhouette rotated to heading, helicopter with a rotor cross in amber, satellite as a small cyan dot with a faint ring), about 1.9 degrees across, brighter when aimed at. The aimed one gets the four corner brackets and the label block (callsign, ORIGIN > DEST, departed and arriving times). Look at a preview screenshot to confirm the three types are easy to tell apart. Save and report in 3 lines.

## Task 3: trails
Trails only: for the aimed or tapped plane, one thin smooth line along its full great-circle route from horizon to horizon with a soft gradient (solid behind with a fade, dotted ahead with a fade), airport codes at both ends. Helicopters get only a past trail. Satellites get an orbit arc. Verify with a preview screenshot. Save and report in 3 lines.

## Task 4: info card
Info card only, per design-changes-2.md: a frosted glass panel opening beside the tapped plane at my eye height, facing me and following with a slight lag. Layout: callsign and airline, origin and destination columns, big altitude and speed numbers, a Route | Info tab pill, our own drawn route arc on the Route tab (no map tiles), a close button, and "Let go". Use a placeholder for the aircraft image box for now. Verify with a preview screenshot. Save and report in 3 lines.

## Task 5: models
Models only: cleaner, slightly more detailed stylized models that stay light. Three airliner shapes, one helicopter with spinning rotors, one satellite. Neutral colors per airline, no logos, tail marks or real liveries. Cap triangle counts, build once and reuse. Check that Lens Studio stays responsive. Save and report in 3 lines.

## Task 6: hangar and pads
Hangar and pads only: a glass ledge with an edge glow and slim pedestals, plaques in the glass style with larger bright text, the Hangar pad with a hangar glyph, and the Sky pad with an up-arrow. Keep the paging, counter and sort. Verify with a preview screenshot. Save and report in 3 lines.

## Task 7: type and size pass
Type only: apply the size rule across cards, plaques, menu labels and radar labels (body text at least about 1.3 cm tall at 1.2 m, titles about 2 cm). Make the menu bar's small labels readable. One consistent font, padding and corner radius. Save and report in 3 lines.

## Task 8: radar
Radar only: restyle in the glass look with thin range rings, a soft sweep, and blips using the same plane, helicopter and satellite glyphs and colors as the sky. Save and report in 3 lines.

## Task 9: final checks
Run the full LEAF suite, fix anything that broke, update the scenarios for the new design, update README.md and devpost/PROGRESS.md, create devpost/DISCLOSURES.md and devpost/CHECKLIST.md, make sure no secrets are tracked (.mcp.json, the debug key), then commit with a clear message. Report which tests pass.
