import { useEffect, useState } from 'react';
import { timeToNextDay } from '../lib/daily';

export function Countdown() {
  const [t, setT] = useState(timeToNextDay());
  useEffect(() => {
    const id = setInterval(() => setT(timeToNextDay()), 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="countdown">{t}</span>;
}
