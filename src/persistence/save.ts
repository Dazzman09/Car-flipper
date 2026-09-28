import { hashString } from "@/engine/rng";
import { GameStateSchema, SCHEMA_VERSION, type GameState } from "@/engine/state";

/**
 * Local save system.
 *
 *  - Main slot: the latest state, written after every successful command.
 *  - Backup slot: the previous main save, rotated in only if it is valid.
 *  - Every save is wrapped in an envelope with a version and checksum and is
 *    schema-validated on load. A corrupt main save falls back to the backup.
 *  - Older schema versions are upgraded step by step through MIGRATIONS.
 */

export const SAVE_FORMAT = "car-flipper-tycoon-save";
export const MAIN_KEY = "cft:save:main";
export const BACKUP_KEY = "cft:save:backup";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SaveEnvelope {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  savedAt: string;
  checksum: string;
  state: unknown;
}

/** Upgrade functions keyed by the version they upgrade FROM. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;
export const MIGRATIONS: Record<number, Migration> = {};

export type LoadResult =
  | { status: "loaded"; state: GameState; source: "main" | "backup"; warning: string | null }
  | { status: "empty" }
  | { status: "corrupt"; error: string };

function checksum(state: unknown): string {
  return hashString(JSON.stringify(state)).toString(16);
}

export function serialise(state: GameState, now: Date = new Date()): string {
  const envelope: SaveEnvelope = {
    format: SAVE_FORMAT,
    schemaVersion: state.schemaVersion,
    savedAt: now.toISOString(),
    checksum: checksum(state),
    state,
  };
  return JSON.stringify(envelope);
}

/** Parse, verify, migrate and validate a save string. Throws with a readable message on failure. */
export function deserialise(raw: string, migrations: Record<number, Migration> = MIGRATIONS): GameState {
  let envelope: SaveEnvelope;
  try {
    envelope = JSON.parse(raw) as SaveEnvelope;
  } catch {
    throw new Error("The save file is not valid JSON.");
  }
  if (!envelope || typeof envelope !== "object" || envelope.format !== SAVE_FORMAT) {
    throw new Error("This isn't a Car Flipper Tycoon save file.");
  }
  if (typeof envelope.schemaVersion !== "number") throw new Error("The save file has no version.");
  if (envelope.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`This save is from a newer version of the game (v${envelope.schemaVersion}).`);
  }
  if (checksum(envelope.state) !== envelope.checksum) throw new Error("The save file is damaged (checksum mismatch).");

  let state = envelope.state as Record<string, unknown>;
  for (let v = envelope.schemaVersion; v < SCHEMA_VERSION; v++) {
    const migrate = migrations[v];
    if (!migrate) throw new Error(`No upgrade path from save version ${v}.`);
    state = { ...migrate(state), schemaVersion: v + 1 };
  }
  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`The save file failed validation${issue ? ` at ${issue.path.join(".")}: ${issue.message}` : ""}.`);
  }
  return parsed.data;
}

export function loadGame(storage: StorageLike, migrations: Record<number, Migration> = MIGRATIONS): LoadResult {
  const main = storage.getItem(MAIN_KEY);
  const backup = storage.getItem(BACKUP_KEY);
  if (main === null && backup === null) return { status: "empty" };
  let mainError: string | null = null;
  if (main !== null) {
    try {
      return { status: "loaded", state: deserialise(main, migrations), source: "main", warning: null };
    } catch (err) {
      mainError = (err as Error).message;
    }
  }
  if (backup !== null) {
    try {
      const state = deserialise(backup, migrations);
      return {
        status: "loaded",
        state,
        source: "backup",
        warning: `Your latest save couldn't be read (${mainError ?? "missing"}). Restored the previous save instead.`,
      };
    } catch {
      /* fall through */
    }
  }
  return { status: "corrupt", error: mainError ?? "The save could not be read." };
}

/**
 * Write the state to the main slot, first rotating the existing main save to
 * the backup slot if (and only if) it is itself valid.
 */
export function saveGame(storage: StorageLike, state: GameState, now: Date = new Date()): void {
  const data = serialise(state, now);
  const previous = storage.getItem(MAIN_KEY);
  if (previous !== null && previous !== data) {
    try {
      deserialise(previous);
      storage.setItem(BACKUP_KEY, previous);
    } catch {
      /* never overwrite a good backup with a bad main save */
    }
  }
  storage.setItem(MAIN_KEY, data);
}

export function clearSaves(storage: StorageLike): void {
  storage.removeItem(MAIN_KEY);
  storage.removeItem(BACKUP_KEY);
}

/** Pretty-printed export for the player to keep. */
export function exportSave(state: GameState, now: Date = new Date()): string {
  return JSON.stringify(JSON.parse(serialise(state, now)), null, 2);
}

/** Validate an imported file without touching storage. */
export function importSave(text: string): GameState {
  return deserialise(text.trim());
}

/** In-memory storage for tests and for browsers where localStorage is unavailable. */
export class MemoryStorage implements StorageLike {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

/** localStorage if usable, otherwise an in-memory fallback. */
export function browserStorage(): { storage: StorageLike; persistent: boolean } {
  try {
    const ls = window.localStorage;
    const probe = "cft:probe";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return { storage: ls, persistent: true };
  } catch {
    return { storage: new MemoryStorage(), persistent: false };
  }
}
