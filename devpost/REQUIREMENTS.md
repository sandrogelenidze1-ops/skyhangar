# Learn AR with SPECS — Requirements

Sources and verification status:

| Source | Status |
|---|---|
| https://learn-specs.devpost.com/ | **Not read** — returns HTTP 403 to automated fetch |
| https://learn-specs.devpost.com/rules | **Not read** — HTTP 403 |
| https://learn-specs.devpost.com/resources | **Not read** — HTTP 403 |
| https://developers.specs.com/docs/clad/overview-section/how-clad-works | Read |
| https://developers.specs.com/docs/clad/setup/setup-ai/claude-code-setup | Read |
| https://github.com/challengepost/learn-specs (skill pack README) | Read |

Items tagged **[brief]** come from the project owner's brief and still need to be checked by a human against the Devpost rules page. Items tagged **[verified]** were confirmed from a source above.

## Deadline

- Submission period ends **Nov 9, 2026, 5:00 PM ET**. [brief]
- Submission period start date: unknown — check rules page. [brief: project must be created during it]

## Project requirements

- [ ] New Lens project created during the submission period. [brief]
- [ ] Built for SPECS. [brief] Project starts from the SPECS Base Template, saved as its own folder. [verified: skill pack README]
- [ ] Planned with the Devpost Learn skill pack (`plan-lens`), which writes `devpost/design-brief.md`. [verified: skill pack README]
- [ ] Built through CLAD + Lens Studio + the Lens Studio MCP. [brief; CLAD/MCP setup verified from SPECS docs]
- [ ] Runs in the Lens Studio Preview. [brief]
- [ ] Built in a fresh chat from the brief, starting with the basic flow, with LEAF tests for each done criterion. [verified: skill pack README — recommended workflow]
- [ ] Pre-existing code beyond Lens Studio templates/libraries disclosed (`devpost/DISCLOSURES.md`). [brief]

## Submission requirements

- [ ] Public repo with the Lens Studio project folder **including `devpost/`**. [verified: skill pack README]
- [ ] Public YouTube demo video, **under 3 minutes**. [brief]
- [ ] Text description in **English**. [brief]
- [ ] No copyrighted music or third-party trademarks in the video. [brief — confirm wording on rules page]

## Judging (equally weighted) [brief]

1. **Design** — a complete, coherent product experience, not a tech proof of concept.
2. **Technical Implementation**
3. **Innovation / Idea**
4. **Presentation**

## Tooling facts [verified: SPECS docs]

- Lens Studio must be open before Claude Code starts so it can create the MCP server; terminal must be in the project folder (`.mcp.json` points Claude at the server).
- CLAD install: `/plugin marketplace add https://github.com/lens-studio-devs/ls-extensions.git`, `/plugin install ls-clad@ls-extensions`, `/reload-plugins`; verify with `/plugin` (Installed tab) and `/mcp`.
- Full Lens builds can take 30+ minutes.
- LEAF (Lens Evaluation & Automation Framework) lets the agent write scenario tests, runnable later from the LEAF panel; it can simulate hand gestures.
- Publishing to SPECS requires a SPECS account + Developer Program; device testing requires CLAD Device Access. Neither is needed for a Preview-based submission (assumption — confirm on rules page).

## Open questions for a human to confirm on Devpost

1. Submission period start date.
2. Exact judging wording and any sub-criteria.
3. Whether the video must show the Preview only, or may include device footage.
4. Eligibility (age, country, team size).
5. Any required Devpost form fields beyond description, repo and video.
