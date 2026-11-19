"use client";

import { useEffect, useRef, useState } from "react";

export function CameraButton({ inputId }: { inputId: string }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!on || !videoRef.current) return;
    let stop = () => {};
    let cancelled = false;
    const video = videoRef.current;
    void (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromVideoDevice(undefined, video, (result) => {
          if (!result) return;
          const input = document.getElementById(inputId);
          if (!(input instanceof HTMLInputElement)) return;
          input.value = result.getText();
          input.form?.requestSubmit();
        });
        stop = () => controls.stop();
        if (cancelled) stop();
      } catch {
        if (!cancelled) setError("The camera is not available. A scanner that types still works.");
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [on, inputId]);

  return (
    <div className="grid gap-2">
      <button type="button" className="btn-ghost" onClick={() => setOn((value) => !value)}>
        {on ? "Stop camera" : "Use camera"}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      ) : null}
      {on ? <video ref={videoRef} className="aspect-video w-full rounded-xl bg-black" muted playsInline /> : null}
    </div>
  );
}
