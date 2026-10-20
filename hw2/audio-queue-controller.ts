import type { AudioTask } from "./audio-task";
import { audioEngine } from "./audioEngine";

function createAbortError(message = "The operation was aborted."): Error {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/** Injectable I/O, so the queue can be tested without a browser or network. */
export interface AudioTaskQueueOptions {
  /** Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Defaults to the shared audioEngine's AudioContext.decodeAudioData. */
  decode?: (data: ArrayBuffer) => Promise<AudioBuffer>;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? createAbortError();
  }
}

/**
 * Concurrent FIFO audio task queue – Task 2.2.
 *
 * Two guarantees:
 *  1. PARALLEL LOADING – fetch + decode for a track starts synchronously
 *     inside enqueue(), so N enqueued URLs download and decode at once.
 *  2. STRICT FIFO DELIVERY – promises returned by enqueue() settle in the
 *     order the tracks were enqueued, never in the order loading finished.
 *     A fast track B waits (already decoded) until the slower track A in
 *     front of it has settled. A failed track rejects only its own promise
 *     and does not block the tracks behind it.
 *
 * State:
 *   queue            tasks waiting for their turn, in FIFO order
 *   isProcessing     true while the drain loop is running
 *   activeController AbortController of the task currently at the head
 *                    (being waited on), or null when idle
 *
 * Playback lives in audioEngine.ts: feed each delivered buffer to
 * audioEngine.playBuffer(); it plays tracks one after another.
 *
 * cancel() (Task 2.4) aborts every task through its AbortController: the
 * in-flight downloads are cancelled and all pending promises reject with an
 * AbortError. Stopping tracks that are already playing is the engine's job
 * (audioEngine.stop()).
 */
export class AudioTaskQueue {
  private queue: AudioTask[] = [];
  private isProcessing = false;
  private activeController: AbortController | null = null;

  private readonly fetchFn: typeof fetch;
  private readonly decode: (data: ArrayBuffer) => Promise<AudioBuffer>;

  constructor(options: AudioTaskQueueOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.decode =
      options.decode ?? ((data) => audioEngine.decodeAudioData(data));
  }

  /** Adds a track to the queue; resolves with the decoded audio, in FIFO order. */
  async enqueue(trackUrl: string): Promise<AudioBuffer> {
    // Concurrency control with AbortSignal cancellation.
    const controller = new AbortController();
    // Start download + decode NOW (synchronously), not when the task's turn comes.
    const ready = this.load(trackUrl, controller.signal);
    // If this task fails while an earlier one is still being awaited, nobody is
    // listening to `ready` yet; mark it handled to avoid an unhandled rejection.
    // The drain loop still observes the real rejection when it awaits `ready`.
    ready.catch(() => {});

    return new Promise<AudioBuffer>((resolve, reject) => {
      this.queue.push({ trackUrl, controller, ready, resolve, reject });
      void this.processNext();
    });
  }

  /**
   * Cancels everything: the task at the head (downloading/decoding) and all
   * tasks waiting behind it. Each task's AbortController is aborted, so
   * fetches stop, and each enqueue() promise rejects with an AbortError.
   * The queue stays usable: new enqueue() calls work normally afterwards.
   */
  cancel(): void {
    const reason = createAbortError("The task was cancelled.");

    // Head: its `ready` rejects with the abort reason; the drain loop then
    // rejects the task's promise and clears the active state.
    this.activeController?.abort(reason);

    // Waiting tasks: abort and reject right away, then empty the queue.
    for (const task of this.queue.splice(0)) {
      task.controller.abort(reason);
      task.reject(reason);
    }
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

  /**
   * Drains the queue head-first. Runs as a single loop (guarded by
   * isProcessing); enqueue() calls made while it runs are picked up by the
   * loop condition, so no task can be left behind.
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;
    try {
      while (this.queue.length > 0) {
        const task = this.queue.shift()!;
        this.activeController = task.controller;
        try {
          // Waits for THIS task only; later tasks keep loading in parallel.
          task.resolve(await task.ready);
        } catch (error) {
          task.reject(error); // isolate the failure to this task
        }
      }
    } finally {
      // Runs synchronously right after the loop's last length check, so an
      // enqueue() cannot slip in between and be stranded.
      this.activeController = null;
      this.isProcessing = false;
    }
  }

  /** Download one track and decode it. Aborting rejects with an AbortError. */
  private async load(trackUrl: string, signal: AbortSignal): Promise<AudioBuffer> {
    const response = await this.fetchFn(trackUrl, { signal });
    if (!response.ok) {
      throw new Error(
        `Failed to download ${trackUrl}: ${response.status} ${response.statusText}`,
      );
    }
    const data = await response.arrayBuffer();
    const buffer = await this.decode(data);
    throwIfAborted(signal); // decodeAudioData itself cannot be aborted
    return buffer;
  }
}