import { AudioTaskQueue } from "./audio-queue-controller";

// Compile-time/runtime smoke check for the Task 2.1 skeleton.
const queue = new AudioTaskQueue();

export default function App() {
  const state = queue.getSnapshot();
  return (
    <main>
      <h1>HW2 – Audio Visualizer Queue Engine</h1>
      <p>
        Setup complete. Queue state: {state.pending} pending,{" "}
        {state.isProcessing ? "processing" : "idle"}. The visualizer and cleanup come in
        Task 2.4.
      </p>
    </main>
  );
}
