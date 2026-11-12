import { useState } from 'react';
import { LAUNCH_DATE, MODE_INFO } from '../config';
import { brakeParams } from '../games/brakeGame';
import { dailyShape } from '../games/cutGame';
import { addDays, dayNumber } from '../lib/daily';
import { dailyDrawShape, DRAW_SHAPES, shapeRadius } from '../lib/drawShapes';
import { pixelArtUrl } from '../lib/pixelAssets';
import { PixelIcon } from './PixelIcon';
import { BRAKE_GOALS } from '../lib/brakeChallenge';

function drawingOutline(shape: typeof DRAW_SHAPES[number]) {
  return Array.from({ length: 181 }, (_, index) => {
    const angle = index / 180 * 2 * Math.PI;
    const radius = shapeRadius(shape, angle) * 108;
    return `${160 + Math.cos(angle) * radius},${130 + Math.sin(angle) * radius}`;
  }).join(' ');
}

export function ChallengesPage({ today }: { today: string }) {
  const [date, setDate] = useState(today);
  const shape = dailyDrawShape(date);
  const cut = dailyShape(date);
  const drive = brakeParams(date);
  const road = { dry: 'Dry asphalt', wet: 'Wet road', ice: 'Black ice' }[drive.road.id];
  const cutPoints = cut.poly.map(point => `${point.x},${point.y}`).join(' ');

  return <section className="screen challenges-page">
    <header className="challenge-heading">
      <h1>Daily challenges</h1>
      <p>Browse the targets for any date. Everyone gets the same challenges at 00:00 UTC.</p>
    </header>
    <div className="challenge-date-controls">
      <button className="btn btn-ghost" aria-label="Previous day" disabled={date <= LAUNCH_DATE} onClick={() => setDate(addDays(date, -1))}>←</button>
      <label>Challenge date<input type="date" min={LAUNCH_DATE} max="9999-12-30" value={date} onChange={event => {
        const value = event.target.value;
        if (/^\d{4}-\d{2}-\d{2}$/.test(value) && value >= LAUNCH_DATE && value <= '9999-12-30') setDate(value);
      }} /></label>
      <button className="btn btn-ghost" aria-label="Next day" disabled={date >= '9999-12-30'} onClick={() => setDate(addDays(date, 1))}>→</button>
      <button className="btn btn-ghost" onClick={() => setDate(today)}>today</button>
    </div>
    <p className="challenge-date-note">Day {dayNumber(date)} · {date === today ? "Today's challenges" : date < today ? 'Past challenges' : 'Upcoming challenges'} · Preview</p>
    <div className="challenge-previews">
      <article className="card px-box challenge-preview">
        <h2><PixelIcon name="draw" size={36} />{MODE_INFO.draw.title}</h2>
        <svg viewBox="0 0 320 260" role="img" aria-label={`${shape} drawing target`}>
          <polygon points={drawingOutline(shape)} fill="none" stroke="var(--cyan)" strokeWidth="4" />
          <rect x="157" y="127" width="6" height="6" fill="var(--text)" />
        </svg>
        <h3>{shape}</h3><p>Draw the outline in one closed stroke around the dot.</p>
      </article>
      <article className="card px-box challenge-preview">
        <h2><PixelIcon name="cut" size={36} />{MODE_INFO.cut.title}</h2>
        <svg viewBox="0 160 360 360" role="img" aria-label="Daily polygon to split into equal halves" className="challenge-cut-preview">
          <polygon points={cutPoints} fill={`hsl(${cut.hue} 90% 66%)`} stroke={`hsl(${cut.hue} 70% 30%)`} strokeWidth="4" />
        </svg>
        <h3>50 / 50</h3><p>One straight cut. Two equal areas. A new shape every day.</p>
      </article>
      <article className="card px-box challenge-preview">
        <h2><PixelIcon name="brake" size={36} />{MODE_INFO.brake.title}</h2>
        <div className={`challenge-road ${drive.road.id} ${drive.objective}`} role="img" aria-label={`${road}, ${drive.kmh} kilometers per hour, ${BRAKE_GOALS[drive.objective].target.toLowerCase()} ${drive.D.toFixed(1)} meters ahead`}>
          <div className={`challenge-target ${drive.objective}`} />
          <img src={pixelArtUrl('car-top-pink.png')} width="60" height="100" alt="" />
        </div>
        <h3>{BRAKE_GOALS[drive.objective].title}</h3><p>{road} · {drive.kmh} km/h</p><p>{BRAKE_GOALS[drive.objective].instruction} Target {drive.D.toFixed(1)} m ahead.</p>
      </article>
    </div>
    <div className="challenge-shape-cycle">
      <h2>Drawing rotation</h2>
      <p>A five-day cycle. Choose a shape to see its next date.</p>
      <div>{DRAW_SHAPES.map(target => {
        const offset = (DRAW_SHAPES.indexOf(target) - DRAW_SHAPES.indexOf(shape) + DRAW_SHAPES.length) % DRAW_SHAPES.length;
        return <button key={target} className={`btn ${target === shape ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={target === shape} onClick={() => setDate(addDays(date, offset))}>{target}</button>;
      })}</div>
    </div>
    <a className="btn btn-primary" href="#">play today's challenges</a>
  </section>;
}
