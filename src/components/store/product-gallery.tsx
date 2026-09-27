"use client";

import { useRef, useState } from "react";
import { ProductImage } from "@/components/product-image";
import { cn } from "@/lib/utils";

/** Swipeable on mobile (scroll-snap), thumbnail strip on desktop. */
export function ProductGallery({ images, name }: { images: { url: string; alt: string }[]; name: string }) {
  const list = images.length > 0 ? images : [{ url: "", alt: name }];
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);

  const go = (i: number) => {
    setActive(i);
    track.current?.scrollTo({ left: i * (track.current?.clientWidth ?? 0), behavior: "smooth" });
  };

  return (
    <div className="lg:sticky lg:top-32 lg:self-start">
      <div className="flex gap-3">
        <div className="hidden w-16 shrink-0 flex-col gap-2 lg:flex">
          {list.map((img, i) => (
            <button key={i} onClick={() => go(i)} className={cn("relative aspect-square overflow-hidden rounded-xl border-2 bg-white", i === active ? "border-brand-600" : "border-transparent ring-1 ring-line")} aria-label={`Show image ${i + 1}`}>
              <ProductImage src={img.url || null} alt={img.alt} sizes="64px" />
            </button>
          ))}
        </div>
        <div className="relative flex-1 overflow-hidden rounded-2xl bg-white ring-1 ring-line">
          <div
            ref={track}
            className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto"
            onScroll={(e) => {
              const el = e.currentTarget;
              const i = Math.round(el.scrollLeft / el.clientWidth);
              if (i !== active) setActive(i);
            }}
          >
            {list.map((img, i) => (
              <div key={i} className="relative aspect-square w-full shrink-0 snap-center">
                <ProductImage src={img.url || null} alt={img.alt} priority={i === 0} sizes="(max-width: 1024px) 100vw, 45vw" className="object-contain" />
              </div>
            ))}
          </div>
          {list.length > 1 && (
            <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5 lg:hidden">
              {list.map((_, i) => (
                <button key={i} onClick={() => go(i)} aria-label={`Image ${i + 1}`} className={cn("h-1.5 rounded-full transition-all", i === active ? "w-5 bg-brand-700" : "w-1.5 bg-slate-300")} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
