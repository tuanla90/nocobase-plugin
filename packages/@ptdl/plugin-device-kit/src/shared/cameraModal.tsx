import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Modal, Button, Spin, Alert, Space, Tooltip } from 'antd';
import { captureToBlob, fileToImage, type WatermarkCfg, type CaptureResult } from './watermark';
import { getCurrentFix, formatFix, type GeoFix } from './geo';
import { t } from './i18n';

/**
 * In-app camera capture modal (getUserMedia). Forces a LIVE shot — no gallery picker — so the
 * captured image is genuine on-site evidence. GPS is fetched in parallel and stamped into the
 * watermark. On "Use photo" the caller receives the watermarked blob + the fix.
 *
 * Secure context (HTTPS/localhost) is required for getUserMedia; on Railway this holds. If the
 * camera can't open (denied / no device / insecure), a localized message + a "pick from file"
 * fallback are offered.
 */

export interface CameraModalProps {
  open: boolean;
  onClose: () => void;
  onCapture: (res: CaptureResult, fix: GeoFix | null) => void;
  watermark: WatermarkCfg;
  maxDim: number;
  quality: number;
  wantGps: boolean;      // fetch GPS for the watermark / metadata
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
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [preview, setPreview] = useState<CaptureResult | null>(null);
  const [fix, setFix] = useState<GeoFix | null>(null);
  const [gpsState, setGpsState] = useState<'idle' | 'locating' | 'ok' | 'fail'>('idle');

  const stopStream = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    } catch (_) { /* ignore */ }
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async (facingMode: 'environment' | 'user') => {
    setPhase('starting');
    setErrMsg('');
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
        await videoRef.current.play().catch(() => { /* autoplay may need the metadata event */ });
      }
      setPhase('live');
    } catch (e: any) {
      const name = e?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setErrMsg(t('Bạn đã từ chối quyền camera. Hãy mở lại quyền cho trang này trong cài đặt trình duyệt rồi thử lại.'));
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setErrMsg(t('Không tìm thấy camera phù hợp trên thiết bị.'));
      } else {
        setErrMsg(t('Không mở được camera.') + (e?.message ? ` (${e.message})` : ''));
      }
      setPhase('error');
    }
  }, [stopStream]);

  // Kick GPS as soon as the modal opens (parallel with camera warm-up).
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

  // Open/close lifecycle.
  useEffect(() => {
    if (open) {
      setPreview(null);
      setPhase('starting');
      startStream(facing);
    } else {
      stopStream();
    }
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
      stopStream(); // freeze — no need to keep the camera on during preview
    } catch (e: any) {
      setErrMsg(t('Chụp ảnh thất bại.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [maxDim, quality, watermark, fix, stopStream]);

  const doRetake = useCallback(() => {
    setPreview(null);
    startStream(facing);
  }, [facing, startStream]);

  const doSwitch = useCallback(() => {
    const next = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startStream(next);
  }, [facing, startStream]);

  const doUse = useCallback(() => {
    if (preview) {
      onCapture(preview, fix);
      onClose();
    }
  }, [preview, fix, onCapture, onClose]);

  // Native fallback: pick/capture via the OS camera app (input capture) then watermark it too.
  const onPickFile = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await fileToImage(file);
      const res = await captureToBlob(img, { maxDim, quality, watermark, fix, at: Date.now() });
      setPreview(res);
      setPhase('preview');
      stopStream();
    } catch (e: any) {
      setErrMsg(t('Không xử lý được ảnh đã chọn.') + (e?.message ? ` (${e.message})` : ''));
      setPhase('error');
    }
  }, [maxDim, quality, watermark, fix, stopStream]);

  const gpsBadge = () => {
    if (!wantGps) return null;
    if (gpsState === 'locating') return <span style={{ color: '#8c8c8c' }}>📍 {t('Đang lấy vị trí…')}</span>;
    if (gpsState === 'ok' && fix) return <span style={{ color: '#52c41a' }}>📍 {formatFix(fix)}</span>;
    if (gpsState === 'fail') return <span style={{ color: '#faad14' }}>📍 {t('Không lấy được vị trí (ảnh vẫn lưu).')}</span>;
    return null;
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title={title || t('Chụp ảnh')}
      footer={null}
      width={520}
      destroyOnClose
      maskClosable={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div
          style={{
            position: 'relative', width: '100%', aspectRatio: '3 / 4', background: '#000',
            borderRadius: 8, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {phase === 'preview' && preview ? (
            <img src={preview.dataUrl} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: phase === 'live' ? 'block' : 'none' }}
            />
          )}
          {phase === 'starting' && <Spin />}
          {phase === 'error' && (
            <div style={{ padding: 16, width: '100%' }}>
              <Alert type="warning" showIcon message={errMsg} style={{ marginBottom: 12 }} />
              <Button block onClick={() => fileInputRef.current?.click()}>
                {t('Chọn/chụp bằng camera hệ thống')}
              </Button>
            </div>
          )}
        </div>

        <div style={{ minHeight: 22, fontSize: 13 }}>{gpsBadge()}</div>

        {phase === 'preview' ? (
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Button onClick={doRetake}>{t('Chụp lại')}</Button>
            <Button type="primary" onClick={doUse}>{t('Dùng ảnh này')}</Button>
          </Space>
        ) : (
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Tooltip title={t('Đổi camera trước/sau')}>
              <Button onClick={doSwitch} disabled={phase !== 'live'}>{t('Đổi camera')}</Button>
            </Tooltip>
            <Button type="primary" size="large" onClick={doCapture} disabled={phase !== 'live'}>
              {t('Chụp')}
            </Button>
            <Button onClick={() => fileInputRef.current?.click()}>{t('Từ máy')}</Button>
          </Space>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>
    </Modal>
  );
};
