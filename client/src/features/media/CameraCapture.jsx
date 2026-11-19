import { Camera, RefreshCw, SwitchCamera, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from '../../components/ui/Alert.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { Dialog, DialogActions } from '../../components/ui/Dialog.jsx';

// Take photos with the device's camera and hand them on as ordinary files.
//  - Phones and tablets (and the Android app): the system camera app opens
//    straight away (<input capture>), which gives full resolution and flash.
//  - Computers: a live preview from the webcam, where several shots can be
//    taken, checked and then used together.
// If the live camera can't start (no camera, permission refused, an insecure
// page), the dialog offers the system picker instead.

const JPEG_QUALITY = 0.92;
const MAX_SHOTS = 20;

function isTouchDevice() {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
}

function canStream() {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

// "Photo 2026-11-19 14-05-09.jpg": sortable, and safe as a file name.
function photoName(index = 0) {
  const now = new Date(Date.now() + index * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  return `Photo ${date} ${time}.jpg`;
}

function cameraError(error) {
  if (error?.name === 'NotAllowedError') {
    return 'Camera access was refused. Allow the camera for this site in your browser settings, or use the system camera below.';
  }
  if (error?.name === 'NotFoundError' || error?.name === 'OverconstrainedError') {
    return 'No camera was found on this device.';
  }
  if (error?.name === 'NotReadableError') {
    return 'The camera is busy in another app. Close it there and try again.';
  }
  return 'The camera could not start here.';
}

function CameraDialog({ open, onClose, onCapture, onUseSystemCamera, maxShots }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [facing, setFacing] = useState('environment');
  const [cameraCount, setCameraCount] = useState(0);
  const [status, setStatus] = useState('starting');
  const [error, setError] = useState(null);
  const [shots, setShots] = useState([]);
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      .then(async (stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        stop();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus('live');
        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (!cancelled) setCameraCount(devices.filter((d) => d.kind === 'videoinput').length);
      })
      .catch((err) => {
        if (cancelled) return;
        setStatus('failed');
        setError(cameraError(err));
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, [facing, stop]);

  // Previews are object URLs; let them go when the dialog closes.
  const urls = useRef(new Set());
  useEffect(() => {
    const made = urls.current;
    return () => made.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function takePhoto() {
    const video = videoRef.current;
    if (!video?.videoWidth || shots.length >= maxShots) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], photoName(shots.length), { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        urls.current.add(url);
        setShots((current) => [...current, { file, url }]);
      },
      'image/jpeg',
      JPEG_QUALITY,
    );
    setFlash(true);
    setTimeout(() => setFlash(false), 150);
  }

  function removeShot(index) {
    const { url } = shots[index];
    URL.revokeObjectURL(url);
    urls.current.delete(url);
    setShots((current) => current.filter((shot) => shot.url !== url));
  }

  function finish() {
    const files = shots.map((shot) => shot.file);
    stop();
    onClose();
    if (files.length) onCapture(files);
  }

  const full = shots.length >= maxShots;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Take a photo"
      description={
        maxShots > 1
          ? 'Take as many shots as you need, then use them.'
          : 'Take a shot, then use it.'
      }
      wide
    >
      <div className="relative overflow-hidden rounded-2xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-video w-full object-contain"
          aria-label="Camera preview"
        />
        {flash && <div className="absolute inset-0 bg-white/70" aria-hidden="true" />}
        {status === 'starting' && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/70">
            Starting the camera…
          </p>
        )}
        {status === 'live' && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-4 bg-gradient-to-t from-black/60 to-transparent p-4">
            <button
              type="button"
              onClick={takePhoto}
              disabled={full}
              aria-label="Take photo"
              title={full ? `Up to ${maxShots} photos at a time` : 'Take photo'}
              className="grid h-16 w-16 place-items-center rounded-full border-4 border-white/90 bg-white/20 transition-transform active:scale-90 disabled:opacity-40"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
            {cameraCount > 1 && (
              <button
                type="button"
                onClick={() => {
                  setStatus('starting');
                  setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
                }}
                aria-label="Switch camera"
                title="Switch camera"
                className="absolute right-4 grid h-11 w-11 place-items-center rounded-full bg-black/50 text-white"
              >
                <SwitchCamera className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {shots.length > 0 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Photos taken">
          {shots.map((shot, index) => (
            <li key={shot.url} className="relative shrink-0">
              <img
                src={shot.url}
                alt={`Photo ${index + 1}`}
                className="border-line h-20 w-28 rounded-xl border object-cover"
              />
              <button
                type="button"
                onClick={() => removeShot(index)}
                aria-label={`Remove photo ${index + 1}`}
                className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-black/60 text-white"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <DialogActions
        start={
          <Button variant="ghost" size="sm" onClick={onUseSystemCamera}>
            {status === 'failed' ? (
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Camera className="h-4 w-4" aria-hidden="true" />
            )}
            Use system camera or pick a photo
          </Button>
        }
      >
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={finish} disabled={!shots.length}>
          {shots.length > 1 ? `Use ${shots.length} photos` : 'Use photo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * The camera for a screen: call `open()` from a button and render `element`
 * once. Photos arrive in `onCapture(files)` as JPEG File objects.
 */
export function useCamera(onCapture, { maxShots = MAX_SHOTS } = {}) {
  const inputRef = useRef(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const openSystemCamera = useCallback(() => {
    setDialogOpen(false);
    inputRef.current?.click();
  }, []);

  const open = useCallback(() => {
    if (isTouchDevice() || !canStream()) openSystemCamera();
    else setDialogOpen(true);
  }, [openSystemCamera]);

  const element = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={maxShots > 1}
        hidden
        onChange={(event) => {
          const files = [...event.target.files].slice(0, maxShots);
          event.target.value = '';
          if (files.length) onCapture(files);
        }}
      />
      {/* Mounted only while open, so every visit starts fresh. */}
      {dialogOpen && (
        <CameraDialog
          open
          onClose={() => setDialogOpen(false)}
          onCapture={onCapture}
          onUseSystemCamera={openSystemCamera}
          maxShots={maxShots}
        />
      )}
    </>
  );

  return { open, element };
}
