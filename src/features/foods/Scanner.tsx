import { useEffect, useRef, useState } from 'preact/hooks';
import { isValidBarcode } from '../../lib/off/api';
import { Field } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { Sheet } from '../../ui/Sheet';

type State = 'starting' | 'scanning' | 'detected' | 'denied' | 'nocamera' | 'error';

interface DetectorLike {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}
interface DetectorCtor {
  new (opts: { formats: string[] }): DetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

const WANTED = ['ean_13', 'ean_8', 'upc_a'];

/** Starts the native BarcodeDetector loop. Returns null when unsupported. */
async function startNative(video: HTMLVideoElement, onCode: (c: string) => void): Promise<(() => void) | null> {
  const Ctor = (window as unknown as { BarcodeDetector?: DetectorCtor }).BarcodeDetector;
  if (!Ctor) return null;
  const supported = await Ctor.getSupportedFormats().catch(() => [] as string[]);
  const formats = WANTED.filter((f) => supported.includes(f));
  if (!formats.length) return null;
  const detector = new Ctor({ formats });
  let timer = 0;
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    if (video.readyState >= 2) {
      const codes = await detector.detect(video).catch(() => []);
      if (codes[0]) onCode(codes[0].rawValue);
    }
    if (!stopped) timer = window.setTimeout(tick, 120);
  };
  void tick();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

export default function Scanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const [state, setState] = useState<State>('starting');
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [manual, setManual] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const doneRef = useRef(onDetected);
  doneRef.current = onDetected;

  useEffect(() => {
    let stopped = false;
    let stopLoop: () => void = () => {};
    let stream: MediaStream | null = null;

    const found = (raw: string) => {
      const c = raw.trim();
      if (stopped || !isValidBarcode(c)) return;
      stopped = true;
      stopLoop();
      setState('detected');
      navigator.vibrate?.(40);
      // Leave time for the visual confirmation.
      setTimeout(() => doneRef.current(c), 450);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setState('nocamera');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        });
      } catch (e) {
        const name = (e as DOMException)?.name;
        setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'nocamera');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0] ?? null;
      trackRef.current = track;
      const caps = (track?.getCapabilities?.() ?? {}) as MediaTrackCapabilities & { torch?: boolean };
      if (caps.torch) setTorch({ available: true, on: false });
      setState('scanning');

      const native = await startNative(video, found);
      if (native) {
        stopLoop = native;
      } else {
        // Safari iOS: no BarcodeDetector, load the decoder now (and only now).
        const { startZxing } = await import('./zxing');
        if (stopped) return;
        stopLoop = await startZxing(video, found);
      }
      if (stopped) stopLoop();
    })().catch((e) => {
      console.error(e);
      if (!stopped) setState('error');
    });

    return () => {
      stopped = true;
      stopLoop();
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    const t = trackRef.current;
    if (!t) return;
    const on = !torch.on;
    try {
      await t.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] });
      setTorch({ available: true, on });
    } catch {
      setTorch({ available: false, on: false });
    }
  };

  const message: Record<State, string> = {
    starting: 'Ouverture de la caméra…',
    scanning: 'Place le code-barres dans le cadre.',
    detected: 'Code détecté.',
    denied: "Accès à la caméra refusé. Autorise la caméra pour ce site dans Réglages > Apps > Safari > Caméra, ou saisis le code.",
    nocamera: 'Aucune caméra disponible. Saisis le code à la main.',
    error: 'La caméra a rencontré un problème. Saisis le code à la main ou réessaie.',
  };

  return (
    <Sheet
      title="Scanner un code-barres"
      full
      class="scanner"
      onClose={onClose}
      headerExtra={
        torch.available && (
          <button
            type="button"
            class="icon-btn icon-btn--filled"
            aria-pressed={torch.on}
            aria-label="Lampe torche"
            onClick={() => void toggleTorch()}
          >
            <Icon name="flash" filled={torch.on} />
          </button>
        )
      }
    >
      <div class="sheet__content">
        <div class={`scanner__view scanner__view--${state}`}>
          <video ref={videoRef} class="scanner__video" playsInline muted autoPlay aria-hidden="true" />
          <div class="scanner__frame" aria-hidden="true">
            <span class="scanner__check">
              <Icon name="check" size={40} stroke={3} />
            </span>
          </div>
        </div>
        <p class="scanner__msg" role="status" aria-live="polite">
          {message[state]}
        </p>
        {manual ? (
          <form
            class="stack"
            onSubmit={(e) => {
              e.preventDefault();
              const c = code.replace(/\D/g, '');
              if (!/^\d{8,14}$/.test(c)) {
                setCodeError('Le code doit contenir 8 à 14 chiffres.');
                return;
              }
              onDetected(c);
            }}
          >
            <Field
              label="Code-barres"
              value={code}
              onValue={(v) => {
                setCode(v);
                setCodeError(null);
              }}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="search"
              error={codeError}
            />
            <button type="submit" class="btn btn--primary btn--block">
              Rechercher ce code
            </button>
          </form>
        ) : (
          <button type="button" class="btn btn--secondary btn--block" onClick={() => setManual(true)}>
            Saisir le code à la main
          </button>
        )}
      </div>
    </Sheet>
  );
}
