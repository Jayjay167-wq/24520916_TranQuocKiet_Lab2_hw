import { useEffect, useRef, useState } from "react";
import { createAntiDriftTimer } from "./timer";

interface CountdownProps {
  /**
   * Length of the countdown in ms. It is read ONCE, when the component
   * mounts; to start a new countdown, give the component a new `key`.
   */
  durationMs: number;
  /** Called once, when the countdown reaches 0. */
  onComplete?: () => void;
  /** Accessible name, for example "Hold expires in". */
  label?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 3725 -> "01:02:05". Hours are not capped, so 400 hours reads "400:00:00". */
function formatHms(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * hh:mm:ss countdown driven by the zero-drift timer.
 *
 * The timer ticks every animation frame, but the component only re-renders
 * when the displayed second changes (React skips a setState with the same
 * value), so it renders about once per second. The timer is cancelled when
 * the component unmounts.
 */
export function Countdown({ durationMs, onComplete, label }: CountdownProps) {
  const startMs = useRef(
    Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0,
  ).current;
  const [seconds, setSeconds] = useState(() => Math.ceil(startMs / 1000));

  // Always call the latest callback without restarting the timer.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    // createAntiDriftTimer returns its cancel function: React calls it on unmount.
    return createAntiDriftTimer(startMs, (remainingMs) => {
      setSeconds(Math.ceil(remainingMs / 1000));
      if (remainingMs === 0) onCompleteRef.current?.();
    });
  }, [startMs]);

  return (
    <span
      role="timer"
      aria-label={label}
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      {formatHms(seconds)}
    </span>
  );
}
