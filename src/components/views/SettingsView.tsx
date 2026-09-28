"use client";

import { useRef, useState } from "react";
import { IMAGE_SETS, isImageVerified } from "@/engine/catalogue/images";
import { getVariant } from "@/engine/catalogue/variants";
import { exportSave } from "@/persistence/save";
import { useGame } from "../GameContext";
import { Badge, Button, Card, Modal, SectionTitle } from "../ui";

export function SettingsView() {
  const game = useGame((s) => s.game)!;
  const importText = useGame((s) => s.importText);
  const abandonCareer = useGame((s) => s.abandonCareer);
  const persistent = useGame((s) => s.persistent);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const blob = new Blob([exportSave(game)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `car-flipper-day-${game.day}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const result = importText(await file.text());
    setMessage(result.ok ? "Save imported." : result.error);
  };

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle>Save</SectionTitle>
        <p className="text-sm text-ink-soft">
          {persistent
            ? "Your career saves automatically in this browser after every action, with a backup of the previous save."
            : "This browser is blocking storage, so progress will be lost when the tab closes. Export a save to keep it."}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={download} data-testid="export-save">
            Export save
          </Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Import save
          </Button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file" />
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            Start over
          </Button>
        </div>
        {message && <p className="mt-2 text-sm">{message}</p>}
      </Card>

      <Card>
        <SectionTitle>Vehicle images</SectionTitle>
        <p className="mb-3 text-sm text-ink-soft">
          Every car shown uses an image set matched to its make, model, generation, facelift, body style, trim, colour and model year. Until a photograph has
          been verified, a labelled illustration drawn from the same configuration is shown instead.
        </p>
        <ul className="divide-y divide-line text-sm">
          {IMAGE_SETS.map((set) => {
            const v = getVariant(set.variantId);
            const verified = set.images.filter(isImageVerified);
            return (
              <li key={set.id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <div className="font-medium">
                    {v.make} {v.model} {v.generation} {v.trim} · {set.colour.name}
                  </div>
                  {verified.map((i) => (
                    <div key={i.id} className="text-xs text-muted">
                      {i.attribution}
                    </div>
                  ))}
                </div>
                <Badge tone={verified.length > 0 ? "good" : "neutral"}>{verified.length > 0 ? "Verified photo" : "Illustration"}</Badge>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <SectionTitle>About</SectionTitle>
        <p className="text-sm text-ink-soft">
          Car Flipper Tycoon · career {game.careerId} · day {game.day}. Prices, fault rates and progression targets are initial balancing values.
        </p>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Start a new career?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={abandonCareer}>
              Delete this career
            </Button>
          </>
        }
      >
        <p className="text-sm">This permanently deletes your current save and its backup from this browser. Export it first if you want to keep it.</p>
      </Modal>
    </div>
  );
}
