/**
 * Web Audio engine – Task 2.3.
 *
 * Owns the single AudioContext and the AnalyserNode, plays decoded buffers
 * one at a time, and exposes frequency data for the visualizer.
 *
 * Graph:  AudioBufferSourceNode -> AnalyserNode (fftSize 512) -> destination
 *
 * Handled here:
 *  - lazy context creation (nothing touches Web Audio until first use)
 *  - suspended / interrupted context (autoplay policy): resume() is tried,
 *    and a one-time "first user gesture" listener retries it, so playback
 *    starts as soon as the browser allows instead of hanging silently
 *  - strict FIFO playback: concurrent playBuffer() calls are chained, so a
 *    track never starts before the previous one has ended
 *  - per-track node cleanup: the source is disconnected in onended
 *
 * NOT implemented yet (Task 2.4): stop/cancel of the playing or waiting
 * tracks, full dispose(), and the requestAnimationFrame visualizer.
 */

export const FFT_SIZE = 512;
/** Number of frequency bins an AnalyserNode with FFT_SIZE exposes (256). */
export const FREQUENCY_BIN_COUNT = FFT_SIZE / 2;

export class AudioEngine {
  private context: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private unlockArmed = false;
  private playChain: Promise<void> = Promise.resolve();

  /** Reused on every call so a 60fps render loop does not allocate. */
  private readonly frequencyData = new Uint8Array(FREQUENCY_BIN_COUNT);
  private readonly silence = new Uint8Array(FREQUENCY_BIN_COUNT);

  /** Current context state, or "uninitialized" before first use. */
  get state(): AudioContextState | "uninitialized" {
    return this.context ? this.context.state : "uninitialized";
  }

  /**
   * Decodes encoded audio (mp3/wav/…) with the shared context. Decoding works
   * while the context is suspended, so loading never waits for a gesture.
   */
  decodeAudioData(data: ArrayBuffer): Promise<AudioBuffer> {
    return this.getContext().decodeAudioData(data);
  }

  /**
   * Resumes a suspended context. Call it from a click/keypress handler (for
   * example the Play button) – browsers only allow audio to start after a
   * user gesture. Resolves once the context is running.
   */
  resume(): Promise<void> {
    return this.ensureRunning();
  }

  /**
   * Plays a decoded buffer through the analyser and resolves when it ends
   * (source.onended). Calls are queued: if a track is already playing, this
   * one starts only after it has ended. A failure in one track does not
   * block the tracks queued behind it.
   */
  playBuffer(buffer: AudioBuffer): Promise<void> {
    const run = this.playChain.then(() => this.playNow(buffer));
    this.playChain = run.catch(() => {}); // keep the chain alive after errors
    return run;
  }

  /**
   * Current spectrum, 0–255 per bin, FREQUENCY_BIN_COUNT (256) bins.
   * Returns the SAME array each call (updated in place) – copy it if you need
   * to keep a snapshot. Returns silence if nothing has been played yet; it
   * never creates the AudioContext, so calling it every frame is safe.
   */
  getFrequencyData() {
    if (!this.analyser) return this.silence;
    this.analyser.getByteFrequencyData(this.frequencyData);
    return this.frequencyData;
  }

  // ---------------------------------------------------------------------

  private async playNow(buffer: AudioBuffer): Promise<void> {
    await this.ensureRunning();
    const context = this.getContext();
    const analyser = this.getAnalyser();

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(analyser);

    return new Promise<void>((resolve) => {
      source.onended = () => {
        source.onended = null;
        source.disconnect(); // release the node as soon as it finishes
        resolve();
      };
      source.start();
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
   * "interrupted" (iOS Safari), which is why it checks for anything that is
   * not running/closed rather than only "suspended".
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
      const onChange = () => {
        if (context.state === "running") {
          context.removeEventListener("statechange", onChange);
          resolve();
        } else if (context.state === "closed") {
          context.removeEventListener("statechange", onChange);
          reject(new Error("AudioContext was closed while waiting to resume"));
        }
      };
      context.addEventListener("statechange", onChange);
      onChange(); // the state may already have changed
    });
  }

  /** Retries resume() on the first user gesture (autoplay policy). */
  private armGestureUnlock(): void {
    if (this.unlockArmed || typeof document === "undefined") return;
    this.unlockArmed = true;
    const events = ["pointerdown", "keydown", "touchend"] as const;
    const unlock = () => {
      events.forEach((name) => document.removeEventListener(name, unlock));
      this.unlockArmed = false;
      this.getContext().resume().catch(() => {});
    };
    events.forEach((name) => document.addEventListener(name, unlock));
  }
}

/** Shared instance: the app should have exactly one AudioContext. */
export const audioEngine = new AudioEngine();
