import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Space, theme } from 'antd';
import { PermissionHelp } from './permissionHelp';
import { t } from './i18n';

/**
 * Audio recorder modal (MediaRecorder). Records a voice note → audio blob for upload (the field then
 * holds it as an attachment; an AI STT column can transcribe it later). Picks a mime the browser
 * supports (webm/opus on Chrome/Android, mp4 on Safari/iOS). Timer + max-duration auto-stop + playback
 * preview before "Use". Permission-blocked → the microphone guidance card.
 */

export interface AudioRecorderProps {
  open: boolean;
  onClose: () => void;
  onDone: (blob: Blob, ext: string) => void;
  maxSec: number;
  title?: string;
}

function pickMime(): { mime: string; ext: string } {
  const MR: any = (window as any).MediaRecorder;
  const cand: Array<[string, string]> = [
    ['audio/webm;codecs=opus', 'webm'],
    ['audio/webm', 'webm'],
    ['audio/mp4', 'm4a'],
    ['audio/ogg;codecs=opus', 'ogg'],
  ];
  for (const [mime, ext] of cand) {
    try { if (MR?.isTypeSupported?.(mime)) return { mime, ext }; } catch (_) { /* ignore */ }
  }
  return { mime: '', ext: 'webm' };
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const AudioRecorderModal: React.FC<AudioRecorderProps> = ({ open, onClose, onDone, maxSec, title }) => {
  const { token } = theme.useToken();
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<any>(null);
  const chunksRef = useRef<BlobData[]>([] as any);
  const tickRef = useRef<any>(null);
  const extRef = useRef<string>('webm');
  const [phase, setPhase] = useState<'idle' | 'recording' | 'recorded' | 'error'>('idle');
  const [denied, setDenied] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [blobUrl, setBlobUrl] = useState('');
  const blobRef = useRef<Blob | null>(null);

  type BlobData = Blob;

  const stopStream = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
    streamRef.current = null;
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const reset = useCallback(() => {
    stopStream();
    recRef.current = null;
    chunksRef.current = [] as any;
    blobRef.current = null;
    if (blobUrl) { try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ } }
    setBlobUrl('');
    setElapsed(0);
    setDenied(false);
    setErrMsg('');
    setPhase('idle');
  }, [blobUrl, stopStream]);

  useEffect(() => { if (!open) reset(); return () => { stopStream(); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const start = useCallback(async () => {
    setDenied(false); setErrMsg('');
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav?.mediaDevices?.getUserMedia || !(window as any).MediaRecorder) {
      setErrMsg(t('Thiết bị/trình duyệt không hỗ trợ ghi âm.')); setPhase('error'); return;
    }
    try {
      const stream = await nav.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const { mime, ext } = pickMime();
      extRef.current = ext;
      const rec = mime ? new (window as any).MediaRecorder(stream, { mimeType: mime }) : new (window as any).MediaRecorder(stream);
      recRef.current = rec;
      chunksRef.current = [] as any;
      rec.ondataavailable = (e: any) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime || 'audio/webm' });
        blobRef.current = blob;
        setBlobUrl(URL.createObjectURL(blob));
        stopStream();
        setPhase('recorded');
      };
      rec.start();
      setElapsed(0);
      setPhase('recording');
      tickRef.current = setInterval(() => {
        setElapsed((e) => {
          const n = e + 1;
          if (n >= maxSec) { try { rec.state !== 'inactive' && rec.stop(); } catch (_) { /* ignore */ } }
          return n;
        });
      }, 1000);
    } catch (e: any) {
      const name = e?.name || '';
      if (/NotAllowed|Permission|SecurityError/i.test(name)) setDenied(true);
      else setErrMsg(t('Không mở được micro.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [maxSec, stopStream]);

  const stop = useCallback(() => {
    try { const r = recRef.current; if (r && r.state !== 'inactive') r.stop(); } catch (_) { /* ignore */ }
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  const use = useCallback(() => {
    if (blobRef.current) { onDone(blobRef.current, extRef.current); onClose(); }
  }, [onDone, onClose]);

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>🎙️</span>{title || t('Ghi âm')}</span>}
      footer={null}
      width={400}
      centered
      destroyOnClose
      maskClosable={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', padding: '8px 0' }}>
        {phase === 'error' ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {denied ? <PermissionHelp kind="microphone" compact onRetry={start} /> : <div style={{ textAlign: 'center', color: token.colorTextSecondary }}>{errMsg}</div>}
          </div>
        ) : phase === 'recorded' ? (
          <>
            <div style={{ fontSize: 13, color: token.colorTextSecondary }}>{t('Thời lượng')}: <b>{fmt(elapsed)}</b></div>
            <audio src={blobUrl} controls style={{ width: '100%' }} />
            <Space style={{ justifyContent: 'space-between', width: '100%' }}>
              <Button onClick={() => { reset(); }}>↺ {t('Ghi lại')}</Button>
              <Button type="primary" onClick={use}>✓ {t('Dùng bản ghi')}</Button>
            </Space>
          </>
        ) : (
          <>
            <div style={{
              width: 84, height: 84, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 34, background: phase === 'recording' ? 'rgba(245,34,45,.12)' : token.colorFillQuaternary,
              border: phase === 'recording' ? '3px solid #f5222d' : `3px solid ${token.colorBorder}`,
              animation: phase === 'recording' ? 'ptdlPulse 1.2s ease-in-out infinite' : 'none',
            }}>🎙️</div>
            <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: 20, fontWeight: 600 }}>{fmt(elapsed)} <span style={{ fontSize: 12, color: token.colorTextQuaternary, fontWeight: 400 }}>/ {fmt(maxSec)}</span></div>
            {phase === 'recording'
              ? <Button danger type="primary" size="large" onClick={stop}>⏹ {t('Dừng')}</Button>
              : <Button type="primary" size="large" onClick={start}>● {t('Bắt đầu ghi')}</Button>}
            <style>{'@keyframes ptdlPulse{0%,100%{box-shadow:0 0 0 0 rgba(245,34,45,.4)}50%{box-shadow:0 0 0 10px rgba(245,34,45,0)}}'}</style>
          </>
        )}
      </div>
    </Modal>
  );
};
