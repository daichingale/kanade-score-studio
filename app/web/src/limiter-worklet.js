/* Stereo-linked sample-peak limiter. Delay both channels by the same amount,
   so peaks in either channel can turn the shared gain down before they pass. */
class PeakLimiter {
  constructor(rate) {
    this.delay = Math.max(1, Math.round(rate * .004));
    this.left = new Float32Array(this.delay);
    this.right = new Float32Array(this.delay);
    this.release = 1 - Math.exp(-1 / (.08 * rate));
    this.gain = 1;
    this.position = 0;
    this.hold = 0;
    this.peak = 0;
    this.reduction = 0;
  }

  process(left, right, outL, outR, ceilings, limits) {
    for (let i = 0; i < outL.length; i++) {
      const l = left?.[i] ?? 0, r = right?.[i] ?? l;
      const ceiling = ceilings[ceilings.length === 1 ? 0 : i];
      const enabled = limits[limits.length === 1 ? 0 : i];
      const peak = Math.max(Math.abs(l), Math.abs(r));
      const target = peak > ceiling ? ceiling / peak : 1;
      if (target < 1 && target <= this.gain) {
        this.gain = target;
        this.hold = this.delay;
      } else if (this.hold > 0) {
        this.hold--;
      } else {
        this.gain += (1 - this.gain) * this.release;
      }

      const pos = this.position;
      const delayedL = this.left[pos], delayedR = this.right[pos];
      const delayedPeak = Math.max(Math.abs(delayedL), Math.abs(delayedR));
      // Also check the delayed frame in case the user lowers the ceiling mid-note.
      const gain = Math.min(this.gain, delayedPeak > ceiling ? ceiling / delayedPeak : 1);
      const applied = 1 - enabled * (1 - gain);
      outL[i] = delayedL * applied;
      outR[i] = delayedR * applied;
      this.peak = Math.max(this.peak, Math.abs(outL[i]), Math.abs(outR[i]));
      if (applied < 1 && delayedPeak > .00001) this.reduction = Math.max(this.reduction, -20 * Math.log10(applied));
      this.left[pos] = l;
      this.right[pos] = r;
      this.position = (pos + 1) % this.delay;
    }
  }
}

if (typeof registerProcessor === 'function') {
  class KanadeLimiter extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [
        {name:'ceiling', defaultValue:10**(-1/20), minValue:.25, maxValue:1},
        {name:'enabled', defaultValue:1, minValue:0, maxValue:1},
      ];
    }

    constructor() {
      super();
      this.limiter = new PeakLimiter(sampleRate);
      this.elapsed = 0;
      this.wasActive = false;
    }

    process([input], [output], {ceiling,enabled}) {
      this.limiter.process(input?.[0],input?.[1],output[0],output[1],ceiling,enabled);
      this.elapsed += output[0].length;
      if (this.elapsed >= sampleRate / 20) {
        const {peak,reduction} = this.limiter;
        const active = peak > .00001;
        if (active || this.wasActive) this.port.postMessage({peak,reduction});
        this.wasActive = active;
        this.elapsed = 0;
        this.limiter.peak = this.limiter.reduction = 0;
      }
      return true;
    }
  }
  registerProcessor('kanade-peak-limiter',KanadeLimiter);
}
if (typeof window === 'object') window.KanadePeakLimiter = PeakLimiter;
if (typeof module === 'object' && module.exports) module.exports = {PeakLimiter};
