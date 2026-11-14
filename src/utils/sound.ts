class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('dg_muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    try {
      localStorage.setItem('dg_muted', next ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType = 'sine', delay = 0, gainVal = 0.08) {
    const ctx = this.getCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainVal, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playCorrectGuess() {
    this.tone(523.25, 0.14, 'triangle', 0, 0.1);
    this.tone(659.25, 0.14, 'triangle', 0.07, 0.1);
    this.tone(783.99, 0.24, 'triangle', 0.14, 0.11);
  }

  public playCloseGuess() {
    this.tone(440, 0.1, 'sine', 0, 0.06);
    this.tone(493.88, 0.12, 'sine', 0.08, 0.06);
  }

  public playHintReveal() {
    this.tone(698.46, 0.12, 'sine', 0, 0.07);
    this.tone(880, 0.18, 'sine', 0.08, 0.07);
  }

  public playTick() {
    this.tone(880, 0.045, 'square', 0, 0.025);
  }

  public playRoundStart() {
    this.tone(392, 0.1, 'triangle', 0, 0.07);
    this.tone(523.25, 0.16, 'triangle', 0.08, 0.08);
  }

  public playVictory() {
    this.tone(523.25, 0.15, 'triangle', 0, 0.1);
    this.tone(659.25, 0.15, 'triangle', 0.1, 0.1);
    this.tone(783.99, 0.15, 'triangle', 0.2, 0.1);
    this.tone(1046.5, 0.35, 'triangle', 0.3, 0.12);
  }

  public playPop() {
    this.tone(600, 0.05, 'sine', 0, 0.045);
  }
}

export const soundFX = new SoundEngine();
