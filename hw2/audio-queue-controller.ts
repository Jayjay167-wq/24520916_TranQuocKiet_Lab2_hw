/** Injectable I/O, so the queue can be tested without a browser or network. */
export interface AudioTaskQueueOptions {
  /** Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Defaults to AudioContext.decodeAudioData on a lazily created context. */
  decode?: (data: ArrayBuffer) => Promise<AudioBuffer>;
}

interface QueuedAudioTask {
  trackUrl: string;
  controller: AbortController;
  ready: Promise<AudioBuffer>;
  resolve: (buffer: AudioBuffer) => void;
  reject: (error: unknown) => void;
}
 
function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
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
 * NOT implemented yet:
 *   - playback through AnalyserNode, one track after another (Task 2.3)
 *   - cancel API + AudioBufferSourceNode cleanup              (Task 2.4)
 * (Each task's fetch already receives its AbortSignal, ready for 2.4.)
 */
export class AudioTaskQueue {
  private queue: QueuedAudioTask[] = [];
  private isProcessing = false;
  private activeController: AbortController | null = null;
 
  private readonly fetchFn: typeof fetch;
  private readonly decode: (data: ArrayBuffer) => Promise<AudioBuffer>;
  private audioContext: AudioContext | null = null;
 
  constructor(options: AudioTaskQueueOptions = {}) {
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
    this.decode =
      options.decode ?? ((data) => this.getAudioContext().decodeAudioData(data));
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
 
  private getAudioContext(): AudioContext {
    this.audioContext ??= new AudioContext();
    return this.audioContext;
  }
}