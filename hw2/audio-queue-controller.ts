import type { AudioTask } from "./audio-task";

/**
 * Concurrent FIFO audio task queue – Task 2.1 skeleton.
 *
 * State:
 *   queue            tasks waiting to run, in FIFO order
 *   isProcessing     true while a task is being worked on
 *   activeController AbortController of the running task, or null
 *
 * Implemented so far: the state, enqueue() (builds the task and its
 * AbortController, pushes it, and kicks the processor) and a read-only
 * snapshot for tests.
 *
 * NOT implemented yet:
 *   - processNext(): shift tasks in FIFO order, download + decode, and
 *     settle each task's promise            (Task 2.2)
 *   - AudioContext / AnalyserNode playback  (Task 2.3)
 *   - cancellation + node cleanup           (Task 2.4)
 * Until Task 2.2, promises returned by enqueue() stay pending.
 */
export class AudioTaskQueue {
  private queue: AudioTask[] = [];
  private isProcessing = false;
  private activeController: AbortController | null = null;

  /** Adds a track to the queue; resolves with the decoded audio. */
  async enqueue(trackUrl: string): Promise<AudioBuffer> {
    // Concurrency control with AbortSignal cancellation.
    const controller = new AbortController();
    return new Promise<AudioBuffer>((resolve, reject) => {
      this.queue.push({ trackUrl, controller, resolve, reject });
      this.processNext();
    });
  }

  /** Read-only view of the internal state (useful for tests and the UI). */
  getSnapshot(): {
    pending: number;
    isProcessing: boolean;
    hasActiveTask: boolean;
  } {
    return {
      pending: this.queue.length,
      isProcessing: this.isProcessing,
      hasActiveTask: this.activeController !== null,
    };
  }

  /** Starts the next task if idle. Body arrives in Task 2.2. */
  private processNext(): void {
    if (this.isProcessing || this.queue.length === 0) return;
    // TODO(2.2): shift the next task, set isProcessing/activeController,
    // download + decode, settle resolve/reject, then clear state and recurse.
  }
}
