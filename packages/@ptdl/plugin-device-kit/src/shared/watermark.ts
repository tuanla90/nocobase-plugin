/**
 * Canvas image pipeline: draw a source (video frame or picked image) onto a canvas, downscale it,
 * burn a multi-line watermark into the PIXELS, and encode to a JPEG blob.
 *
 * WHY burn into pixels: re-encoding through a canvas strips EXIF (including any GPS EXIF), so the
 * only durable "field evidence" is text drawn into the image itself. The same metadata is ALSO
 * written to a Location field by the caller — this is the visible copy.
 */

import type { GeoFix } from './geo';
import { formatFix } from './geo';

export interface WatermarkCfg {
  enabled: boolean;
  showTime: boolean;
  showGps: boolean;
  showUser: boolean;
  customText?: string; // an extra free line (already interpolated by the caller)
  position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
  userName?: string;
}

export interface CaptureOpts {
  maxDim: number;    // longest side in px (0 = keep original)
  quality: number;   // JPEG quality 0..1
  watermark: WatermarkCfg;
  fix?: GeoFix | null;
  at?: number;       // capture timestamp (epoch ms); defaults to now
}

export interface CaptureResult {
  blob: Blob;
  dataUrl: string;   // preview
  width: number;
  height: number;
}

function pad2(n: number): string { return n < 10 ? `0${n}` : String(n); }

/** dd/MM/yyyy HH:mm:ss in local time (no locale dep — deterministic for the watermark). */
export function formatStamp(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Build the watermark lines from config + fix. Empty lines are dropped. */
export function buildWatermarkLines(cfg: WatermarkCfg, fix: GeoFix | null | undefined, at: number): string[] {
  if (!cfg.enabled) return [];
  const lines: string[] = [];
  const l1: string[] = [];
  if (cfg.showTime) l1.push(formatStamp(at));
  if (cfg.showUser && cfg.userName) l1.push(cfg.userName);
  if (l1.length) lines.push(l1.join('  ·  '));
  if (cfg.showGps && fix && fix.lat != null) lines.push(`📍 ${formatFix(fix)}`);
  if (cfg.customText) lines.push(cfg.customText);
  return lines;
}

function computeSize(sw: number, sh: number, maxDim: number): { w: number; h: number } {
  if (!maxDim || maxDim <= 0) return { w: sw, h: sh };
  const longest = Math.max(sw, sh);
  if (longest <= maxDim) return { w: sw, h: sh };
  const ratio = maxDim / longest;
  return { w: Math.round(sw * ratio), h: Math.round(sh * ratio) };
}

/**
 * Draw watermark lines into a canvas context. Text auto-scales with image size; a translucent
 * rounded plate keeps it legible over any background.
 */
function drawWatermark(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  lines: string[],
  position: WatermarkCfg['position'],
): void {
  if (!lines.length) return;
  const fs = Math.max(12, Math.round(W * 0.028)); // font size scales with width
  const padX = Math.round(fs * 0.7);
  const padY = Math.round(fs * 0.5);
  const lineH = Math.round(fs * 1.35);
  const gap = Math.round(fs * 0.6);

  ctx.font = `600 ${fs}px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
  ctx.textBaseline = 'top';

  let boxW = 0;
  for (const ln of lines) boxW = Math.max(boxW, ctx.measureText(ln).width);
  boxW = Math.ceil(boxW + padX * 2);
  const boxH = lineH * lines.length + padY * 2;

  const left = position.endsWith('left');
  const top = position.startsWith('top');
  const x = left ? gap : W - boxW - gap;
  const y = top ? gap : H - boxH - gap;

  // Plate.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  roundRect(ctx, x, y, boxW, boxH, Math.round(fs * 0.4));
  ctx.fill();

  // Text.
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = Math.round(fs * 0.25);
  let ty = y + padY;
  for (const ln of lines) {
    ctx.fillText(ln, x + padX, ty);
    ty += lineH;
  }
  ctx.shadowBlur = 0;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap;

function sourceSize(src: Source): { w: number; h: number } {
  if ((src as HTMLVideoElement).videoWidth != null && (src as HTMLVideoElement).videoWidth) {
    return { w: (src as HTMLVideoElement).videoWidth, h: (src as HTMLVideoElement).videoHeight };
  }
  const anySrc = src as any;
  return { w: anySrc.naturalWidth || anySrc.width, h: anySrc.naturalHeight || anySrc.height };
}

/** Render source → downscaled watermarked JPEG blob. */
export async function captureToBlob(src: Source, opts: CaptureOpts): Promise<CaptureResult> {
  const { w: sw, h: sh } = sourceSize(src);
  const { w, h } = computeSize(sw, sh, opts.maxDim);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no-2d-context');
  ctx.drawImage(src as any, 0, 0, w, h);

  const at = opts.at ?? Date.now();
  const lines = buildWatermarkLines(opts.watermark, opts.fix, at);
  drawWatermark(ctx, w, h, lines, opts.watermark.position);

  const quality = opts.quality > 0 && opts.quality <= 1 ? opts.quality : 0.72;
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob-failed'))),
      'image/jpeg',
      quality,
    );
  });
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  return { blob, dataUrl, width: w, height: h };
}

/** Load a File/Blob into an HTMLImageElement (for the "pick / native capture" path). */
export function fileToImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img-load-failed')); };
    img.src = url;
  });
}
