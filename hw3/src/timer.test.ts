import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAntiDriftTimer } from "./timer";

const FRAME_MS = 16;

const cancelFrame = vi.fn((id: number) =>
  clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
);

beforeEach(() => {
  vi.useFakeTimers();
  // Frames run on the fake clock, ~60fps. (Node has no requestAnimationFrame.)
  vi.stubGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) =>
      setTimeout(() => callback(Date.now()), FRAME_MS) as unknown as number,
  );
  cancelFrame.mockClear();
  vi.stubGlobal("cancelAnimationFrame", cancelFrame);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Simulates the main thread being blocked: time passes, no timer callbacks run. */
const blockMainThread = (ms: number) => vi.setSystemTime(Date.now() + ms);

describe("createAntiDriftTimer", () => {
  it("reports the remaining time on each frame", () => {
    const ticks: number[] = [];
    createAntiDriftTimer(1000, (remaining) => ticks.push(remaining));

    expect(ticks).toEqual([]); // nothing synchronous
    vi.advanceTimersByTime(FRAME_MS * 3);
    expect(ticks).toEqual([984, 968, 952]);
  });

  it("is still correct after the main thread is blocked for 500ms", () => {
    const start = Date.now();
    const ticks: number[] = [];
    createAntiDriftTimer(5000, (remaining) => ticks.push(remaining));

    vi.advanceTimersByTime(1000);
    const before = ticks[ticks.length - 1];

    blockMainThread(500); // no frames run during the block
    vi.advanceTimersByTime(FRAME_MS); // the next frame arrives
    const after = ticks[ticks.length - 1];

    // The first tick after the block jumps by the whole blocked time...
    expect(before - after).toBeGreaterThanOrEqual(500);
    // ...and equals the true remaining time (within one frame).
    const trueRemaining = 5000 - (Date.now() - start);
    expect(Math.abs(after - trueRemaining)).toBeLessThanOrEqual(FRAME_MS);
  });

  it("calls onTick(0) exactly once, then stops", () => {
    const ticks: number[] = [];
    createAntiDriftTimer(100, (remaining) => ticks.push(remaining));

    vi.advanceTimersByTime(1000);

    expect(ticks.filter((remaining) => remaining === 0)).toEqual([0]);
    expect(ticks[ticks.length - 1]).toBe(0);
    expect(vi.getTimerCount()).toBe(0); // no frame left scheduled

    const count = ticks.length;
    vi.advanceTimersByTime(1000);
    expect(ticks.length).toBe(count);
  });

  it("finishes with a single onTick(0) when the thread was blocked past the end", () => {
    const ticks: number[] = [];
    createAntiDriftTimer(300, (remaining) => ticks.push(remaining));

    blockMainThread(2000); // blocked well beyond the deadline
    vi.advanceTimersByTime(FRAME_MS);
    vi.advanceTimersByTime(1000);

    expect(ticks).toEqual([0]); // never negative, never repeated
  });

  it("handles a zero duration with one onTick(0)", () => {
    const ticks: number[] = [];
    createAntiDriftTimer(0, (remaining) => ticks.push(remaining));

    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([0]);
  });

  it("cancel() stops the ticks", () => {
    const ticks: number[] = [];
    const cancel = createAntiDriftTimer(5000, (remaining) => ticks.push(remaining));

    vi.advanceTimersByTime(FRAME_MS * 3);
    expect(ticks).toHaveLength(3);

    cancel();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(2000);
    expect(ticks).toHaveLength(3);
  });

  it("cancel() is safe to call twice", () => {
    const cancel = createAntiDriftTimer(5000, () => {});
    vi.advanceTimersByTime(FRAME_MS);

    cancel();
    cancel();

    expect(cancelFrame).toHaveBeenCalledTimes(1);
  });

  it("cancel() called from inside onTick stops further frames", () => {
    let calls = 0;
    const cancel: () => void = createAntiDriftTimer(5000, () => {
      calls++;
      if (calls === 3) cancel();
    });

    vi.advanceTimersByTime(2000);

    expect(calls).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never has more than one frame scheduled (no tick accumulation)", () => {
    createAntiDriftTimer(5000, () => {});
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(FRAME_MS * 10);
    expect(vi.getTimerCount()).toBe(1);

    blockMainThread(500);
    vi.advanceTimersByTime(FRAME_MS);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("a naive setInterval countdown drifts, this timer does not", () => {
    const TOTAL = 5000;
    const start = Date.now();

    // Naive: subtract a fixed step on every interval tick.
    let naive = TOTAL;
    const intervalId = setInterval(() => {
      naive -= 100;
    }, 100);

    // Anti-drift timer started at the same moment.
    let antiDrift = TOTAL;
    createAntiDriftTimer(TOTAL, (remaining) => {
      antiDrift = remaining;
    });

    vi.advanceTimersByTime(1000);
    const trueBefore = TOTAL - (Date.now() - start);
    expect(naive).toBe(trueBefore); // no problem while the thread is free

    blockMainThread(500); // the interval misses its ticks; they are not made up
    vi.advanceTimersByTime(100);
    clearInterval(intervalId);

    const trueRemaining = TOTAL - (Date.now() - start);
    expect(naive - trueRemaining).toBeGreaterThanOrEqual(400); // naive drifted
    expect(Math.abs(antiDrift - trueRemaining)).toBeLessThanOrEqual(FRAME_MS);
  });
});
