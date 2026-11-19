/** Wheel drawing shared by the game renderer, the wheel editor and thumbnails. Draws centered at (0,0). */
export function drawClassicWheel(g: CanvasRenderingContext2D, r: number): void {
  g.fillStyle = '#1c1c1e'
  g.beginPath()
  g.arc(0, 0, r, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#2f2f33'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.save()
    g.rotate(a)
    g.fillRect(r * 0.8, -r * 0.07, r * 0.2, r * 0.14)
    g.restore()
  }
  g.fillStyle = '#d9dee4'
  g.beginPath()
  g.arc(0, 0, r * 0.56, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#8e99a6'
  g.lineWidth = Math.max(1, r * 0.12)
  g.lineCap = 'round'
  g.beginPath()
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    g.moveTo(Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16)
    g.lineTo(Math.cos(a) * r * 0.48, Math.sin(a) * r * 0.48)
  }
  g.stroke()
  g.fillStyle = '#5c6670'
  g.beginPath()
  g.arc(0, 0, r * 0.17, 0, Math.PI * 2)
  g.fill()
}

/** The vehicle's own (drawn) wheel when there is a sprite for it, otherwise a classic wheel. */
export function drawWheel(g: CanvasRenderingContext2D, r: number, sprite?: CanvasImageSource): void {
  if (sprite) g.drawImage(sprite, -r, -r, r * 2, r * 2)
  else drawClassicWheel(g, r)
}
