import { create } from 'zustand';
import type { BoardMode } from '../config';
import type { Ranks } from './scoring';

interface UiState {
  toast: { msg: string; id: number } | null;
  ranks: Ranks;
  /** bump to make leaderboards refetch */
  boardVersion: number;
  showToast: (msg: string) => void;
  setRank: (mode: BoardMode, rank: number | null) => void;
  refreshBoards: () => void;
}

export const useUi = create<UiState>((set) => ({
  toast: null,
  ranks: {},
  boardVersion: 0,
  showToast: (msg) => set({ toast: { msg, id: Date.now() } }),
  setRank: (mode, rank) => set((s) => ({ ranks: { ...s.ranks, [mode]: rank } })),
  refreshBoards: () => set((s) => ({ boardVersion: s.boardVersion + 1 })),
}));

export const toast = (msg: string) => useUi.getState().showToast(msg);
