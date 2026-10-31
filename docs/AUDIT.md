# Audit and implementation notes — 2026-10-31

## Baseline audit

The supplied prototype was preserved as the starting point. These findings were checked against the original functions and reproduced before or during the fixes:

| Area | Original finding | Result |
| --- | --- | --- |
| `generatePlan` | `teamLock` was never read; swaps moved locked players | Locks are hard constraints during placement and swaps; impossible constraints throw before application |
| `applyGenerated` | Replaced all targets | Explicit target locks survive every strategy, quick setting and comparison application |
| `makeScenarioForPlan` | Every untargeted building was enemy-controlled | Neutral by default; enemy ownership requires an explicit, shared assumption |
| `compareModels` | Same static priority arrays, no visible distribution trade-offs | Five profiles; objective utility, resistance, retention, allocation details and uncovered income are shown |
| Role edits/settings | Could produce missing Holders, inconsistent Killer count, invalid team IDs | Manual work remains a visibly warned draft; invalid plans cannot be generated or exported as orders. Invalid settings are transactional |
| Imported phase/team preferences | Stored but not used by target assignment | Phase preferences participate in target scores; imported team preferences influence placement and swap costs; manual team overrides lock automatically |
| Killer selection | Mostly Power order, could consume a non-Killer role lock | Locked roles cannot be repurposed; commander suitability and role preference precede Power |
| `controlEvents` | Rounded fractional minutes and silently ignored malformed text | Strict parsing, continuous intervals, conflicting simultaneous ownership rejected; pre-opening events ignored |
| `evaluateScenario` | Capture FTC on the following minute sample, missing end-time FTC | Instant FTC at first valid capture, once only; exact interval integration and separate tank totals |
| JSON import | Assigned raw data to global state before validation | Candidate state, schema validation, v1 migration, preview, stale-preview detection, confirmation, then save |
| CSV/XLSX import | Missing/invalid records silently skipped; no preview | Row errors surfaced; Unicode and Turkish decimals retained; Contacted and both Mission columns read |
| XLSX parser | Already used workbook relationships, shared/inline strings and native raw-deflate | Retained; relationship path normalization improved; actual RR.xlsx verified in a real browser |

## Source verification

