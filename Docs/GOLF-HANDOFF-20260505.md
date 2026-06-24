## Golf Handoff - 2026-05-05

### Why This Was Paused

Golf work is paused pending client feedback because the remaining gaps are no longer cosmetic. The open issues are mostly business-logic and event-orchestration problems, not simple CSS tuning.

### What Was Confirmed

- The current working/test page is `formId=241`.
- The page can now render:
  - year -> event selection
  - leaderboard
  - gross skins
  - net skins
- DataRepeater runtime was extended far enough to support:
  - chained filter context
  - stable drill keys
  - display-only filter interactivity
  - mock-style score formatting experiments

### What Is Still Missing

#### 1. Event-Driven Orchestration

The client requirement is event-driven, not just a fixed form with a few repeaters.

After an event is selected, the page still needs to:

- read event metadata
- determine how many flights exist
- determine how many gross-skins flights exist
- determine how many net-skins flights exist
- determine whether closest-to-pin exists
- determine which rendering mode applies for the selected game

#### 2. Different Rendering by Game Type

The client explicitly said different games must render differently.

Examples:

- individual event
- team event
- multi-round championship / aggregate event

The current prototype still overuses one generic leaderboard layout.

#### 3. Drill-Down Keying Is Not Final

The correct business rule should be:

- team games: drill by `EventDate + Team`
- individual games: drill by `EventDate + GhinNo`

Some production data still lacks `GhinNo` in `CardResultNew`, so individual drill-down is not fully reliable yet.

#### 4. Closest To Pin Is Missing

Closest To Pin is a separate section and should not be folded into skins.

Rules still to implement:

- if data exists, show section
- if no data exists, hide section or show the correct empty-state

#### 5. Dynamic Section Rendering

The page still needs to render sections dynamically from event metadata:

- leaderboard for each flight
- gross skins for each gross-skins flight if data exists
- net skins for each net-skins flight if data exists
- closest-to-pin if data exists

#### 6. Mock GolfGenius Behavior Is Not Fully Matched

The GolfGenius mock has additional behavior which the current prototype does not fully reproduce yet:

- round selector semantics
- per-round aggregate labels such as `72 SKY`, `77 Eldo`
- nested drill behavior where clicking a round row reveals tee/course detail above it without duplicating the score row
- finer score-mark formatting and handicap-dot positioning
- mode differences between tournament summary and round-detail views

### Important Technical Findings

- The remaining gaps are not primarily CSS problems.
- The mock behavior depends on business rules plus data-shape differences.
- The best long-term solution is likely a dedicated golf event widget/orchestrator rather than continuing to stretch a fixed three-repeater form.

### Recommended Next Steps

1. Finalize the event metadata contract (`GetEvent` equivalent behavior).
2. Populate missing `GhinNo` values in `CardResultNew`.
3. Standardize drill keys:
   - team -> `Team`
   - individual -> `GhinNo`
4. Add Closest To Pin as a first-class section.
5. Render flights / skins / closest-to-pin dynamically from event metadata.
6. Create a stable golf fixture dataset covering:
   - individual event with full detail
   - team event with full team detail
   - multi-flight skins
   - closest-to-pin
   - events with intentionally missing sections to verify hide logic
7. Only after the above is correct should the UI be tuned further against the GolfGenius mock.

### Current Decision

Pause Golf until the client confirms the intended business behavior, especially:

- how to classify game types
- whether one page should support all game modes
- whether a dedicated golf event widget is acceptable
- when `GhinNo` data will be available for all individual events
