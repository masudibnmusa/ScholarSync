"use client";

import * as React from "react";
import * as Slider from "@radix-ui/react-slider";
import { MagnifyingGlassMinus, MagnifyingGlassPlus } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const VIEW = 288; // crop window, px
const OUT = 512; // saved image, px
const MAX_ZOOM = 4;

type Pos = { x: number; y: number }; // image centre's offset from the window centre, in window px

/** Square crop shown through a round mask: drag (or arrow keys) to move, slider or wheel to zoom. Saves a 512px image. */
export function PhotoCropDialog({ file, onCancel, onSave }: { file: File | null; onCancel: () => void; onSave: (cropped: File) => Promise<boolean> }) {
  const [img, setImg] = React.useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [pos, setPos] = React.useState<Pos>({ x: 0, y: 0 });
  const [saving, setSaving] = React.useState(false);
  const drag = React.useRef<{ startX: number; startY: number; from: Pos } | null>(null);

  React.useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => { setImg(el); setZoom(1); setPos({ x: 0, y: 0 }); };
    el.src = url;
    return () => { URL.revokeObjectURL(url); setImg(null); };
  }, [file]);

  // At zoom 1 the short side fills the window, so there is never empty space inside the circle.
  const scale = img ? (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * zoom : 1;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  const clamp = (p: Pos, z = zoom): Pos => {
    if (!img) return p;
    const s = (VIEW / Math.min(img.naturalWidth, img.naturalHeight)) * z;
    const mx = (img.naturalWidth * s - VIEW) / 2, my = (img.naturalHeight * s - VIEW) / 2;
    return { x: Math.max(-mx, Math.min(mx, p.x)), y: Math.max(-my, Math.min(my, p.y)) };
  };
  const zoomTo = (z: number) => {
    const next = Math.max(1, Math.min(MAX_ZOOM, z));
    setZoom(next);
    setPos((p) => clamp(p, next));
  };

  async function save() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = OUT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // The window's top-left corner, mapped back into the original image's pixels.
    const sx = (w / 2 - VIEW / 2 - pos.x) / scale, sy = (h / 2 - VIEW / 2 - pos.y) / scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, VIEW / scale, VIEW / scale, 0, 0, OUT, OUT);
    // WebP where the browser can encode it (Safari can't and returns PNG); either is well under the 2 MB limit at 512px.
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.9));
    if (!blob) return;
    setSaving(true);
    const ok = await onSave(new File([blob], `avatar.${blob.type.split("/")[1]}`, { type: blob.type }));
    setSaving(false);
    if (ok) onCancel();
  }

  return (
    <Dialog open={!!file} onOpenChange={(open) => { if (!open && !saving) onCancel(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Crop your photo</DialogTitle>
          <DialogDescription>Drag to position it, and zoom to frame your face.</DialogDescription>
        </DialogHeader>

        <div
          role="group" tabIndex={0} aria-label="Photo position. Drag, or use the arrow keys to move it."
          className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 active:cursor-grabbing"
          style={{ width: VIEW, height: VIEW }}
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { startX: e.clientX, startY: e.clientY, from: pos }; }}
          onPointerMove={(e) => { const d = drag.current; if (d) setPos(clamp({ x: d.from.x + e.clientX - d.startX, y: d.from.y + e.clientY - d.startY })); }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => zoomTo(zoom - e.deltaY * 0.002)}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 40 : 10;
            const d = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
            if (d) { e.preventDefault(); setPos((p) => clamp({ x: p.x + d[0], y: p.y + d[1] })); }
          }}
        >
          {img && (
            <img src={img.src} alt="" draggable={false} className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
              style={{ width: w, height: h, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))` }} />
          )}
          {/* Dim everything outside the circle that becomes the avatar. */}
          <span className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgb(28_20_14/0.55)] ring-2 ring-white/80" aria-hidden />
        </div>

        <div className="flex items-center gap-3">
          <button type="button" onClick={() => zoomTo(zoom - 0.25)} aria-label="Zoom out" className="tap grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
            <MagnifyingGlassMinus className="size-4" aria-hidden />
          </button>
          <Slider.Root value={[zoom]} min={1} max={MAX_ZOOM} step={0.01} onValueChange={([z]) => zoomTo(z)} aria-label="Zoom"
            className="relative flex h-5 w-full touch-none select-none items-center">
            <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-muted">
              <Slider.Range className="absolute h-full rounded-full bg-primary" />
            </Slider.Track>
            <Slider.Thumb aria-label="Zoom" className="block size-5 rounded-full border-2 border-primary bg-card shadow-soft outline-none transition-shadow focus-visible:ring-[3px] focus-visible:ring-ring/40" />
          </Slider.Root>
          <button type="button" onClick={() => zoomTo(zoom + 0.25)} aria-label="Zoom in" className="tap grid size-8 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
            <MagnifyingGlassPlus className="size-4" aria-hidden />
          </button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} loading={saving} disabled={!img}>Save photo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
