import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Space } from 'antd';
import { t } from './i18n';

/**
 * Signature pad — a pure-canvas drawing surface (no device API), for delivery/acceptance sign-off.
 * Pointer events handle mouse + touch uniformly; the result is exported as a PNG blob. An optional
 * caption (signer name + timestamp) is baked under the strokes so the image is self-describing.
 */

export interface SignatureCfg {
  penColor: string;
  penWidth: number;
  white: boolean;    // white background vs transparent
  height: number;
  caption?: string;  // already-composed caption line (name · time), empty = none
}

export interface SignatureModalProps {
  open: boolean;
  onClose: () => void;
  onDone: (blob: Blob, dataUrl: string) => void;
  cfg: SignatureCfg;
  title?: string;
}

function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }
export function nowStamp(): string {
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export const SignatureModal: React.FC<SignatureModalProps> = ({ open, onClose, onDone, cfg, title }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [empty, setEmpty] = useState(true);

  const setup = useCallback(() => {
    const canvas = canvasRef.current, wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const cssW = wrap.clientWidth || 360;
    const cssH = cfg.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (cfg.white) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cssW, cssH); }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = cfg.penColor;
    ctx.lineWidth = cfg.penWidth;
    dirty.current = false;
    setEmpty(true);
  }, [cfg.height, cfg.white, cfg.penColor, cfg.penWidth]);

  useEffect(() => { if (open) setTimeout(setup, 40); }, [open, setup]);

  const posOf = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    (e.target as any).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = posOf(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = posOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
    if (empty) setEmpty(false);
  };
  const onUp = () => { drawing.current = false; };

  const clear = () => setup();

  const done = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty.current) return;
    // Bake caption under the strokes if configured.
    if (cfg.caption) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const cssW = canvas.clientWidth, cssH = cfg.height;
        ctx.font = `500 12px -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
        ctx.fillStyle = cfg.white ? 'rgba(0,0,0,.55)' : cfg.penColor;
        ctx.textBaseline = 'bottom';
        ctx.fillText(cfg.caption, 8, cssH - 6);
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const dataUrl = canvas.toDataURL('image/png');
      onDone(blob, dataUrl);
      onClose();
    }, 'image/png');
  }, [cfg.caption, cfg.height, cfg.white, cfg.penColor, onDone, onClose]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>✍️</span>{title || t('Ký tên')}</span>}
      footer={null}
      width={440}
      centered
      destroyOnClose
      maskClosable={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div ref={wrapRef} style={{ width: '100%', border: '1px solid var(--colorBorder, #d9d9d9)', borderRadius: 10, overflow: 'hidden', position: 'relative', background: cfg.white ? '#fff' : 'repeating-conic-gradient(#f2f2f2 0% 25%, #fff 0% 50%) 50% / 16px 16px' }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={onUp}
            style={{ display: 'block', touchAction: 'none', cursor: 'crosshair' }}
          />
          {empty && (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', pointerEvents: 'none', fontSize: 14 }}>
              {t('Ký vào đây bằng ngón tay hoặc chuột')}
            </span>
          )}
        </div>
        <Space style={{ justifyContent: 'space-between', width: '100%' }}>
          <Button onClick={clear}>↺ {t('Xoá')}</Button>
          <Button type="primary" onClick={done} disabled={empty}>✓ {t('Dùng chữ ký')}</Button>
        </Space>
      </div>
    </Modal>
  );
};
