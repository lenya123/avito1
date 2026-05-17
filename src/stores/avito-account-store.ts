import { create } from "zustand";

interface AvitoAccountState {
  activeAccountIndex: number;
  setActiveAccountIndex: (index: number) => void;
}

export const useAvitoAccountStore = create<AvitoAccountState>()((set) => ({
  activeAccountIndex: 1,
  setActiveAccountIndex: (index) => set({ activeAccountIndex: index }),
}));

export const useActiveAccountIndex = () =>
  useAvitoAccountStore((state) => state.activeAccountIndex);
