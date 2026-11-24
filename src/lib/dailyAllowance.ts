import { create } from 'zustand';
import { BASE_TRIES, ACCOUNT_EXTRA_TRIES } from '../config';

// Session-only: linking changes the allowance, never the recorded attempts.
export const useDailyAllowance = create<{ linked: boolean }>(() => ({ linked: false }));
export const dailyTryLimit = () => BASE_TRIES + (useDailyAllowance.getState().linked ? ACCOUNT_EXTRA_TRIES : 0);
