import React, { useState, useEffect, useRef, useCallback } from 'react';
import jsQR from 'jsqr';
import { Voter } from '../../types';
import { sounds } from '../../utils/audio';
import {
  Camera,
  X,
  RefreshCw,
  Upload,
  Zap,
  ZapOff,
  AlertCircle,
  CheckCircle2,
  ScanLine,
  IdCard,
  Sparkles,
} from 'lucide-react';

interface QrScanResult {
  voterId: string;
  pin?: string;
  sourceText?: string;
}

interface QrScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScanSuccess: (result: QrScanResult) => void;
  roster?: Voter[];
  requirePin?: boolean;
}

/**
 * Parse raw QR payload into voterId and optional pin
 */
export function parseVoterQrPayload(raw: string): QrScanResult | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // 1. Try parsing JSON format: { "voterId": "STU101", "pin": "7K9X2M4P" } or { "id": "STU101" }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const voterId = parsed.voterId || parsed.id || parsed.studentId;
      if (voterId && typeof voterId === 'string') {
        return {
          voterId: voterId.trim().toUpperCase(),
          pin: typeof parsed.pin === 'string' ? parsed.pin.trim().toUpperCase() : undefined,
          sourceText: trimmed,
        };
      }
    } catch {
      // Not valid JSON, continue
    }
  }

  // 2. Try parsing URL/URI format: https://domain.edu/vote?id=STU101&pin=7K9X2M4P or voter://STU101
  if (trimmed.includes('?') || trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('voter:')) {
    try {
      const url = new URL(trimmed.startsWith('voter:') ? `http://local/${trimmed}` : trimmed);
      const idParam = url.searchParams.get('id') || url.searchParams.get('voterId') || url.searchParams.get('studentId');
      const pinParam = url.searchParams.get('pin') || url.searchParams.get('code');
      if (idParam) {
        return {
          voterId: idParam.trim().toUpperCase(),
          pin: pinParam ? pinParam.trim().toUpperCase() : undefined,
          sourceText: trimmed,
        };
      }
    } catch {
      // If not standard URL, continue
    }
  }

  // 3. Try parsing colon or slash separator: STU101:7K9X2M4P or STU101/7K9X2M4P
  if (trimmed.includes(':') || trimmed.includes('|')) {
    const delimiter = trimmed.includes(':') ? ':' : '|';
    const parts = trimmed.split(delimiter);
    if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
      return {
        voterId: parts[0].trim().toUpperCase(),
        pin: parts[1].trim().toUpperCase(),
        sourceText: trimmed,
      };
    }
  }

  // 4. Fallback: Raw student voter ID string (e.g. STU101, 2024-001)
  // Strip any accidental leading "ID:" or "Voter:"
  const cleanId = trimmed.replace(/^(voter|id|student)[\s:#_-]*/i, '').trim();
  if (cleanId.length > 0 && cleanId.length <= 40) {
    return {
      voterId: cleanId.toUpperCase(),
      sourceText: trimmed,
    };
  }

  return null;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  roster = [],
  requirePin = false,
}) => {
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<QrScanResult | null>(null);
  const [matchedVoter, setMatchedVoter] = useState<Voter | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    setCameraActive(false);
    setTorchOn(false);
  }, []);

  // Handle successful scan match
  const handleDecodedCode = useCallback(
    (codeText: string) => {
      const parsed = parseVoterQrPayload(codeText);
      if (!parsed) return;

      sounds.playSuccess();
      try {
        if (navigator.vibrate) {
          navigator.vibrate([40, 60, 40]);
        }
      } catch {
        // ignore
      }

      setScanResult(parsed);

      // Check if ID matches roster
      const found = roster.find(
        (v) => v.voterId.toUpperCase() === parsed.voterId.toUpperCase()
      );
      setMatchedVoter(found || null);

      // Brief delay so user sees confirmed checkmark in viewfinder, then trigger callback and close
      setTimeout(() => {
        onScanSuccess(parsed);
        onClose();
      }, 700);
    },
    [roster, onScanSuccess, onClose]
  );

  // Scanning loop for video stream
  const startScanLoop = useCallback(() => {
    const scanTick = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
        animFrameIdRef.current = requestAnimationFrame(scanTick);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;

      if (width > 0 && height > 0) {
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0, width, height);

          // Fast native BarcodeDetector if available
          if ('BarcodeDetector' in window) {
            try {
              // @ts-expect-error - BarcodeDetector standard API in modern browsers
              const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
              detector
                .detect(canvas)
                .then((barcodes: Array<{ rawValue: string }>) => {
                  if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
                    handleDecodedCode(barcodes[0].rawValue);
                    return;
                  }
                })
                .catch(() => {
                  // fallback to jsQR below
                });
            } catch {
              // ignore
            }
          }

          // Fallback universal software decoder (jsQR)
          try {
            const imageData = ctx.getImageData(0, 0, width, height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
              inversionAttempts: 'dontInvert',
            });

            if (code && code.data && code.data.trim()) {
              handleDecodedCode(code.data);
              return; // Stop loop once detected
            }
          } catch {
            // ignore decoding hiccups
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(scanTick);
    };

    animFrameIdRef.current = requestAnimationFrame(scanTick);
  }, [handleDecodedCode]);

  // Start video camera
  const startCamera = useCallback(
    async (deviceId?: string) => {
      setCameraError(null);
      stopCamera();

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError(
          'Camera access is not supported by your browser or environment. You can upload an image of your QR badge instead.'
        );
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: false,
          video: deviceId
            ? { deviceId: { exact: deviceId } }
            : {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              },
        };

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute('playsinline', 'true');
          await videoRef.current.play();
        }

        setCameraActive(true);

        // Check if video track supports torch/flash
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const capabilities = videoTrack.getCapabilities?.() as { torch?: boolean } | undefined;
          setHasTorch(Boolean(capabilities?.torch));
        }

        // Enumerate video devices for camera switching
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter((d) => d.kind === 'videoinput');
          setAvailableDevices(videoDevices);
          if (!deviceId && videoDevices.length > 0) {
            setActiveDeviceId(videoDevices[0].deviceId);
          }
        } catch {
          // ignore
        }

        startScanLoop();
      } catch (err: unknown) {
        const error = err as Error;
        console.warn('Camera initialization error:', error);
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          setCameraError(
            'Camera permission was denied. Please allow camera permissions in your browser address bar, or upload a photo of your QR code below.'
          );
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          setCameraError(
            'No camera hardware detected on this device. You can upload a photo of your QR code instead.'
          );
        } else {
          setCameraError(
            `Unable to activate camera (${error.message || 'Access blocked'}). You can upload a QR image or select a sample ID.`
          );
        }
      }
    },
    [stopCamera, startScanLoop]
  );

  // Toggle flashlight / torch
  const handleToggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const nextTorch = !torchOn;
      await videoTrack.applyConstraints({ advanced: [{ torch: nextTorch } as any] });
      setTorchOn(nextTorch);
    } catch {
      // ignore
    }
  };

  // Switch between back and front camera
  const handleSwitchCamera = () => {
    if (availableDevices.length <= 1) return;
    const currentIndex = availableDevices.findIndex((d) => d.deviceId === activeDeviceId);
    const nextIndex = (currentIndex + 1) % availableDevices.length;
    const nextDevice = availableDevices[nextIndex];
    if (nextDevice) {
      setActiveDeviceId(nextDevice.deviceId);
      startCamera(nextDevice.deviceId);
    }
  };

  // Handle image file upload for scanning
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    setCameraError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setIsProcessingImage(false);
          setCameraError('Failed to initialize image decoder.');
          return;
        }

        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        setIsProcessingImage(false);

        if (code && code.data) {
          handleDecodedCode(code.data);
        } else {
          setCameraError(
            'No valid QR code was detected in the uploaded image. Please ensure the QR code is clear, well-lit, and not cropped.'
          );
          sounds.playError();
        }
      };

      img.onerror = () => {
        setIsProcessingImage(false);
        setCameraError('Unable to load image file. Please try another image.');
      };

      img.src = event.target?.result as string;
    };

    reader.readAsDataURL(file);
    // Reset file input so user can pick the same file again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Quick simulate scan from sample roster for demo / testing
  const handleSimulateSampleScan = (voter: Voter) => {
    const simulated = {
      voterId: voter.voterId,
      pin: voter.pin,
      sourceText: voter.voterId,
    };
    sounds.playSuccess();
    setScanResult(simulated);
    setMatchedVoter(voter);

    setTimeout(() => {
      onScanSuccess(simulated);
      onClose();
    }, 500);
  };

  // Manage camera lifecycle when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setScanResult(null);
      setMatchedVoter(null);
      setCameraError(null);
      startCamera();
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera]);

  if (!isOpen) return null;

  return (
    <div
      id="qr-scanner-modal-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 pb-8 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="qr-scanner-modal-card"
        className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-6 flex flex-col max-h-[92vh] animate-in fade-in slide-in-from-top-4 duration-150"
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 flex items-center justify-center shrink-0 shadow-2xs">
              <ScanLine className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight leading-tight">
                Scan Student ID / QR Code
              </h3>
              <p className="text-2xs sm:text-xs text-slate-500 dark:text-slate-400">
                Point your camera at the QR code on your student ID card or voting slip.
              </p>
            </div>
          </div>

          <button
            type="button"
            id="qr-scanner-close-btn"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close scanner"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder / Video Canvas Section */}
        <div className="p-4 sm:p-5 flex-1 flex flex-col items-center justify-center overflow-y-auto">
          {/* Viewfinder Box */}
          <div className="relative w-full max-w-[340px] aspect-square rounded-3xl overflow-hidden bg-slate-950 shadow-inner flex items-center justify-center border-4 border-slate-800 dark:border-slate-700">
            {/* Live Video Stream */}
            <video
              ref={videoRef}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                cameraActive ? 'opacity-100' : 'opacity-0'
              }`}
              muted
              playsInline
            />

            {/* Hidden canvas used for frame analysis */}
            <canvas ref={canvasRef} className="hidden" />

            {/* Viewfinder Target Reticles */}
            <div className="absolute inset-6 pointer-events-none flex flex-col justify-between">
              <div className="flex justify-between">
                <div className="w-8 h-8 border-t-4 border-l-4 border-amber-400 rounded-tl-xl shadow-xs" />
                <div className="w-8 h-8 border-t-4 border-r-4 border-amber-400 rounded-tr-xl shadow-xs" />
              </div>
              <div className="flex justify-between">
                <div className="w-8 h-8 border-b-4 border-l-4 border-amber-400 rounded-bl-xl shadow-xs" />
                <div className="w-8 h-8 border-b-4 border-r-4 border-amber-400 rounded-br-xl shadow-xs" />
              </div>
            </div>

            {/* Animated Laser Scanning Line */}
            {cameraActive && !scanResult && (
              <div
                className="absolute inset-x-8 h-0.5 bg-linear-to-r from-transparent via-amber-400 to-transparent shadow-[0_0_12px_#f59e0b] pointer-events-none animate-pulse"
                style={{
                  animation: 'qr-laser-sweep 2.2s ease-in-out infinite alternate',
                }}
              />
            )}

            {/* Success Overlay when QR is successfully recognized */}
            {scanResult && (
              <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95 duration-200">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center shadow-lg mb-2">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-300">
                  ID Card Recognized
                </span>
                <span className="text-xl font-black font-mono text-white mt-0.5">
                  {scanResult.voterId}
                </span>
                {matchedVoter && (
                  <span className="text-xs text-emerald-200 font-medium mt-0.5">
                    {matchedVoter.fullName}
                  </span>
                )}
                {scanResult.pin && (
                  <span className="text-2xs font-mono bg-emerald-900 text-emerald-200 px-2 py-0.5 rounded-md mt-1.5">
                    PIN: ••••••••
                  </span>
                )}
              </div>
            )}

            {/* Camera Inactive / Loading Placeholder */}
            {!cameraActive && !cameraError && !scanResult && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                <div className="w-10 h-10 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mb-3" />
                <span className="text-xs font-bold text-slate-300">Starting camera feed...</span>
                <span className="text-3xs text-slate-500 mt-1">Please allow camera permissions if prompted</span>
              </div>
            )}

            {/* Camera Error Fallback View */}
            {cameraError && (
              <div className="absolute inset-0 bg-slate-900/90 flex flex-col items-center justify-center text-slate-300 p-5 text-center">
                <AlertCircle className="w-10 h-10 text-amber-400 mb-2" />
                <span className="text-xs font-bold text-white mb-1">Camera Feed Unavailable</span>
                <p className="text-2xs text-slate-400 leading-relaxed mb-3">
                  {cameraError}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => startCamera()}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Retry Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-black flex items-center gap-1 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload QR</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Viewfinder Controls Bar (Torch, Flip Camera, Upload Image) */}
          <div className="w-full max-w-[340px] flex items-center justify-between gap-2 mt-3.5">
            {/* Upload image button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingImage}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              {isProcessingImage ? (
                <div className="w-3.5 h-3.5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              )}
              <span>Upload Photo</span>
            </button>

            {/* Switch Camera Button (if multiple cameras exist) */}
            {availableDevices.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                title="Switch Camera (Front/Back)"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}

            {/* Flashlight / Torch toggle (if supported by hardware) */}
            {hasTorch && (
              <button
                type="button"
                onClick={handleToggleTorch}
                className={`p-2.5 rounded-xl transition-colors cursor-pointer ${
                  torchOn
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title={torchOn ? 'Turn Flashlight Off' : 'Turn Flashlight On'}
              >
                {torchOn ? <Zap className="w-4 h-4" /> : <ZapOff className="w-4 h-4" />}
              </button>
            )}
          </div>

          {/* Quick Demo Tester: Sample Cards from Roster */}
          {roster.length > 0 && (
            <div className="w-full max-w-[340px] mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  Quick Test Cards (Simulate Scan)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {roster.slice(0, 4).map((voter) => (
                  <button
                    key={voter.id}
                    type="button"
                    onClick={() => handleSimulateSampleScan(voter)}
                    className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 hover:border-amber-400 dark:hover:border-amber-500 text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-1.5">
                      <IdCard className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                        {voter.voterId}
                      </span>
                    </div>
                    <span className="text-3xs text-slate-500 dark:text-slate-400 block truncate mt-0.5">
                      {voter.fullName}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
          <span className="text-slate-500 dark:text-slate-400 text-2xs">
            Format: Standard QR code with Student ID or JSON badge payload
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Global CSS animation for laser scan line */}
      <style>{`
        @keyframes qr-laser-sweep {
          0% {
            top: 20%;
          }
          100% {
            top: 80%;
          }
        }
      `}</style>
    </div>
  );
};
