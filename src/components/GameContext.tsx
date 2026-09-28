"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { ImagePolicy } from "@/engine/catalogue/images";
import { MemoryStorage, browserStorage } from "@/persistence/save";
import { createGameStore, type GameStore } from "@/store/gameStore";

const GameStoreContext = createContext<StoreApi<GameStore> | null>(null);

const IMAGE_POLICY: ImagePolicy = process.env.NEXT_PUBLIC_IMAGE_POLICY === "verified-only" ? "verified-only" : "allow-pending";

/**
 * Client boundary for the game. The store is created once per page load and
 * hydrated from localStorage after mount, so server rendering never touches
 * browser APIs and a save is never overwritten before it has been read.
 */
export function GameProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => {
    // On the server a throwaway in-memory store renders the loading state only.
    const { storage, persistent } = typeof window === "undefined" ? { storage: new MemoryStorage(), persistent: true } : browserStorage();
    return createGameStore(storage, persistent, IMAGE_POLICY);
  });
  useEffect(() => {
    store.getState().hydrate();
  }, [store]);
  return <GameStoreContext.Provider value={store}>{children}</GameStoreContext.Provider>;
}

export function useGame<T>(selector: (s: GameStore) => T): T {
  const store = useContext(GameStoreContext);
  if (!store) throw new Error("useGame must be used inside GameProvider");
  return useStore(store, selector);
}
