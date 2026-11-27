/** Lazy chunk: only loaded when the scanner opens on a browser without BarcodeDetector (Safari iOS). */
import { BrowserMultiFormatOneDReader } from '@zxing/browser';
import { BarcodeFormat, DecodeHintType } from '@zxing/library';

export async function startZxing(
  video: HTMLVideoElement,
  onCode: (code: string) => void,
): Promise<() => void> {
  const hints = new Map<DecodeHintType, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A]],
  ]);
  const reader = new BrowserMultiFormatOneDReader(hints, { delayBetweenScanAttempts: 80 });
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) onCode(result.getText());
  });
  return () => controls.stop();
}
