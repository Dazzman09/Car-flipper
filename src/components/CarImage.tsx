"use client";

import { getImageSet, isImageVerified } from "@/engine/catalogue/images";
import { getVariant, type BodyStyle } from "@/engine/catalogue/variants";

/**
 * Shows the car's verified photograph with its attribution. Until a verified
 * photograph exists for the image set, a clearly labelled illustration is
 * drawn from the same configuration (body style and colour), so the picture
 * can never contradict the listing.
 */
/** Prefix a /public path with the deployment base path (GitHub Pages serves from a subfolder). */
function assetUrl(src: string): string {
  return src.startsWith("/") ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${src}` : src;
}

export function CarImage({ imageSetId, size = "md" }: { imageSetId: string; size?: "sm" | "md" | "lg" }) {
  const set = getImageSet(imageSetId);
  const variant = getVariant(set.variantId);
  const photo = set.images.find((i) => isImageVerified(i));
  const height = size === "sm" ? "h-24" : size === "lg" ? "h-56 sm:h-72" : "h-40";
  const alt = `${set.colour.name} ${variant.make} ${variant.model} ${variant.generation} ${variant.bodyStyle}`;

  if (photo && photo.src) {
    return (
      <figure className="overflow-hidden rounded-lg bg-ink/5" data-testid="car-photo" data-image-set={set.id}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(photo.src)} alt={alt} className={`w-full object-cover ${height}`} loading="lazy" />
        {size !== "sm" && photo.attribution && (
          <figcaption className="px-2 py-1 text-[10px] leading-tight text-muted">
            {photo.source.pageUrl ? (
              <a href={photo.source.pageUrl} target="_blank" rel="noreferrer" className="underline">
                {photo.attribution}
              </a>
            ) : (
              photo.attribution
            )}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure
      className="relative overflow-hidden rounded-lg bg-gradient-to-b from-[#e9eef3] to-[#d7dde3]"
      data-testid="car-illustration"
      data-image-set={set.id}
      data-colour={set.colour.name}
      data-body={variant.bodyStyle}
    >
      <CarSilhouette body={variant.bodyStyle} colour={set.colour.hex} className={`mx-auto w-full ${height}`} title={alt} />
      {size !== "sm" && (
        <figcaption className="absolute left-2 top-2 rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold text-ink-soft">
          Illustration · {set.colour.name} · verified photo pending
        </figcaption>
      )}
    </figure>
  );
}

const BODIES: Record<BodyStyle, { body: string; glass: string; wheels: [number, number]; ground: number }> = {
  sedan: {
    body: "M18,104 L18,82 Q20,71 38,69 L96,64 L126,41 Q133,35 146,35 L208,35 Q220,35 229,43 L256,64 L290,69 Q302,71 302,84 L302,104 Z",
    glass: "M104,63 L131,42 Q136,39 145,39 L172,39 L172,63 Z M178,39 L207,39 Q216,39 223,45 L246,63 L178,63 Z",
    wheels: [80, 244],
    ground: 104,
  },
  hatch: {
    body: "M26,104 L26,80 Q28,70 44,68 L98,63 L130,38 Q137,32 150,32 L236,33 Q249,34 255,45 L276,69 Q288,73 288,86 L288,104 Z",
    glass: "M106,62 L134,40 Q139,36 148,36 L185,36 L185,62 Z M191,36 L233,37 Q244,38 249,47 L265,62 L191,62 Z",
    wheels: [82, 236],
    ground: 104,
  },
  wagon: {
    body: "M18,104 L18,80 Q20,70 36,68 L94,63 L124,37 Q131,32 144,32 L268,33 Q279,34 283,46 L296,68 Q304,72 304,86 L304,104 Z",
    glass: "M102,62 L128,40 Q133,36 142,36 L180,36 L180,62 Z M186,36 L232,36 L232,62 L186,62 Z M238,36 L264,36 Q273,37 276,46 L285,62 L238,62 Z",
    wheels: [80, 250],
    ground: 104,
  },
  suv: {
    body: "M20,106 L20,74 Q22,62 40,60 L92,56 L118,26 Q125,20 138,20 L250,21 Q263,22 268,34 L284,58 Q300,62 300,78 L300,106 Z",
    glass: "M100,55 L122,30 Q127,25 136,25 L180,25 L180,55 Z M186,25 L226,25 L226,55 L186,55 Z M232,25 L248,25 Q258,26 262,36 L273,55 L232,55 Z",
    wheels: [82, 240],
    ground: 106,
  },
  ute: {
    body: "M16,106 L16,78 Q18,66 36,64 L86,60 L114,30 Q120,24 132,24 L184,24 Q192,24 194,33 L197,58 L304,58 L304,106 Z",
    glass: "M94,58 L118,33 Q123,28 131,28 L150,28 L150,58 Z M156,28 L182,28 Q188,28 189,35 L191,58 L156,58 Z",
    wheels: [78, 250],
    ground: 106,
  },
  convertible: {
    body: "M20,104 L20,84 Q22,73 38,71 L108,67 L130,47 L137,47 L130,67 L286,69 Q302,71 302,86 L302,104 Z",
    glass: "M114,66 L132,50 L134,50 L127,66 Z",
    wheels: [80, 246],
    ground: 104,
  },
};

export function CarSilhouette({ body, colour, className, title }: { body: BodyStyle; colour: string; className?: string; title: string }) {
  const b = BODIES[body];
  return (
    <svg viewBox="0 0 320 140" className={className} role="img" aria-label={title}>
      <title>{title}</title>
      <ellipse cx="160" cy={b.ground + 22} rx="140" ry="7" fill="rgba(0,0,0,0.12)" />
      <path d={b.body} fill={colour} stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      <path d={b.glass} fill="#2b3440" opacity="0.8" />
      <path d={b.body} fill="url(#shine)" opacity="0.35" />
      <defs>
        <linearGradient id="shine" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {b.wheels.map((x) => (
        <g key={x}>
          <circle cx={x} cy={b.ground + 2} r="21" fill="#1b1e24" />
          <circle cx={x} cy={b.ground + 2} r="11" fill="#9aa1ab" />
          <circle cx={x} cy={b.ground + 2} r="3" fill="#1b1e24" />
        </g>
      ))}
    </svg>
  );
}
