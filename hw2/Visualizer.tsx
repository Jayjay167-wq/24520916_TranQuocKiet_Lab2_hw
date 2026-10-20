import { useEffect, useRef } from "react";

interface VisualizerProps {
  /** Returns the current spectrum (0–255 per bin). Called once per frame. */
  getFrequencyData: () => Uint8Array;
  width?: number;
  height?: number;
}

const BAR_COUNT = 64;
const GAP = 2;

/**
 * Canvas frequency-bar visualizer.
 *
 * Per-frame work uses refs and direct canvas drawing only: no React state is
 * set inside the animation loop, so the component never re-renders while it
 * animates. The loop is started in an effect and cancelled in its cleanup.
 */
export function Visualizer({
  getFrequencyData,
  width = 640,
  height = 160,
}: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Latest callback, read each frame, so a new function identity from the
  // parent never restarts the loop.
  const getDataRef = useRef(getFrequencyData);
  getDataRef.current = getFrequencyData;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    // Crisp rendering on high-DPI screens.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const barWidth = (width - GAP * (BAR_COUNT - 1)) / BAR_COUNT;
    let rafId = 0;

    const draw = () => {
      const data = getDataRef.current();
      const binsPerBar = Math.max(1, Math.floor(data.length / BAR_COUNT));

      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#60a5fa";

      for (let bar = 0; bar < BAR_COUNT; bar++) {
        let sum = 0;
        const from = bar * binsPerBar;
        for (let i = 0; i < binsPerBar; i++) sum += data[from + i] ?? 0;
        const barHeight = (sum / binsPerBar / 255) * height;
        ctx.fillRect(
          bar * (barWidth + GAP),
          height - barHeight,
          barWidth,
          barHeight,
        );
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [width, height]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Audio frequency spectrum"
      style={{ width, height, maxWidth: "100%" }}
    />
  );
}
