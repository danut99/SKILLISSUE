/**
 * AudioWorklet source for the built-in engine, loaded from a Blob URL so it needs no separate build step.
 *
 * It models what an engine actually sounds like: every cylinder fires once per two revolutions, and each
 * firing is a short pressure pulse (a low thump plus a burst of noise). The pulse rate follows the rpm and the
 * pulse strength follows the throttle. Each cylinder fires slightly early or late and slightly stronger or weaker,
 * which gives the lumpy "bum-bu-bum-bum" character instead of a pure tone. `misfire` drops some firings
 * (the burble while coasting). The exhaust resonance and distortion are applied afterwards with regular nodes.
 */
export const ENGINE_PROCESSOR = 'vroombox-engine'

export const ENGINE_WORKLET_SOURCE = `
class EngineProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'rpm', defaultValue: 850, minValue: 300, maxValue: 9000, automationRate: 'k-rate' },
      { name: 'throttle', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'misfire', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ]
  }

  constructor(options) {
    super()
    const o = (options && options.processorOptions) || {}
    this.cylinders = o.cylinders || 4
    this.thump = o.thump || 70
    let seed = o.seed || 7
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
    this.timing = []
    this.power = []
    for (let i = 0; i < this.cylinders; i++) {
      this.timing.push(0.9 + rnd() * 0.2)
      this.power.push(0.8 + rnd() * 0.4)
    }
    this.phase = 0
    this.cyl = 0
    this.env = 0
    this.bodyPhase = 0
    this.lp = 0
    this.rpm = 850
    this.th = 0
    this.alive = true
    this.port.onmessage = () => { this.alive = false }
  }

  process(_inputs, outputs, params) {
    const out = outputs[0][0]
    const targetRpm = params.rpm[0]
    const targetTh = params.throttle[0]
    const misfire = params.misfire[0]
    const decay = Math.exp(-1 / (sampleRate * 0.0035))
    const smooth = 1 - Math.exp(-1 / (sampleRate * 0.03))
    for (let i = 0; i < out.length; i++) {
      this.rpm += (targetRpm - this.rpm) * smooth
      this.th += (targetTh - this.th) * smooth
      const firesPerSecond = (this.rpm / 60) * (this.cylinders / 2)
      this.phase += (firesPerSecond / sampleRate) * this.timing[this.cyl]
      if (this.phase >= 1) {
        this.phase -= 1
        this.cyl = (this.cyl + 1) % this.cylinders
        if (Math.random() >= misfire) {
          this.env = (0.25 + 0.75 * this.th) * this.power[this.cyl] * (0.9 + Math.random() * 0.2)
          this.bodyPhase = 0
        }
      }
      this.env *= decay
      this.bodyPhase += (2 * Math.PI * this.thump) / sampleRate
      const pulse = this.env * (Math.sin(this.bodyPhase) * 0.8 + (Math.random() * 2 - 1) * (0.25 + 0.35 * this.th))
      this.lp += (pulse - this.lp) * 0.35
      out[i] = this.lp
    }
    return this.alive
  }
}
registerProcessor('vroombox-engine', EngineProcessor)
`
