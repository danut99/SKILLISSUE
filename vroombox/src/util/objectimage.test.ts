import { describe, expect, it } from 'vitest'
import { MIN_WHEEL_RADIUS, VEHICLE_LENGTH } from '../game/config.ts'
import { fitWheels } from './objectimage.ts'

describe('fitWheels', () => {
  const body = { x: 100, y: 100, w: 600, h: 200 }

  it('frames the vehicle with wheels that stick out of the drawing', () => {
    const { frame } = fitWheels(body, [
      { x: 150, y: 300, r: 80 },
      { x: 650, y: 300, r: 80 },
    ])
    expect(frame).toEqual({ x: 70, y: 100, w: 660, h: 280 })
  })

  it('keeps normal wheels as placed and grows tiny ones to the size the physics uses', () => {
    const { frame, wheels } = fitWheels(body, [
      { x: 200, y: 290, r: 60 },
      { x: 600, y: 300, r: 5 },
    ])
    const min = (Math.max(frame!.w, frame!.h) * MIN_WHEEL_RADIUS) / VEHICLE_LENGTH
    expect(wheels[0].r).toBe(60)
    expect(wheels[1].r).toBeCloseTo(min, 6)
    expect(wheels[1]).toMatchObject({ x: 600, y: 300 })
  })

  it('has no frame for an empty drawing without wheels', () => {
    expect(fitWheels(null, [])).toEqual({ frame: null, wheels: [] })
  })
})
