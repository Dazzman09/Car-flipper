import { createStore, type StoreApi } from "zustand/vanilla";
import { dispatch, type Command, type CommandResult } from "@/engine/commands";
import { createNewGame } from "@/engine/newGame";
import type { ImagePolicy } from "@/engine/catalogue/images";
import type { GameEvent, GameState } from "@/engine/state";
import { clearSaves, importSave, loadGame, saveGame, type StorageLike } from "@/persistence/save";

export type StoreStatus = "loading" | "ready" | "no-save" | "error";

export interface GameStore {
  status: StoreStatus;
  game: GameState | null;
  /** Events produced by the most recent command, for toasts and day summaries. */
  lastEvents: GameEvent[];
  lastCommand: Command["type"] | null;
  error: string | null;
  notice: string | null;
  persistent: boolean;
  hydrate(): void;
  newCareer(options?: { seed?: number; imagePolicy?: ImagePolicy }): void;
  send(cmd: Command): CommandResult | null;
  importText(text: string): { ok: true } | { ok: false; error: string };
  abandonCareer(): void;
  clearError(): void;
  clearNotice(): void;
}

/**
 * The store holds the current game and forwards commands to the engine. It
 * never saves before hydration has finished, so an empty initial state can
 * never overwrite an existing save.
 */
export function createGameStore(storage: StorageLike, persistent = true, defaultPolicy: ImagePolicy = "allow-pending"): StoreApi<GameStore> {
  return createStore<GameStore>((set, get) => {
    const persist = (game: GameState) => {
      try {
        saveGame(storage, game);
      } catch (err) {
        set({ notice: `Couldn't save: ${(err as Error).message}` });
      }
    };

    return {
      status: "loading",
      game: null,
      lastEvents: [],
      lastCommand: null,
      error: null,
      notice: persistent ? null : "Browser storage is unavailable, so progress won't be saved when you close this tab.",
      persistent,

      hydrate() {
        if (get().status !== "loading") return;
        const result = loadGame(storage);
        if (result.status === "loaded") {
          set({ status: "ready", game: result.state, notice: result.warning ?? get().notice });
          if (result.source === "backup") persist(result.state);
        } else if (result.status === "empty") {
          set({ status: "no-save" });
        } else {
          set({ status: "error", error: result.error });
        }
      },

      newCareer(options) {
        const game = createNewGame({ imagePolicy: defaultPolicy, ...options });
        set({ status: "ready", game, lastEvents: game.events.slice(-1), lastCommand: null, error: null });
        persist(game);
      },

      send(cmd) {
        const { game, status } = get();
        if (status !== "ready" || !game) return null;
        const result = dispatch(game, cmd);
        if (result.ok) {
          set({ game: result.state, lastEvents: result.events, lastCommand: cmd.type, error: null });
          persist(result.state);
        } else {
          set({ error: result.error });
        }
        return result;
      },

      importText(text) {
        try {
          const game = importSave(text);
          set({ status: "ready", game, lastEvents: [], error: null, notice: "Save imported." });
          persist(game);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },

      abandonCareer() {
        clearSaves(storage);
        set({ status: "no-save", game: null, lastEvents: [], error: null });
      },

      clearError() {
        set({ error: null });
      },
      clearNotice() {
        set({ notice: null });
      },
    };
  });
}
