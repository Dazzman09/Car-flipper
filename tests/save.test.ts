import { describe, expect, it } from "vitest";
import {
  BACKUP_KEY,
  MAIN_KEY,
  MemoryStorage,
  deserialise,
  exportSave,
  importSave,
  loadGame,
  saveGame,
  serialise,
  type Migration,
} from "@/persistence/save";
import { createGameStore } from "@/store/gameStore";
import { SCHEMA_VERSION } from "@/engine/state";
import { newGame, run } from "./helpers";

describe("saving", () => {
  it("round-trips a game exactly", () => {
    let s = newGame(71);
    s = run(s, { type: "inspect", carId: s.marketplace[0]!, method: "ppi" });
    expect(deserialise(serialise(s))).toEqual(s);
  });

  it("rotates the previous valid save into the backup slot", () => {
    const storage = new MemoryStorage();
    const a = newGame(72);
    saveGame(storage, a);
    const b = run(a, { type: "sideJob" });
    saveGame(storage, b);
    expect(deserialise(storage.getItem(BACKUP_KEY)!)).toEqual(a);
    expect(deserialise(storage.getItem(MAIN_KEY)!)).toEqual(b);
  });

  it("falls back to the backup when the main save is corrupt", () => {
    const storage = new MemoryStorage();
    const a = newGame(73);
    saveGame(storage, a);
    saveGame(storage, run(a, { type: "sideJob" }));
    storage.setItem(MAIN_KEY, storage.getItem(MAIN_KEY)!.slice(0, 200));
    const result = loadGame(storage);
    expect(result.status).toBe("loaded");
    if (result.status === "loaded") {
      expect(result.source).toBe("backup");
      expect(result.state).toEqual(a);
      expect(result.warning).toMatch(/Restored/);
    }
  });

  it("detects tampering through the checksum", () => {
    const s = newGame(74);
    const env = JSON.parse(serialise(s));
    env.state.cash = 999_999_999;
    expect(() => deserialise(JSON.stringify(env))).toThrow(/checksum/);
  });

  it("never overwrites a good backup with a corrupt main save", () => {
    const storage = new MemoryStorage();
    const a = newGame(75);
    saveGame(storage, a);
    saveGame(storage, run(a, { type: "sideJob" }));
    const goodBackup = storage.getItem(BACKUP_KEY);
    storage.setItem(MAIN_KEY, "{broken");
    saveGame(storage, newGame(76));
    expect(storage.getItem(BACKUP_KEY)).toBe(goodBackup);
  });

  it("migrates older save versions step by step", () => {
    const s = newGame(77);
    const legacyState = { ...s, schemaVersion: SCHEMA_VERSION - 1, legacyField: true } as Record<string, unknown>;
    delete legacyState.tutorial;
    const legacy = serialise(legacyState as never);
    const env = JSON.parse(legacy);
    env.schemaVersion = SCHEMA_VERSION - 1;
    const migrations: Record<number, Migration> = {
      [SCHEMA_VERSION - 1]: (old) => {
        const { legacyField: _drop, ...rest } = old;
        return { ...rest, tutorial: { dismissed: false } };
      },
    };
    const migrated = deserialise(JSON.stringify(env), migrations);
    expect(migrated.schemaVersion).toBe(SCHEMA_VERSION);
    expect(migrated.tutorial.dismissed).toBe(false);
    expect(() => deserialise(JSON.stringify(env), {})).toThrow(/No upgrade path/);
  });

  it("rejects saves from a newer version and foreign files", () => {
    const env = JSON.parse(serialise(newGame(78)));
    env.schemaVersion = SCHEMA_VERSION + 1;
    expect(() => deserialise(JSON.stringify(env))).toThrow(/newer version/);
    expect(() => importSave('{"hello":1}')).toThrow(/isn't a Car Flipper Tycoon save/);
    expect(() => importSave("not json")).toThrow(/not valid JSON/);
  });

  it("export/import round-trips", () => {
    const s = newGame(79);
    expect(importSave(exportSave(s))).toEqual(s);
  });
});

describe("store hydration", () => {
  it("does not save before hydration and does not overwrite an existing save", () => {
    const storage = new MemoryStorage();
    const existing = newGame(80);
    saveGame(storage, existing);
    const before = storage.getItem(MAIN_KEY);
    const store = createGameStore(storage);
    // Commands before hydration are ignored rather than applied to an empty game.
    expect(store.getState().send({ type: "advanceDay" })).toBeNull();
    expect(storage.getItem(MAIN_KEY)).toBe(before);
    store.getState().hydrate();
    expect(store.getState().status).toBe("ready");
    expect(store.getState().game).toEqual(existing);
    expect(storage.getItem(MAIN_KEY)).toBe(before);
  });

  it("autosaves after each successful command and not after rejected ones", () => {
    const storage = new MemoryStorage();
    const store = createGameStore(storage);
    store.getState().hydrate();
    expect(store.getState().status).toBe("no-save");
    store.getState().newCareer({ seed: 81 });
    const afterNew = storage.getItem(MAIN_KEY);
    store.getState().send({ type: "buy", carId: store.getState().game!.marketplace[0]! });
    expect(store.getState().error).toMatch(/Agree a price/);
    expect(storage.getItem(MAIN_KEY)).toBe(afterNew);
    store.getState().send({ type: "advanceDay" });
    expect(deserialise(storage.getItem(MAIN_KEY)!).day).toBe(2);
    // A fresh store (a page refresh) resumes exactly where the player left off.
    const reloaded = createGameStore(storage);
    reloaded.getState().hydrate();
    expect(reloaded.getState().game).toEqual(store.getState().game);
  });

  it("recovers from a corrupt save using the backup", () => {
    const storage = new MemoryStorage();
    const store = createGameStore(storage);
    store.getState().hydrate();
    store.getState().newCareer({ seed: 82 });
    store.getState().send({ type: "advanceDay" });
    storage.setItem(MAIN_KEY, "garbage");
    const reloaded = createGameStore(storage);
    reloaded.getState().hydrate();
    expect(reloaded.getState().status).toBe("ready");
    expect(reloaded.getState().notice).toMatch(/Restored/);
  });
});
