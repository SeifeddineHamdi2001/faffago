'use client';

import { useEffect, useRef, useState } from 'react';

/** The part of the browser's BarcodeDetector the station uses (Chrome on Android). */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

/** The label carries a Code128 (the code) and a QR (the tracking link), D-36. */
const FORMATS = ['code_128', 'qr_code'];
const DETECT_EVERY_MS = 200;

/**
 * The phone's camera (Admin 4.2, tech-stack 3): the browser's own
 * `BarcodeDetector` where it exists, zxing otherwise. Reports every code it
 * reads; the station ignores the same label read again in a row.
 */
export function CameraScanner({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const handler = useRef(onCode);
  const [error, setError] = useState<string | null>(null);
  handler.current = onCode;

  useEffect(() => {
    let stopped = false;
    let stop: () => void = () => undefined;
    const element = video.current;
    if (!element) return;

    async function start(target: HTMLVideoElement) {
      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor })
        .BarcodeDetector;
      if (Detector) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        });
        if (stopped) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        target.srcObject = stream;
        await target.play();
        const detector = new Detector({ formats: FORMATS });
        const timer = setInterval(() => {
          void detector
            .detect(target)
            .then((codes) => {
              for (const code of codes) handler.current(code.rawValue);
            })
            .catch(() => undefined);
        }, DETECT_EVERY_MS);
        stop = () => {
          clearInterval(timer);
          stream.getTracks().forEach((track) => track.stop());
        };
        return;
      }
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      const controls = await new BrowserMultiFormatReader().decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        target,
        (result) => {
          if (result) handler.current(result.getText());
        },
      );
      if (stopped) controls.stop();
      else stop = () => controls.stop();
    }

    start(element).catch(() =>
      setError('Caméra indisponible : autorisez la caméra, ou utilisez la douchette.'),
    );
    return () => {
      stopped = true;
      stop();
    };
  }, []);

  return (
    <div className="mt-3">
      <video
        ref={video}
        muted
        playsInline
        aria-label="Caméra"
        className="aspect-video w-full max-w-md rounded-xl bg-navy"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
