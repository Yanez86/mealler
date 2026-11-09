// SPDX-License-Identifier: AGPL-3.0-or-later
// Barcode scanning with the device camera: native BarcodeDetector where available (Android Chrome),
// otherwise the ZXing library (iPhone Safari), loaded only when needed.

interface DetectedBarcode {
  rawValue: string;
}
interface Detector {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type DetectorCtor = new (options: { formats: string[] }) => Detector;

export const isBarcode = (code: string) => /^\d{8,14}$/.test(code);

// Ask for a high resolution and continuous focus, then zoom in a bit: phones can't focus closer than
// ~15-20 cm, so zoom lets the barcode fill the frame while staying far enough to be sharp.
const ZOOM = 2;
async function openCamera(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  const [track] = stream.getVideoTracks();
  // zoom/focusMode aren't in the TS DOM types yet; unsupported constraints are skipped
  const caps = (track.getCapabilities?.() ?? {}) as { zoom?: { min: number; max: number }; focusMode?: string[] };
  const advanced: Record<string, unknown>[] = [];
  if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
  if (caps.zoom) advanced.push({ zoom: Math.min(caps.zoom.max, Math.max(caps.zoom.min, ZOOM)) });
  if (advanced.length) await track.applyConstraints({ advanced } as MediaTrackConstraints).catch(() => {});
  return stream;
}

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const stream = await openCamera();
    video.srcObject = stream;
    await video.play();
    let stopped = false;
    const tick = async () => {
      if (stopped) return;
      try {
        const found = (await detector.detect(video)).map((c) => c.rawValue).find(isBarcode);
        if (found) {
          onCode(found);
          return;
        }
      } catch {
        // frame not ready yet
      }
      setTimeout(tick, 200);
    };
    void tick();
    return () => {
      stopped = true;
      stream.getTracks().forEach((track) => track.stop());
    };
  }
  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import('@zxing/browser'),
    import('@zxing/library'),
  ]);
  const hints = new Map<number, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const stream = await openCamera();
  let done = false;
  const controls = await reader.decodeFromStream(stream, video, (result) => {
    const text = result?.getText();
    if (!done && text && isBarcode(text)) {
      done = true;
      onCode(text);
    }
  });
  return () => {
    controls.stop();
    stream.getTracks().forEach((track) => track.stop());
  };
}
