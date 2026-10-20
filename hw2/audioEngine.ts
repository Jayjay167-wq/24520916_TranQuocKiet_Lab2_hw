function createAbortError(message: string): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }

  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

/**
 * Web Audio engine – Tasks 2.3 + 2.4.
 *
 * Owns the single AudioContext and the AnalyserNode, plays decoded buffers
 * one at a time, and exposes frequency data for the visualizer.
 *
 * Graph:  AudioBufferSourceNode -> AnalyserNode (fftSize 512) -> destination
 *
 *  - lazy context creation (nothing touches Web Audio until first use)
 *  - suspended / interrupted context (autoplay policy): resume() is tried,
 *    and a one-time "first user gesture" listener retries it
 *  - strict FIFO playback: concurrent playBuffer() calls are chained
 *  - cleanup: stop() halts the playing track (stop + disconnect) and rejects
 *    every waiting one with an AbortError; dispose() additionally disconnects
 *    the analyser, removes listeners and closes the AudioContext
 */

export const FFT_SIZE = 512;
/** Number of frequency bins an AnalyserNode with FFT_SIZE exposes (256). */
export const FREQUENCY_BIN_COUNT = FFT_SIZE / 2;

export interface PlayOptions {
  /** Called when the track actually starts sounding (after any wait). */
  onStart?: () => void;
}

interface Playback {
  cancel: () => void;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private playChain: Promise<void> = Promise.resolve();
  private currentPlayback: Playback | null = null;
  /** Bumped by stop(); plays queued before the bump are aborted. */
  private epoch = 0;
  /** Rejectors for plays waiting on a suspended context. */
  private waiters = new Set<() => void>();
  private disarmUnlock: (() => void) | null = null;

  /** Reused on every call so a 60fps render loop does not allocate. */
  private readonly frequencyData = new Uint8Array(FREQUENCY_BIN_COUNT);
  private readonly silence = new Uint8Array(FREQUENCY_BIN_COUNT);

  /** Current context state, or "uninitialized" before first use. */
  get state(): AudioContextState | "uninitialized" {
    return this.context ? this.context.state : "uninitialized";
  }

  /** Decodes encoded audio with the shared context (works while suspended). */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data);
  }

  /**
   * Resumes a suspended context. Call it from a click/keypress handler:
   * browsers only allow audio to start after a user gesture.
   */
  resume(): Promise<void> {
    return this.ensureRunning();
  }

  /**
   * Plays a decoded buffer through the analyser and resolves when it ends
   * (source.onended). Calls are queued: a track starts only after the
   * previous one has ended. Rejects with an AbortError if stop()/dispose()
   * is called before or during playback.
   */
  playBuffer(buffer: AudioBuffer, options: PlayOptions = {}): Promise<void> {
    const epoch = this.epoch;
    const run = this.playChain.then(() => this.playNow(buffer, epoch, options));
    this.playChain = run.catch(() => {}); // keep the chain alive after errors
    return run;
  }

  /**
   * Current spectrum, 0–255 per bin, FREQUENCY_BIN_COUNT (256) bins.
   * Returns the SAME array each call (updated in place). Returns silence if
   * nothing has been played; never creates the AudioContext.
   */
  getFrequencyData() {
    if (!this.analyser) return this.silence;
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  /**
   * Stops the track that is playing (source.stop + disconnect) and aborts
   * every track still waiting. Their playBuffer() promises reject with an
   * AbortError. The engine stays usable afterwards.
   */
  stop(): void {
    this.epoch++;
    for (const abort of [...this.waiters]) abort();
    this.currentPlayback?.cancel();
  }

  /**
   * Full teardown: stop(), remove the gesture listeners, disconnect the
   * analyser and close the AudioContext. A later playBuffer()/decode call
   * lazily creates a fresh context, so the engine can be reused.
   */
  dispose(): void {
    this.stop();
    this.disarmUnlock?.();
    this.analyser?.disconnect();
    const context = this.context;
    this.context = null;
    this.analyser = null;
    this.playChain = Promise.resolve();
    if (context && context.state !== "closed") {
      context.close().catch(() => {});
    }
  }

  // ---------------------------------------------------------------------

  private assertCurrent(epoch: number): void {
    if (epoch !== this.epoch) throw createAbortError("Playback was stopped.");
  }

  private async playNow(
    buffer: AudioBuffer,
    epoch: number,
    { onStart }: PlayOptions,
  ): Promise<void> {
    this.assertCurrent(epoch); // stopped while waiting for earlier tracks
    await this.ensureRunning();
    this.assertCurrent(epoch); // stopped while waiting for the context

    const context = this.getContext();
    const analyser = this.getAnalyser();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    return new Promise<void>((resolve, reject) => {
      const release = () => {
        source.onended = null;
        source.disconnect(); // free the node
        if (this.currentPlayback === playback) this.currentPlayback = null;
      };
      const playback: Playback = {
        cancel: () => {
          try {
            source.stop();
          } catch {
            /* already stopped */
          }
          release();
          reject(createAbortError("Playback was stopped."));
        },
      };
      source.onended = () => {
        release();
        resolve();
      };
      this.currentPlayback = playback;
      source.start();
      onStart?.();
    });
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.connect(this.context.destination);
      this.analyser = analyser;
    }
    return this.context;
  }

  private getAnalyser(): AnalyserNode {
    this.getContext();
    return this.analyser!;
  }

  /**
   * Resolves when the context is "running". Covers "suspended" and also
   * "interrupted" (iOS Safari). stop()/dispose() reject the wait.
   */
  private async ensureRunning(): Promise<void> {
    const context = this.getContext();
    if (context.state === "running") return;
    if (context.state === "closed") {
      throw new Error("AudioContext is closed");
    }

    // May stay pending (Chrome) or reject (Safari) until a user gesture.
    context.resume().catch(() => {});
    this.armGestureUnlock();

    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        context.removeEventListener("statechange", onChange);
        this.waiters.delete(abort);
      };
      const onChange = () => {
        if (context.state === "running") {
          cleanup();
          resolve();
        } else if (context.state === "closed") {
          cleanup();
          reject(new Error("AudioContext was closed while waiting to resume"));
        }
      };
      const abort = () => {
        cleanup();
        reject(createAbortError("Playback was stopped."));
      };
      this.waiters.add(abort);
      context.addEventListener("statechange", onChange);
      onChange(); // the state may already have changed
    });
  }

  /** Retries resume() on the first user gesture (autoplay policy). */
  private armGestureUnlock(): void {
    if (this.disarmUnlock || typeof document === "undefined") return;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const disarm = () => {
      events.forEach((name) => document.removeEventListener(name, unlock));
      this.disarmUnlock = null;
    };
    const unlock = () => {
      disarm();
      this.context?.resume().catch(() => {});
    };
    events.forEach((name) => document.addEventListener(name, unlock));
    this.disarmUnlock = disarm;
  }
}

/** Shared instance: the app should have exactly one AudioContext. */
export const audioEngine = new AudioEngine();