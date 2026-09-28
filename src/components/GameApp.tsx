"use client";

import { useRef, useState } from "react";
import { GameProvider, useGame } from "./GameContext";
import { Shell } from "./Shell";
import { Button, Card } from "./ui";

export function GameApp() {
  return (
    <GameProvider>
      <Router />
    </GameProvider>
  );
}

function Router() {
  const status = useGame((s) => s.status);
  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-sm text-muted" data-testid="loading">
        Loading your garage…
      </div>
    );
  }
  if (status === "ready") return <Shell />;
  return <Welcome />;
}

/** `?seed=123` starts a reproducible career (useful for sharing and testing). */
function seedFromUrl(): { seed: number } | undefined {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const seed = raw === null ? NaN : Number(raw);
  return Number.isSafeInteger(seed) && seed >= 0 ? { seed: seed >>> 0 } : undefined;
}

function Welcome() {
  const status = useGame((s) => s.status);
  const error = useGame((s) => s.error);
  const newCareer = useGame((s) => s.newCareer);
  const importText = useGame((s) => s.importText);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const result = importText(await file.text());
    if (!result.ok) setImportError(result.error);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-accent-strong">Car Flipper Tycoon</div>
        <h1 className="mt-2 text-3xl font-black leading-tight">Buy smart. Fix right. Sell honest.</h1>
        <p className="mt-3 text-ink-soft">
          You have $15,000, a two-car garage and a phone full of listings. Inspect before you buy, haggle with sellers, fix what&apos;s worth
          fixing, and sell to buyers who will check your work.
        </p>
      </div>
      {status === "error" && (
        <Card className="border-bad/30 bg-bad/5 text-sm">
          <strong className="text-bad">Your save couldn&apos;t be loaded.</strong> {error} You can import an exported save or start a new career.
        </Card>
      )}
      <div className="flex flex-col gap-2">
        <Button onClick={() => newCareer(seedFromUrl())} data-testid="new-career">
          Start a new career
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Import a save file
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        {importError && <p className="text-sm text-bad">{importError}</p>}
      </div>
      <p className="text-xs text-muted">Progress saves automatically in this browser. Export a backup from Settings at any time.</p>
    </main>
  );
}
