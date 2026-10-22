import { useCallback, useRef, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import type { AssetRef } from '../games/types';
import { useI18n } from '../platform/i18n/I18n';
import { Sheet } from '../platform/ui/Sheet';
import { decode, prepare, processFile, upload, type CropRect } from './images';
import { A } from './strings';

// LRI…PDI keeps "35 KB" in order inside Arabic sentences.
const kb = (n: number) => `⁦${Math.max(1, Math.round(n / 1024))} KB⁩`;

/**
 * "Choose photo" button. One file opens a cropper locked to the slot's aspect; several files
 * (when `multiple`) are centre-cropped and uploaded one after another.
 */
export function PhotoPicker({
  aspect,
  label,
  multiple = false,
  onUploaded,
  className = 'button button--quiet',
}: {
  aspect: number;
  label: string;
  multiple?: boolean;
  onUploaded(ref: AssetRef, info: { before: number; after: number }): void | Promise<void>;
  className?: string;
}) {
  const { tr, errorText } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<{ file: File; url: string; bitmap: ImageBitmap } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<CropRect | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const onComplete = useCallback((_: Area, px: Area) => setArea({ x: Math.round(px.x), y: Math.round(px.y), width: Math.round(px.width), height: Math.round(px.height) }), []);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setError('');
    if (files.length > 1 || multiple) {
      const list = [...files];
      for (let i = 0; i < list.length; i++) {
        setBusy(tr(A.uploadingN, { i: i + 1, n: list.length }));
        try {
          const ref = await processFile(list[i]!, aspect);
          await onUploaded(ref, { before: list[i]!.size, after: 0 });
        } catch (e) {
          setError(`${list[i]!.name}: ${errorText((e as Error).message)}`);
        }
      }
      setBusy(null);
      return;
    }
    try {
      setBusy(tr(A.reading));
      const file = files[0]!;
      const bitmap = await decode(file);
      // Cropper needs a URL; draw the decoded bitmap so HEIC works everywhere.
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
      const url = await new Promise<string>((res) => canvas.toBlob((b) => res(URL.createObjectURL(b!)), 'image/jpeg', 0.9));
      setZoom(1);
      setCrop({ x: 0, y: 0 });
      setSource({ file, url, bitmap });
    } catch {
      setError(tr(A.badImage));
    } finally {
      setBusy(null);
    }
  }

  async function confirm() {
    if (!source) return;
    setBusy(tr(A.optimising));
    try {
      const prepared = await prepare(source.bitmap, aspect, area ?? undefined);
      setBusy(tr(A.uploading));
      const ref = await upload(prepared);
      await onUploaded(ref, { before: source.file.size, after: prepared.files[0]!.blob.size });
      close();
    } catch (e) {
      setError(errorText((e as Error).message));
    } finally {
      setBusy(null);
    }
  }

  function close() {
    if (source) {
      URL.revokeObjectURL(source.url);
      source.bitmap.close();
    }
    setSource(null);
  }

  return (
    <>
      <input ref={input} type="file" accept="image/*,.heic,.heif" multiple={multiple} hidden onChange={(e) => (void pick(e.target.files), (e.target.value = ''))} />
      <button type="button" className={className} disabled={!!busy} onClick={() => input.current?.click()}>
        {busy && !source ? <span className="spinner-dots">{busy}</span> : label}
      </button>
      {error && !source && <p className="form-error">{error}</p>}
      <Sheet open={!!source} onClose={close} title={tr(A.cropTitle)}>
        {source && (
          <div className="cropper">
            <div className="cropper__stage">
              <Cropper image={source.url} crop={crop} zoom={zoom} aspect={aspect} onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={onComplete} showGrid={false} />
            </div>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} aria-label={tr(A.zoom)} className="cropper__zoom" />
            <p className="faint">{tr(A.sizeNote, { before: kb(source.file.size) })}</p>
            {error && <p className="form-error">{error}</p>}
            <div className="sheet-actions">
              <button type="button" className="button button--primary" disabled={!!busy} onClick={confirm}>
                {busy ? <span className="spinner-dots">{busy}</span> : tr(A.useThis)}
              </button>
              <button type="button" className="button button--ghost" onClick={close}>
                {tr(A.cancel)}
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </>
  );
}

export { kb };
