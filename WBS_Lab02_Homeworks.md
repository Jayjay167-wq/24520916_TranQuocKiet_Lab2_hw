# Lab 02 – Modern React Architecture: Work Breakdown Structure

Each homework = 1 week, 5 steps.

---

## HW1: Production Enterprise Data-Grid (WCAG 2.2 AA)

**Goal:** Accessible Data-Grid (sort, filter, paginate) with Lighthouse 100/100 on Accessibility and Best Practices.

| Step | Work package | Deliverables | Time |
|------|--------------|--------------|------|
| 1.1 | **Setup & contract** | Scaffold React + TypeScript project; define `ColumnDef<T>` and `DataGridProps<T>` in `data-grid-contract.ts`; sample dataset | Day 1 |
| 1.2 | **Semantic markup** | Native `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<button>` for sort; ARIA `role="grid"`, `row`, `gridcell`; `ariaLabel` prop; zero div-soup | Day 2 |
| 1.3 | **Core features** | Sorting (`sortable`), filtering, pagination; `onRowSelect` callback; `isProcessing` state | Day 3 |
| 1.4 | **Keyboard & a11y** | Arrow-key cell navigation (roving tabindex); Enter selects, Space toggles; visible focus; 4.5:1 contrast; `aria-sort`, live-region announcements; screen-reader test | Day 4–5 |
| 1.5 | **Audit & delivery** | Lighthouse 100/100 (Accessibility + Best Practices); fix issues; README with screenshots; clean commits; submit | Day 6–7 |

**Done when:** Lighthouse scores verified, full keyboard-only use works, no non-semantic elements.

---

## HW2: Concurrent FIFO Audio Visualizer Queue Engine

**Goal:** Async FIFO queue that downloads/decodes tracks concurrently and drives a 60fps visualizer with zero memory leaks.

| Step | Work package | Deliverables | Time |
|------|--------------|--------------|------|
| 2.1 | **Setup & design** | Project scaffold; `AudioTask` type; class skeleton for `AudioTaskQueue` (`queue`, `isProcessing`, `activeController`) | Day 1 |
| 2.2 | **FIFO queue controller** | `enqueue(trackUrl)` returning a Promise; `processNext()`; simultaneous downloads + audio buffer decoding in strict FIFO order | Day 2–3 |
| 2.3 | **Web Audio engine** | `AudioContext` + `AnalyserNode` (FFT 256/512 bins); play decoded buffers via `AudioBufferSourceNode` | Day 3–4 |
| 2.4 | **Visualizer & memory safety** | Canvas/SVG visualizer via `requestAnimationFrame` at 60fps without state thrashing; `AbortController` cancellation; disconnect/cleanup of source nodes | Day 5 |
| 2.5 | **Testing & delivery** | Test cancel, rapid enqueue, and cleanup (DevTools memory profile); README; clean commits; submit | Day 6–7 |

**Done when:** Queue order is correct, cancellation works, no leaked nodes/listeners, steady 60fps.

---

## HW3: High-Concurrency Flash-Sale E-Commerce Engine

**Goal:** Vietnam Mega-Sale scenario (11.11 / Midnight Flash Sale) with a zero-drift timer and inventory state machine.

| Step | Work package | Deliverables | Time |
|------|--------------|--------------|------|
| 3.1 | **Setup & domain model** | Project scaffold; product/inventory types; sale scenario definition | Day 1 |
| 3.2 | **Zero-drift timer** | `createAntiDriftTimer(durationMs, onTick)` using `Date.now()` delta + `requestAnimationFrame`; cancel function; tests against `setInterval` drift | Day 2 |
| 3.3 | **Inventory state machine** | Finite states: available → reserved → lock expiry → checkout/sold-out; optimistic lock; reservation expiry handling | Day 3–4 |
| 3.4 | **UI & flash-sale simulation** | Countdown + product UI; simulate concurrent buyers; handle race conditions and edge cases | Day 5 |
| 3.5 | **AI audit & delivery** | `AI_FAILURE_AUDIT.md` documenting ≥ 3 AI flaws; ≥ 8 atomic commits (Conventional Commits); README; submit | Day 6–7 |

**Done when:** Timer shows no drift, state transitions are valid, audit report has ≥ 3 flaws, ≥ 8 conventional commits.

---

## Quick Checklist

- [ ] HW1: Lighthouse 100/100, keyboard nav, semantic HTML
- [ ] HW2: FIFO order, AbortController cleanup, 60fps visualizer
- [ ] HW3: Zero-drift timer, inventory state machine, `AI_FAILURE_AUDIT.md`, ≥ 8 commits
