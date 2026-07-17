import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Spin, Tooltip } from 'antd';
import { captureToBlob, fileToImage, type WatermarkCfg, type CaptureResult } from './watermark';
import { getCurrentFix, formatFix, type GeoFix } from './geo';
import { PermissionHelp } from './permissionHelp';
import { t } from './i18n';

/**
 * In-app camera capture modal (getUserMedia). Forces a LIVE shot — no gallery picker — so the image
 * is genuine on-site evidence; GPS is fetched in parallel and stamped into the watermark. On "Use
 * photo" the caller receives the watermarked blob + the fix. Permission-blocked → inline guidance.
 */

export interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (res: CaptureResult, fix: GeoFix | null) => void;
  watermark: WatermarkCfg;
  maxDim: number;
  quality: number;
  wantGps: boolean;
  title?: string;
}

type Phase = 'starting' | 'live' | 'preview' | 'error';

export const CameraCaptureModal: React.FC<CameraModalProps> = ({
  open, onClose, onCapture, watermark, maxDim, quality, wantGps, title,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('starting');
  const [errMsg, setErrMsg] = useState<string>('');
  const [denied, setDenied] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ok' | 'fail'>('idle');

  const stopStream = useCallback(() => {
    try { streamRef.current?.getTracks().forEach((tr) => tr.stop()); } catch (_) { /* ignore */ }
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (facingMode: 'environment' | 'user') => {
    setPhase('starting');
    setErrMsg('');
    setDenied(false);
    stopStream();
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (!nav?.mediaDevices?.getUserMedia) {
      setErrMsg(t('Thiết bị/trình duyệt không hỗ trợ camera, hoặc trang không chạy trên HTTPS.'));
      setPhase('error');
      return;
    }
    try {
      const stream = await nav.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => { /* metadata event will start it */ });
      }
      setPhase('live');
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setDenied(true);
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setErrMsg(t('Không tìm thấy camera phù hợp trên thiết bị.'));
      } else {
        setErrMsg(t('Không mở được camera.') + (e?.message ? ` (${e.message})` : ''));
      }
      setPhase('error');
    }
  }, [stopStream]);

  useEffect(() => {
    if (!open) return;
    if (!wantGps) { setFix(null); setGpsState('idle'); return; }
    let alive = true;
    setGpsState('locating');
    getCurrentFix({ enableHighAccuracy: true, timeoutMs: 12000 })
      .then((f) => { if (alive) { f.src = 'camera'; setFix(f); setGpsState('ok'); } })
      .catch(() => { if (alive) { setFix(null); setGpsState('fail'); } });
    return () => { alive = false; };
  }, [open, wantGps]);

  useEffect(() => {
    if (open) { setPreview(null); setPhase('starting'); startStream(facing); }
    else stopStream();
    return () => { stopStream(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const doCapture = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    try {
      const res = await captureToBlob(video, { maxDim, quality, watermark, fix, at: Date.now() });
      setPreview(res);
      setPhase('preview');
      stopStream();
    } catch (e: any) {
      setErrMsg(t('Chụp ảnh thất bại.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [maxDim, quality, watermark, fix, stopStream]);

  const doRetake = useCallback(() => { setPreview(null); startStream(facing); }, [facing, startStream]);
  const doSwitch = useCallback(() => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next); startStream(next);
  }, [facing, startStream]);
  const doUse = useCallback(() => { if (preview) { onCapture(preview, fix); onClose(); } }, [preview, fix, onCapture, onClose]);

  const onPickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await fileToImage(file);
      const res = await captureToBlob(img, { maxDim, quality, watermark, fix, at: Date.now() });
      setPreview(res); setPhase('preview'); stopStream();
    } catch (e: any) {
      setErrMsg(t('Không xử lý được ảnh đã chọn.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [maxDim, quality, watermark, fix, stopStream]);

  const gpsBadge = () => {
    if (!wantGps) return null;
    const base: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, padding: '3px 10px', borderRadius: 999, fontVariantNumeric: 'tabular-nums' };
    if (gpsState === 'locating') return <span style={{ ...base, background: 'rgba(0,0,0,.06)', color: '#8c8c8c' }}>📍 {t('Đang lấy vị trí…')}</span>;
    if (gpsState === 'ok' && fix) return <span style={{ ...base, background: 'rgba(82,196,26,.12)', color: '#389e0d' }}>📍 {formatFix(fix)}</span>;
    if (gpsState === 'fail') return <span style={{ ...base, background: 'rgba(250,173,20,.14)', color: '#d48806' }}>📍 {t('Không lấy được vị trí (ảnh vẫn lưu).')}</span>;
    return null;
  };

  const IconBtn: React.FC<{ onClick?: () => void; disabled?: boolean; title: string; children: React.ReactNode }> = ({ onClick, disabled, title: tt, children }) => (
    <Tooltip title={tt}>
      <button
        onClick={onClick} disabled={disabled}
        style={{
          width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: disabled ? 'default' : 'pointer',
          background: 'rgba(255,255,255,.14)', color: '#fff', fontSize: 18, display: 'inline-flex',
          alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.4 : 1, backdropFilter: 'blur(4px)',
        }}
      >{children}</button>
    </Tooltip>
  );

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>📷</span>{title || t('Chụp ảnh')}</span>}
      footer={null}
      width={440}
      centered
      destroyOnClose
      maskClosable={false}
      styles={{ body: { paddingTop: 12 } }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Viewfinder / preview / error */}
        <div
          style={{
            position: 'relative', width: '100%', aspectRatio: '3 / 4', background: '#0a0a0a',
            borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)',
          }}
        >
          {phase === 'preview' && preview ? (
            <img src={preview.dataUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <video ref={videoRef} playsInline muted autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: phase === 'live' ? 'block' : 'none' }} />
          )}
          {phase === 'starting' && <Spin />}

          {phase === 'error' && (
            <div style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
              {denied
                ? <PermissionHelp kind="camera" onRetry={() => startStream(facing)} />
                : <div style={{ textAlign: 'center', color: '#8c8c8c', fontSize: 13, padding: 8 }}>{errMsg}</div>}
              <Button block onClick={() => fileInputRef.current?.click()}>{t('Chọn/chụp bằng camera hệ thống')}</Button>
            </div>
          )}

          {/* GPS badge floating over the live view */}
          {phase !== 'error' && wantGps && (
            <div style={{ position: 'absolute', top: 10, left: 10 }}>{gpsBadge()}</div>
          )}
        </div>

        {/* Controls */}
        {phase === 'preview' ? (
          <div style={{ display: 'flex', gap: 10 }}>
            <Button block onClick={doRetake}>↺ {t('Chụp lại')}</Button>
            <Button block type="primary" onClick={doUse}>✓ {t('Dùng ảnh này')}</Button>
          </div>
        ) : phase === 'live' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', justifyItems: 'center' }}>
            <div style={{ justifySelf: 'start' }}>
              <IconBtn onClick={doSwitch} title={t('Đổi camera trước/sau')}>⟳</IconBtn>
            </div>
            {/* shutter */}
            <button
              onClick={doCapture}
              aria-label={t('Chụp')}
              style={{
                width: 66, height: 66, borderRadius: '50%', cursor: 'pointer',
                border: '3px solid var(--colorPrimary, #1677ff)', background: 'var(--colorPrimary, #1677ff)',
                boxShadow: '0 0 0 4px rgba(22,119,255,.15)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: '#fff', boxShadow: 'inset 0 0 0 2px var(--colorPrimary, #1677ff)' }} />
            </button>
            <div style={{ justifySelf: 'end' }}>
              <IconBtn onClick={() => fileInputRef.current?.click()} title={t('Chọn/chụp bằng camera hệ thống')}>🖼️</IconBtn>
            </div>
          </div>
        ) : null}

        <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
          onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
    </Modal>
  );
};
