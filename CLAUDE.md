# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Cocos Creator 3.8.7 playable ad** (not a full game): a gas-station idle-tycoon vertical slice that
ends by sending the user to a store link. Everything ships as one self-contained HTML file produced by
the bundled `super-html` editor extension. Because it is a playable, the whole build is single-scene
(`assets/scenes/main-scene.scene`), single-session, and has no persistence — state lives in memory and
resets on load.

Working directory is a WSL2 view (`/mnt/h/...`) of a Windows Cocos install. This matters for tooling
(see Commands).

## Commands

**Editing/running the game.** Cocos Creator is the real build system. Open the project in Creator 3.8.7
and use the in-editor simulator (`Ctrl+P`) for runtime checks. Headless build:

```
CocosCreator --project . --build "platform=html5;debug=false"    # -> build/web-mobile
```

The final playable is produced afterward through the **super-html** extension panel
(Extension menu → super-html), which inlines assets into one HTML.

**Typecheck.** `npx tsc --noEmit -p tsconfig.json` **does not work from WSL**. The root `tsconfig.json`
extends `temp/tsconfig.cocos.json`, a Creator-generated file with Windows-absolute paths
(`H:\CocosCreator\RoadSide\assets\*`, `C:\ProgramData\cocos\...`) that don't resolve under Linux — you
get ~169 bogus `TS2307 Cannot find module 'cc'` errors that mean nothing. To actually typecheck, build a
throwaway config that re-points those paths (the Windows engine `.d.ts` is reachable via `/mnt/c/`):

```bash
S=<scratchdir>
cat > $S/cc-shim.d.ts <<'EOF'
/// <reference path="/mnt/c/ProgramData/cocos/editors/Creator/3.8.7/resources/resources/3d/engine/bin/.declarations/cc.d.ts"/>
EOF
cat > $S/tsconfig.wsl.json <<EOF
{ "compilerOptions": { "target":"ES2015","module":"ES2015","strict":false,
    "experimentalDecorators":true,"isolatedModules":true,"moduleResolution":"node",
    "noEmit":true,"skipLibCheck":true,"baseUrl":"$PWD","paths":{"db://assets/*":["assets/*"]} },
  "include": ["$PWD/assets/**/*.ts", "$S/cc-shim.d.ts"] }
EOF
npx --yes -p typescript@5.4.5 tsc --noEmit -p $S/tsconfig.wsl.json
```

That run is clean except for 4 known pre-existing errors (`UnlockFlash.ts` tween generic variance,
two `Slot.ts` `sp.Skeleton.defaultAnimation` protected-access hits, and unresolved `cc/env` in
`tracking/core/Tracking.ts`). Treat those as the baseline, not as regressions you introduced.

**There are no tests, no linter, and no npm scripts at the root.** `package.json` is the Cocos project
descriptor, not an npm package. Verification is: typecheck, then run the scene in the simulator.

**`extensions/super-html` cannot be rebuilt here** — only `dist/` is vendored; its `tsconfig.json` sets
`rootDir: ./src` and no `src/` exists. Don't try `tsc -b` there.

**Not a git repository.** `git` commands fail. `.gitmodules` declares
`assets/plugins/playable-foundation` as a submodule, but it is present as plain files.

## Architecture

### GameManager is the whole wiring layer

`assets/Src/Core/GameManager.ts` is the single orchestrator and the only place cross-system knowledge
lives. It holds the money balance, the tutorial state machine, and hint policy, and it injects behavior
into subsystems as **plain callbacks** — `gasStation.configureUpgrade(getMoney, trySpendMoney,
showWarning, onPumpUnlocked, ...)`, `carSpawner.onCarRefueled = ...`, `giftBoxIntro.onOpened = ...`.

**There is no event bus in gameplay code.** `assets/Src/Signals/GameSignals.ts` defines signal classes
and `assets/plugins/playable-foundation/game-foundation/` ships a `signal_bus`, a
`GameLifecycleManager` (`@register_lifecycle`, `ITickable`/`IInitializable`/…), an `object_pool`, and an
`assets_manager` — **none of them are referenced by anything under `assets/Src`.** They are dormant
framework carried in from a template. Don't assume an event-driven or DI architecture; trace callbacks.

Subsystems never call each other directly except downward (GasStation → Slot → Attendant/Car). If two
systems need to talk, the wire goes through GameManager.

### Tuning lives in one file

`assets/Src/Core/GameConfig.ts` holds `GAME_CONFIG` (costs, durations, `MAX_SLOTS`, UI timings) —
economy and pacing changes belong there, not scattered in components. Alongside it, `GAME_RUNTIME` is a
**mutable module-level singleton** (`speedLevel`, `refuelDuration`) read by `Car`/`Attendant` at the
moment refueling starts. That's deliberate: a pump unlocked later automatically inherits the current
speed level. `GasStation.onLoad()` calls `resetGameRuntime()` so scene reload never carries stale state.

Two config arrays are coupled: `SPEED_UPGRADE_COSTS.length` must equal
`REFUEL_DURATION_LEVELS.length - 1`. `GasStation.getMaxSpeedUpgrades()` clamps to the smaller of the two.

### GasStation owns the economy; UpgradePanel owns the interaction

