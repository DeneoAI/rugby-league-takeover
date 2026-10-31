import React, { useEffect, useRef, useState } from "react";
import { CameraOff, Loader2 } from "lucide-react";

// Live QR reader for the bar scanner. Uses the browser's built-in
// BarcodeDetector where it exists (Chrome on Android) and falls back to jsQR
// (Safari/iOS, desktop Firefox), loaded only when needed.
//
// It reports each decoded string through onDetect and stops decoding while
// `paused` is true, so the result screen isn't overwritten by the same card
// still being held up to the camera.
const SCAN_INTERVAL_MS = 180;

async function makeDecoder() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        return async (video) => {
          const codes = await detector.detect(video);
          return codes?.[0]?.rawValue || null;
        };
      }
    } catch {
      /* fall back to jsQR */
    }
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    // Decode a downscaled frame: plenty for a QR filling the viewfinder and
    // much cheaper on older phones.
    const scale = Math.min(1, 640 / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" })?.data || null;
  };
}

function cameraErrorMessage(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera access was blocked. Allow the camera for this site in your browser settings, then reload.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera found on this device.";
  }
  if (typeof navigator !== "undefined" && !navigator.mediaDevices?.getUserMedia) {
    return "This browser can't open the camera. Try Chrome or Safari, or use the phone's camera app.";
  }
  return "Couldn't start the camera.";
}

export default function QrCameraScanner({ onDetect, paused = false }) {
  const videoRef = useRef(null);
  const pausedRef = useRef(paused);
  const onDetectRef = useRef(onDetect);
  const [state, setState] = useState("starting");
  const [error, setError] = useState("");

  pausedRef.current = paused;
  onDetectRef.current = onDetect;

  useEffect(() => {
    let stream = null;
    let timer = null;
    let stopped = false;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("no getUserMedia");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stopped) return;
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const decode = await makeDecoder();
        if (stopped) return;
        setState("running");

        const tick = async () => {
          if (stopped) return;
          if (!pausedRef.current && video.readyState >= 2) {
            try {
              const text = await decode(video);
              if (text && !pausedRef.current) onDetectRef.current?.(text);
            } catch {
              /* a bad frame: try the next one */
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (err) {
        if (stopped) return;
        setError(cameraErrorMessage(err));
        setState("error");
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-2 border border-border/40 bg-card/30 p-6 text-center">
        <CameraOff className="h-8 w-8 text-slate-500" />
        <p className="text-sm text-muted-foreground">{error}</p>
        <p className="text-[11px] text-slate-500">You can still look members up by number below.</p>
      </div>
    );
  }

  return (
    <div className="relative aspect-square w-full overflow-hidden border border-primary/40 bg-black">
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute inset-[14%] border-2 border-white/70" />
      {state === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-300">
          <Loader2 className="h-5 w-5 animate-spin" /> Starting camera…
        </div>
      )}
      {paused && state === "running" && <div className="absolute inset-0 bg-black/60" />}
    </div>
  );
}
