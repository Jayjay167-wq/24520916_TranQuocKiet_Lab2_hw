/**
 * One unit of work in the queue: download + decode a single track.
 *
 * Each task owns its AbortController so it can be cancelled on its own
 * (Task 2.4), and carries the promise callbacks that settle the Promise
 * returned by `AudioTaskQueue.enqueue()`.
 */
export interface AudioTask {
  /** URL of the audio file to download and decode. */
  trackUrl: string;
  /** Cancels the in-flight download/decode for this task. */
  controller: AbortController;
  /** Settles the enqueue() promise with the decoded audio. */
  resolve: (buffer: AudioBuffer) => void;
  /** Rejects the enqueue() promise (failure or AbortError). */
  reject: (reason?: unknown) => void;
}