`GasStation` decides what can be bought and charges for it. It exposes a `UpgradePanelState` snapshot
(`buildPanelState()`) — `hasPendingPump` / `canAffordPump` / `canAffordSpeedUpgrade` / `canAffordFake` —
that both `UpgradePanel` (for label/overlay/bounce rendering) and `GameManager` (for hint targeting)
read. This snapshot is the contract between the three; extend it rather than adding cross-references.

There are exactly three purchases: **unlock next pump** (also auto-unlocks that slot's attendant),
**upgrade refuel speed** (global, one level at a time), and **the fake CTA button** (unlocks nothing —
it fires `download()` + `game_end()`).

`Slot` still carries per-slot popup upgrade UI and an attendant tap-count mechanic
(`registerAttendantTap`, `showAttendantUpgradeUI`). **That path is dead** — `GasStation.refreshUpgradeUI()`
unconditionally hides every per-slot popup and routes all interaction through the single `UpgradePanel`.
The `attendant`-named tutorial stage and `attendantTapTarget` are legacy names that now mean *speed
upgrade*. Don't infer behavior from those names.

### Car flow

`CarSpawner` maintains a FIFO queue along `queueLane` waypoints and reparents cars between
`carParent` → `slotCarParent` → `exitCarParent` for z-ordering. `Car` is a state machine
(`CarState`: `QUEUE_MOVING → QUEUING → DRIVING_IN → WAITING → REFUELING → DRIVING_OUT`) driven by
`tween` chains, not `update()`. `WAITING` exists for the case where a car reaches a pump whose attendant
isn't unlocked yet. Cars are pooled by `CarSpawner` itself (`_pool`), not by the foundation `object_pool`.

### Tutorial / hint state machine

`GameManager._tutorialStage` is `'init' | 'attendant' | 'free'`:
- `init` — only the pump-unlock button is tappable; hand-hint appears **only when affordable**.
- `attendant` — speed-upgrade button; same affordability gate.
- `free` — all buttons; hint appears when the fake-CTA is affordable (immediately) or after
  `HANDTAP_IDLE_INTERVAL` seconds of no taps, pointing at the highest-cost affordable button.

An optional `GiftBoxIntro` gates the reveal: while it's unopened the station's upgrade UI is hidden but
the car spawner already runs, so the queue is populated by the time the player taps the box.

### Tracking

`tracking_service` (static class) → `Tracking` (core) → a **GIF-pixel beacon** at
`constant.TRACKING.BASE_URL`; no fetch/XHR, so it survives page unload. Live event surface is
`startSession()`, `start()`, `trackInteraction(name, params)`, `trackStoreTrigger(name, params)`,
`record_hit(x, y)`, `end()`. Everything else in that file is `@deprecated` — don't call it.
`GameManager` binds a global `TOUCH_END` listener for the hit-map plus `pagehide`/`beforeunload`/
`visibilitychange` to fire `end()`; a scene-level `tracking_component` is not needed.

Playable-network integration goes through `super_html_playable` (`download()`, `game_end()`,
`set_google_play_url()`, …), a thin `window.super_html` adapter that no-ops outside a network wrapper.
Note `GameManager.setupStore()` — which pushes `constant.STORE_LINK` into that adapter — is currently
commented out in `onLoad`.

### Isometric rendering

`IsoSorter` re-sorts sibling order by Y (lower Y renders on top) for the 2.5D look. It requires the
scene to keep the floor **outside** the sorted node — see the diagram in `IsoSorter.ts`. Adding new
world objects means putting them under the `IsoSorter` node, not next to it.

## Conventions

- Imports use Cocos `db://assets/...` aliases, never relative paths, even within `assets/Src`.
- Code comments are in Vietnamese; keep that when editing existing files.
- 4-space indent, semicolons, `@ccclass('PascalCase')`, camelCase members, `null!` for `@property` refs.
- Root `tsconfig.json` sets `strict: false` — untyped/`any` patterns in existing code are intentional.
- **Most behavior is scene data, not code.** `@property` fields are wired in
  `assets/scenes/main-scene.scene` and `assets/Prefabs/*.prefab`. Adding a `@property` to a component
  does nothing until the scene/prefab assigns it. If a change requires new wiring, say so explicitly —
  editing `.scene`/`.prefab` JSON by hand is error-prone and the user may need to do it in the editor.
- Creator exposes an MCP server for live scene inspection/editing (`settings/mcp-server.json`, port 3000,
  `autoStart: false`). When it's connected, `mcp__cocos-creator__*` tools can read the hierarchy and set
  component properties — far safer than hand-editing scene JSON.

## Stale docs — do not trust

- **`TRACKING.md`** describes a C#/Unity quest-tracking system (`Assets/Scripts/QuestModule/*.cs`,
  Zenject signal bus). None of it exists in this repo. It is leftover from another project and is
  unrelated to the `tracking/` plugin described above.
- **`AGENTS.md`** has correct conventions but stale paths: it says `assets/scripts/`, `assets/prefabs/`,
  `assets/plugins/game-foundation`, and `assets/plugins/super-html`. The real layout is `assets/Src/`,
  `assets/Prefabs/`, and both plugins under `assets/plugins/playable-foundation/`. Its build/test
  commands for `extensions/super-html` and its git guidance don't apply (see Commands).
- **`README.md`** is a one-line stub (`# PlayableTemplate`).
