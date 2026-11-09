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

export async function startScanner(video: HTMLVideoElement, onCode: (code: string) => void): Promise<() => void> {
  const Native = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (Native) {
    const detector = new Native({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
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
  const { BrowserMultiFormatReader } = await import('@zxing/browser');
  const reader = new BrowserMultiFormatReader();
  let done = false;
  const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (result) => {
    const text = result?.getText();
    if (!done && text && isBarcode(text)) {
      done = true;
      onCode(text);
    }
  });
  return () => controls.stop();
}
