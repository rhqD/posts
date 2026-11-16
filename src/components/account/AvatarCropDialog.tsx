"use client";

import { useEffect, useId, useRef, useState, type PointerEvent } from 'react';
import { constrainAvatarCrop, drawAvatarCrop, encodeAvatarCrop, INITIAL_AVATAR_CROP, type AvatarCrop } from '@/lib/avatar-image';
import styles from './account.module.css';

export default function AvatarCropDialog({ source, onSave, onClose }: {
  source: HTMLCanvasElement;
  onSave: (avatar: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ id: number; x: number; y: number; crop: AvatarCrop } | null>(null);
  const [crop, setCrop] = useState(INITIAL_AVATAR_CROP);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const hintId = useId();
  const zoomId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  useEffect(() => {
    if (canvasRef.current) drawAvatarCrop(canvasRef.current, source, crop);
  }, [source, crop]);

  const move = (start: AvatarCrop, dx: number, dy: number) => {
    const width = canvasRef.current?.getBoundingClientRect().width;
    if (!width) return;
    const edge = Math.min(source.width, source.height) / start.zoom;
    setCrop(constrainAvatarCrop(source, {
      ...start,
      x: start.x - dx * edge / width / source.width,
      y: start.y - dy * edge / width / source.height,
    }));
  };

  const endDrag = (event: PointerEvent<HTMLCanvasElement>) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave(encodeAvatarCrop(source, crop));
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : '头像更新失败，请重试。');
    } finally {
      setSaving(false);
    }
  };

  return <dialog ref={dialogRef} className={styles.cropDialog} aria-label="调整头像" aria-describedby={hintId}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); if (!saving) onClose(); }}
    onKeyDown={event => {
      // Keep Escape inside this dialog, including when opened from the
      // account popover or a user form's own modal dialog.
      event.stopPropagation();
      if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) event.preventDefault();
    }}>
    <div className={styles.cropHeading}><h2>调整头像</h2><button type="button" className={styles.quietButton} disabled={saving} onClick={() => setCrop(INITIAL_AVATAR_CROP)}>重置</button></div>
    <p id={hintId} className={styles.cropHint}>拖动图片调整位置，用滑块缩放。也可聚焦图片后用方向键移动。</p>
    <div className={styles.cropViewport}>
      <canvas ref={canvasRef} width={600} height={600} tabIndex={saving ? -1 : 0} role="group" aria-label="头像裁剪区域" aria-describedby={hintId} aria-disabled={saving}
        onPointerDown={event => {
          if (saving || !event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, crop };
        }}
        onPointerMove={event => {
          const drag = dragRef.current;
          if (!saving && drag?.id === event.pointerId) move(drag.crop, event.clientX - drag.x, event.clientY - drag.y);
        }}
        onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={() => { dragRef.current = null; }}
        onKeyDown={event => {
          const step = event.shiftKey ? 40 : 10;
          const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
          if (delta[event.key]) {
            event.preventDefault();
            if (!saving) move(crop, ...delta[event.key]);
          }
        }} />
      <div className={styles.cropMask} aria-hidden="true" />
    </div>
    <div className={styles.cropZoom}>
      <label htmlFor={zoomId}>缩放</label>
      <input id={zoomId} type="range" min={1} max={4} step={0.01} value={crop.zoom} disabled={saving}
        aria-valuetext={`${crop.zoom.toFixed(1)} 倍`} onChange={event => setCrop(constrainAvatarCrop(source, { ...crop, zoom: Number(event.target.value) }))} />
      <output htmlFor={zoomId}>{crop.zoom.toFixed(1)}×</output>
    </div>
    <p className={styles.hint}>确认后会自动压缩图片，仅上传裁剪后的头像。</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.cropFooter}>
      <button type="button" className={styles.smallButton} disabled={saving} onClick={onClose}>取消</button>
      <button type="button" className={styles.cropSave} disabled={saving} onClick={save}>{saving ? '保存中…' : '使用此头像'}</button>
    </div>
  </dialog>;
}
