import { GAME_NAME } from '../config';
import { dayNumber } from '../lib/daily';

export const DAY_LABEL = (date: string) => `${GAME_NAME} #${dayNumber(date)}`;
