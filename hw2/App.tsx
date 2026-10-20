import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { AudioTaskQueue } from "./audio-queue-controller";
import { audioEngine } from "./audioEngine";

type Status = "loading" | "ready" | "playing" | "done" | "cancelled" | "error";

interface QueueItem {
  id: number;
  url: string;
  status: Status;
  message?: string;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const STATUS_LABEL: Record<Status, string> = {
  loading: "Downloading / decoding…",
  ready: "Decoded, waiting to play",
  playing: "Playing",
  done: "Finished",
  cancelled: "Cancelled",
  error: "Error",
};

const queue = new AudioTaskQueue();

function Visualizer({
  getFrequencyData,
}: {
  getFrequencyData: typeof audioEngine.getFrequencyData;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    let frame = 0;
    const draw = () => {
      const data = getFrequencyData();
      context.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / Math.max(data.length, 1);

      for (let index = 0; index < data.length; index += 1) {
        const barHeight = (data[index] / 255) * canvas.height;
        context.fillStyle = "#4f46e5";
        context.fillRect(
          index * barWidth,
          canvas.height - barHeight,
          Math.max(0, barWidth - 1),
          barHeight,
        );
      }

      frame = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(frame);
  }, [getFrequencyData]);

  return (
    <canvas
      ref={canvasRef}
      width={680}
      height={160}
      role="img"
      aria-label="Audio frequency visualizer"
      style={{ display: "block", width: "100%", height: 160 }}
    />
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [items, setItems] = useState<QueueItem[]>([]);
  const nextId = useRef(1);

  function update(id: number, patch: Partial<QueueItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function handleEnqueue(event: FormEvent) {
    event.preventDefault();
    const trackUrl = url.trim();
    if (!trackUrl) return;

    const id = nextId.current++;
    setItems((prev) => [...prev, { id, url: trackUrl, status: "loading" }]);
    setUrl("");

    // Inside the click: create + unlock the AudioContext (autoplay policy).
    audioEngine.resume().catch(() => {});

    queue
      .enqueue(trackUrl)
      .then(async (buffer) => {
        update(id, { status: "ready" });
        await audioEngine.playBuffer(buffer);
        update(id, { status: "done" });
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) update(id, { status: "cancelled" });
        else
          update(id, {
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          });
      });
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "1rem" }}>
      <h1>HW2 – Audio Visualizer Queue Engine</h1>

      <Visualizer getFrequencyData={() => audioEngine.getFrequencyData()} />

      <form
        onSubmit={handleEnqueue}
        style={{ display: "flex", gap: "0.5rem", margin: "1rem 0" }}
      >
        <label htmlFor="track-url">Audio URL</label>
        <input
          id="track-url"
          type="text"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/track.mp3"
          style={{ flex: 1 }}
        />
        <button type="submit">Enqueue</button>
      </form>

      <h2>Queue</h2>
      {items.length === 0 ? (
        <p>The queue is empty.</p>
      ) : (
        <ol aria-label="Queue">
          {items.map((item) => (
            <li key={item.id}>
              {item.url} — {STATUS_LABEL[item.status]}
              {item.message ? `: ${item.message}` : ""}
            </li>
          ))}
        </ol>
      )}
      <p>
        Note: cross-origin URLs must send CORS headers, or the download is
        blocked by the browser.
      </p>
    </main>
  );
}