The community [calculator source](https://github.com/alter/tiles-survive-calculator/blob/main/docs/index.html) was inspected on 2026-10-31. Its alliance rate/FTC pairs are: Central 1800/9000, each WTC 1200/6000, each WPP 600/3000, each special building 240/1200. It assigns FTC to the first capturing side and adds collected tank count × average water as a one-off amount. Its phase opening is 15; this app retains the commander's configurable 12-minute default and 20-minute tank start. Its special-effect descriptions are informational and are not multipliers on water production. These are community-reference values, not an official game API.

The [Ponta map article](https://note.com/open_quokka4370/n/nc5da3e0f6c5e) was opened. Map coordinates and graph links in this application remain explicitly schematic. No measured distance, travel duration, success probability or automatic garrison handover is asserted.

## Planner design

`generatePlan(mode, state)` does not mutate its input. It validates roster/configuration; places independent Killers; places fixed-team and fixed-role players; ensures Holder coverage; distributes remaining Support; improves power spread with legal same-role swaps; matches objectives to teams; validates the result. Counts and role/team/target locks are hard constraints. Preferred leaders lock their role and team so regeneration cannot silently move them.

Objective value = priority × (production over the phase × production weight × mode coefficient + FTC × FTC weight × mode coefficient + special utility × special weight × mode coefficient).

Phase-II objective utility omits FTC for buildings already covered by an allied primary objective in Phase I. Assignment fit deducts a penalty for stated enemy Power above assigned Power, rewards retained production during the assumed capture delay, and adds a small (at most 10% per unit preference weight) preference adjustment. Imported team preferences guide same-size placement and add a swap mismatch cost of 0.05 × squared mean team Power × preference weight. These are documented scoring heuristics, not calibrated combat statistics. Default special utility is 6000 water-equivalent per special objective, adjustable through its weight, including zero. The five mode coefficients are visible in `STRATEGY_WEIGHTS`. Maximum Water is a heuristic objective, not proof of a global optimum.

The aggressive profile deliberately assigns a second Central force, sacrificing another primary objective. Secondary objectives are not counted as guaranteed captures. No automatic abandonment is authorized by a secondary order. Phase-transition instructions require replacement garrisons or an explicit commander decision before Holders leave.

## Persistence and manual operations

Schema v2 adds notes, Contacted, suitability, team/target locks, preferred leaders, strategy weights, timed tanks and Battle Control. Version-1 JSON/local data migrates on load; the existing localStorage key remains unchanged. Incoming malformed structures never replace the current plan. Full valid-structure drafts may be restored with visible plan warnings. Existing locks remain protected during import; remove locks intentionally to replace them.

Manual role/team edits can temporarily leave a draft incomplete. The dashboard and team page report all hard-constraint failures, and orders export is blocked until repaired. This supports multi-step officer edits without pretending an incomplete roster is battle-ready. JSON can back up a draft. Substitute replacement transfers the outgoing player's assignment and locks atomically.

Battle Control is manual. Observed scores are entered by the officer, projected income assumes unchanged current ownership, and a Central alternative subtracts the income of a sole defended objective that would be abandoned. It excludes future FTC and tanks rather than fabricating their values. Unavailable Holders and marked garrison risks trigger warnings; no plan is automatically changed.

## Validation evidence

- 31 Node tests: script order, relative entry-point assets, defaults, 3/5/6/8 teams, all five modes, determinism, impossible locks, independent Killers, target legality, data migration/roundtrip, invalid inputs, preservation after failed imports/settings, stale previews, Unicode escaping, FTC, ownership changes, fractional times, custom opening, tanks and Battle Control.
- Five browser tests: actual Excel ZIP/XML input, all five strategies with 3/5/6 teams using that roster, all eight real DOM views, interval scoring and cancelable preview.
- During the original local validation, the user-supplied workbook was selected through the UI and confirmed: 42 players = 30 main + 10 reserve + 2 pool. A team lock and a primary-target lock survived UI regeneration; an impossible Holder setting reverted to its previous value.
- Privacy correction: the original real-data fixture and bundled seed roster have been removed. Current tests use only independently generated `synthetic-roster.json` and `synthetic-roster.xlsx` with artificial names and powers. Fresh installations start empty; existing localStorage plans are preserved. The public dev history is replaced by a clean snapshot rooted in the original license-only commit.

## Practical limits

Power is not a combat simulator; unknown rally strength, heroes, healing, enemy movement and map travel are not inferred. The optimizer is deterministic and greedy with local improvements. Phase simulations assume primary objectives are obtained after the selected delay; transition instructions are conditional and cannot verify actual safe garrison transfer. Battle Control forecasts use officer observations and assumptions, not telemetry.

Runtime assets are all local. Opening a downloaded folder remains possible without a CDN; GitHub Pages initial navigation needs a connection. Direct file navigation could not be browser-tested because the browser tool permits only HTTP(S); local asset references were checked. Offline re-opening of a hosted URL is not guaranteed because no service worker was added. XLSX decompression needs a modern browser supporting native raw-deflate.

## Privacy correction

The earlier implementation did not satisfy private-roster distribution requirements: both the production seed and the Excel fixture contained real player data. They were removed from the working tree; private workbooks/exports are now ignored, with a narrow exception for the artificial test workbook. The application does not load fixture data at runtime. Empty-state rendering, local-only import confirmation, clearing to an empty roster and restoration of existing browser data are covered by regression tests. The browser test harness is explicitly a test-only flow and imports artificial data through the normal preview UI.

With the user's explicit authorization, dev is rebuilt as a clean snapshot on top of the original license-only main commit, omitting the development commit that contained real data. Publication uses an explicit force-with-lease against the previously inspected remote tip; main and tags are not rewritten. No mirror push is used, so application-managed local refs are not published. Rewriting branch history does not erase old external clones, forks, cached commit views or local recovery refs. GitHub documents those limits and possible support follow-up in its [sensitive-data removal guide](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository).

Privacy validation passed: 35 Node tests and six browser tests, including fresh-origin empty startup and synthetic XLSX import. A scan of current app/document/test files found no original roster names; older external or local recovery copies require separate handling.
