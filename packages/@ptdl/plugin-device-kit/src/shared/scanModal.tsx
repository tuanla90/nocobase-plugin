import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Spin, Tag, theme } from 'antd';
import { Html5Qrcode } from 'html5-qrcode';
import { PermissionHelp } from './permissionHelp';
import { t } from './i18n';

/**
 * QR / barcode scanner modal (html5-qrcode, lazy-imported). Shared by the scan-input field (A1) and the
 * scan-to-lookup action (A2). Live camera + "scan from image file" fallback; beep + vibrate on a hit;
 * optional continuous mode (keeps scanning, dedupes the same code for 1.5s) for POS / stock-taking.
 * Permission-blocked → the platform-aware guidance card.
 */

export interface ScanModalProps {
  open: boolean;
  onClose: () => void;
  onDecode: (text: string) => void;
  continuous?: boolean;
  beep?: boolean;
  vibrate?: boolean;
  title?: string;
  /** running counter shown in continuous mode (managed by the caller) */
  count?: number;
}

let _uid = 0;

function doBeep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 880;
    g.gain.value = 0.05;
    o.connect(g); g.connect(ctx.destination);
    o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch (_) { /* ignore */ } }, 90);
  } catch (_) { /* ignore */ }
}

export const ScanModal: React.FC<ScanModalProps> = ({ open, onClose, onDecode, continuous, beep = true, vibrate = true, title, count }) => {
  const { token } = theme.useToken();
  const regionId = useRef<string>('ptdl-scan-' + (++_uid));
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastHit = useRef<{ text: string; at: number }>({ text: '', at: 0 });
  const [phase, setPhase] = useState<'starting' | 'live' | 'error'>('starting');
  const [denied, setDenied] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [last, setLast] = useState('');

  const handleHit = useCallback((text: string) => {
    if (!text) return;
    const now = Date.now();
    // dedupe identical code within 1.5s (continuous) or ignore repeats before close
    if (lastHit.current.text === text && now - lastHit.current.at < 1500) return;
    lastHit.current = { text, at: now };
    setLast(text);
    if (beep) doBeep();
    if (vibrate) { try { navigator.vibrate?.(60); } catch (_) { /* ignore */ } }
    onDecode(text);
  }, [beep, vibrate, onDecode]);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try { await s.stop(); } catch (_) { /* ignore */ }
    try { await s.clear(); } catch (_) { /* ignore */ }
  }, []);

  const start = useCallback(async () => {
    setPhase('starting'); setDenied(false); setErrMsg('');
    try {
      await stop();
      // The region element must be in the DOM (modal is open + destroyOnClose false during start).
      const el = document.getElementById(regionId.current);
      if (!el) { setErrMsg(t('Không mở được vùng quét.')); setPhase('error'); return; }
      const scanner = new Html5Qrcode(regionId.current, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1.0 },
        (decoded: string) => handleHit(decoded),
        () => { /* per-frame decode failure — ignore */ },
      );
      setPhase('live');
    } catch (e: any) {
      const name = e?.name || String(e || '');
      if (/NotAllowed|Permission|SecurityError/i.test(name)) setDenied(true);
      else if (/NotFound|Overconstrained/i.test(name)) setErrMsg(t('Không tìm thấy camera phù hợp trên thiết bị.'));
      else setErrMsg(t('Không mở được camera.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [handleHit, stop]);

  useEffect(() => {
    if (open) { setLast(''); lastHit.current = { text: '', at: 0 }; setTimeout(() => start(), 60); }
    else stop();
    return () => { stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onPickFile = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      await stop();
      const scanner = new Html5Qrcode(regionId.current, { verbose: false });
      scannerRef.current = scanner;
      const text = await scanner.scanFile(file, false);
      handleHit(text);
      try { await scanner.clear(); } catch (_) { /* ignore */ }
      scannerRef.current = null;
    } catch (e: any) {
      setErrMsg(t('Không đọc được mã từ ảnh.'));
      setPhase('error');
    }
  }, [handleHit, stop]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>🔳</span>{title || t('Quét mã')}</span>}
      footer={null}
      width={420}
      centered
      destroyOnClose
      maskClosable={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#0a0a0a', borderRadius: 14, overflow: 'hidden' }}>
          <div id={regionId.current} style={{ width: '100%', height: '100%' }} />
          {phase === 'starting' && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spin /></div>
          )}
          {phase === 'error' && (
            <div style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
              {denied
                ? <PermissionHelp kind="camera" onRetry={start} />
                : <div style={{ textAlign: 'center', color: '#8c8c8c', fontSize: 13 }}>{errMsg}</div>}
              <Button block onClick={() => fileInputRef.current?.click()}>{t('Quét từ ảnh')}</Button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 26 }}>
          <span style={{ fontSize: 12.5, color: token.colorTextSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {last ? <>{t('Vừa quét:')} <Tag color="green" style={{ margin: 0 }}>{last}</Tag></> : t('Đưa mã vào khung để quét…')}
            {continuous && typeof count === 'number' ? <span style={{ marginLeft: 8 }}>· {t('Đã quét')}: <b>{count}</b></span> : null}
          </span>
          <Button size="small" onClick={() => fileInputRef.current?.click()}>{t('Từ ảnh')}</Button>
        </div>

        {continuous && (
          <Button type="primary" block onClick={onClose}>{t('Xong')}</Button>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </Modal>
  );
};
