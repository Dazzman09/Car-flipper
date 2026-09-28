"use client";

import { useEffect, useState } from "react";
import { CONFIG } from "@/engine/config";
import type { GameEvent } from "@/engine/state";
import { useGame } from "./GameContext";
import { GarageView } from "./views/GarageView";
import { HistoryView } from "./views/HistoryView";
import { ListingView } from "./views/ListingView";
import { MarketView } from "./views/MarketView";
import { OwnedCarView } from "./views/OwnedCarView";
import { SettingsView } from "./views/SettingsView";
import { Button, Modal, Money, ProgressDots } from "./ui";

export type Route =
  | { view: "garage" }
  | { view: "market" }
  | { view: "listing"; carId: string }
  | { view: "owned"; carId: string }
  | { view: "history" }
  | { view: "settings" };

export type Navigate = (route: Route) => void;

const TABS: { view: Route["view"]; label: string; icon: string }[] = [
  { view: "garage", label: "Garage", icon: "🏠" },
  { view: "market", label: "Market", icon: "🔎" },
  { view: "history", label: "Books", icon: "📒" },
  { view: "settings", label: "Settings", icon: "⚙️" },
];

export function Shell() {
  const game = useGame((s) => s.game)!;
  const send = useGame((s) => s.send);
  const error = useGame((s) => s.error);
  const clearError = useGame((s) => s.clearError);
  const notice = useGame((s) => s.notice);
  const clearNotice = useGame((s) => s.clearNotice);
  const lastEvents = useGame((s) => s.lastEvents);
  const lastCommand = useGame((s) => s.lastCommand);
  const [route, setRoute] = useState<Route>({ view: "garage" });
  const [summary, setSummary] = useState<GameEvent[] | null>(null);
  const [toasts, setToasts] = useState<GameEvent[]>([]);

  const navigate: Navigate = (r) => {
    setRoute(r);
    clearError();
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    if (lastEvents.length === 0) return;
    if (lastCommand === "advanceDay") {
      setSummary(lastEvents);
      return;
    }
    setToasts((t) => [...t, ...lastEvents].slice(-3));
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => !lastEvents.includes(x))), 5000);
    return () => clearTimeout(timer);
  }, [lastEvents, lastCommand]);

  // Keep routes valid when a car leaves the market or changes hands.
  const car = "carId" in route ? game.cars[route.carId] : undefined;
  let view = route;
  if (route.view === "listing" && car?.status === "owned") view = { view: "owned", carId: route.carId };
  if (route.view === "owned" && car?.status === "sold") view = { view: "garage" };

  return (
    <div className="min-h-dvh pb-24 sm:pb-8">
      <header className="sticky top-0 z-30 bg-ink text-white shadow-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-bold" data-testid="day">
                Day {game.day}
              </span>
              <ProgressDots total={CONFIG.actionPointsPerDay} filled={game.actionPoints} label={`${game.actionPoints} action points left`} />
            </div>
            <div className="text-lg font-black leading-tight" data-testid="cash">
              <span key={game.cash} className="animate-cash">
                <Money cents={game.cash} />
              </span>
            </div>
          </div>
          <nav className="hidden gap-1 sm:flex">
            {TABS.map((t) => (
              <button
                key={t.view}
                onClick={() => navigate({ view: t.view } as Route)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${view.view === t.view ? "bg-white/15" : "text-white/70 hover:text-white"}`}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <Button
            variant="secondary"
            size="sm"
            className="!border-accent !bg-accent !text-ink"
            onClick={() => send({ type: "advanceDay" })}
            data-testid="next-day"
          >
            Next day →
          </Button>
        </div>
      </header>

      {notice && (
        <div className="mx-auto mt-3 max-w-3xl px-4">
          <div className="flex items-start justify-between gap-3 rounded-lg bg-info/10 px-3 py-2 text-sm text-info">
            <span>{notice}</span>
            <button onClick={clearNotice} aria-label="Dismiss" className="font-bold">
              ×
            </button>
          </div>
        </div>
      )}
      {error && (
        <div className="mx-auto mt-3 max-w-3xl px-4" role="alert" data-testid="error">
          <div className="flex items-start justify-between gap-3 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
            <span>{error}</span>
            <button onClick={clearError} aria-label="Dismiss" className="font-bold">
              ×
            </button>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-3xl px-4 py-4">
        {view.view === "garage" && <GarageView navigate={navigate} />}
        {view.view === "market" && <MarketView navigate={navigate} />}
        {view.view === "listing" && <ListingView carId={view.carId} navigate={navigate} />}
        {view.view === "owned" && <OwnedCarView carId={view.carId} navigate={navigate} />}
        {view.view === "history" && <HistoryView />}
        {view.view === "settings" && <SettingsView />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur sm:hidden" aria-label="Main">
        <div className="mx-auto grid max-w-3xl grid-cols-4">
          {TABS.map((t) => {
            const active = view.view === t.view || (t.view === "market" && view.view === "listing") || (t.view === "garage" && view.view === "owned");
            return (
              <button
                key={t.view}
                onClick={() => navigate({ view: t.view } as Route)}
                className={`flex flex-col items-center gap-0.5 py-2 text-xs font-semibold ${active ? "text-ink" : "text-muted"}`}
                data-testid={`tab-${t.view}`}
              >
                <span aria-hidden className="text-lg leading-none">
                  {t.icon}
                </span>
                {t.label}
              </button>
            );
          })}
        </div>
      </nav>

      <div className="pointer-events-none fixed inset-x-0 top-16 z-40 flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-pop max-w-md rounded-lg px-3 py-2 text-sm shadow-lg ${
              t.tone === "good" ? "bg-good text-white" : t.tone === "bad" ? "bg-bad text-white" : "bg-ink text-white"
            }`}
            data-testid="toast"
          >
            {t.text}
          </div>
        ))}
      </div>

      <Modal
        open={summary !== null}
        onClose={() => setSummary(null)}
        title={`Day ${game.day}`}
        footer={
          <Button onClick={() => setSummary(null)} data-testid="close-summary">
            Let&apos;s go
          </Button>
        }
      >
        <ul className="space-y-2 text-sm" data-testid="day-summary">
          {(summary ?? []).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span aria-hidden>{e.tone === "good" ? "✅" : e.tone === "bad" ? "⚠️" : "•"}</span>
              <span>{e.text}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}
