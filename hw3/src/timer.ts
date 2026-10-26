/**
 * Zero-drift countdown timer (Task 3.2).
 *
 * The end time is fixed ONCE, when the timer starts. Every animation frame
 * recomputes the remaining time from the real clock (`Date.now()`), so the
 * value never depends on how many frames or intervals have run. If the main
 * thread is blocked or the tab is throttled, the next tick simply reports
 * the true remaining time; nothing piles up and nothing has to catch up.
 *
 * A `setInterval` countdown that subtracts a fixed step on every tick
 * drifts, because late or skipped ticks are never made up.
 *
 * @param durationMs Countdown length in milliseconds (finite; negative is
 *                   treated as 0).
 * @param onTick     Called once per frame with the remaining milliseconds,
 *                   never below 0. Called with 0 exactly once, then the
 *                   timer stops. The first call happens on the first frame,
 *                   not synchronously.
 * @returns          cancel(): stops the timer. Safe to call more than once,
 *                   and safe to call from inside onTick.
 */
export function createAntiDriftTimer(
  durationMs: number,
  onTick: (remainingMs: number) => void,
): () => void {
  if (!Number.isFinite(durationMs)) {
    // NaN/Infinity would make the loop never reach 0.
    throw new RangeError("durationMs must be a finite number");
  }

  const endTime = Date.now() + Math.max(0, durationMs);
  let rafId = 0;
  let stopped = false;

  function tick(): void {
    if (stopped) return;

    const remaining = Math.max(0, endTime - Date.now());
    if (remaining === 0) stopped = true; // finished: no further frame is requested
    onTick(remaining);

    // One frame request at a time: ticks never accumulate. Re-check `stopped`
    // because onTick may have called cancel().
    if (!stopped) rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);

  return function cancel(): void {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
  };
}
