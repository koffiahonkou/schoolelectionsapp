import React, { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, Volume2, ShieldCheck, CheckCircle2, AlertCircle, Bot, Sparkles, Calculator } from 'lucide-react';
import { sounds } from '../../utils/audio';

interface CaptchaChallengeProps {
  onVerify?: (isVerified: boolean) => void;
  onVerifiedChange?: (isVerified: boolean) => void;
  isVerified?: boolean;
  disabled?: boolean;
}

export const CaptchaChallenge: React.FC<CaptchaChallengeProps> = ({
  onVerify,
  onVerifiedChange,
  isVerified = false,
  disabled = false,
}) => {
  const [captchaType, setCaptchaType] = useState<'visual' | 'math'>('visual');
  const [captchaCode, setCaptchaCode] = useState('');
  const [mathProblem, setMathProblem] = useState<{ question: string; answer: number }>({ question: '4 + 5', answer: 9 });
  const [inputVal, setInputVal] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const notifyVerification = useCallback(
    (verified: boolean) => {
      if (typeof onVerify === 'function') {
        onVerify(verified);
      }
      if (typeof onVerifiedChange === 'function') {
        onVerifiedChange(verified);
      }
    },
    [onVerify, onVerifiedChange]
  );

  // Generate random visual code
  const generateVisualCaptcha = useCallback(() => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setCaptchaCode(code);
    setInputVal('');
    setError(null);
    if (isVerified) {
      notifyVerification(false);
    }
    return code;
  }, [isVerified, notifyVerification]);

  // Generate simple math problem
  const generateMathProblem = useCallback(() => {
    const a = Math.floor(Math.random() * 9) + 2;
    const b = Math.floor(Math.random() * 8) + 1;
    const isSub = Math.random() > 0.5 && a > b;
    const question = isSub ? `${a} − ${b}` : `${a} + ${b}`;
    const answer = isSub ? a - b : a + b;
    setMathProblem({ question, answer });
    setInputVal('');
    setError(null);
    if (isVerified) {
      notifyVerification(false);
    }
  }, [isVerified, notifyVerification]);

  // Draw captcha on canvas
  const drawCaptcha = useCallback((code: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, width, height);
    bgGradient.addColorStop(0, '#f1f5f9');
    bgGradient.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Background interference lines
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width, Math.random() * height,
        Math.random() * width, Math.random() * height,
        Math.random() * width, Math.random() * height
      );
      ctx.strokeStyle = `hsla(${Math.random() * 360}, 60%, 65%, 0.45)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Noise dots
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = `hsla(${Math.random() * 360}, 50%, 60%, 0.4)`;
      ctx.beginPath();
      ctx.arc(Math.random() * width, Math.random() * height, Math.random() * 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw characters with rotation and distinct colors
    const charSpacing = width / (code.length + 1);
    ctx.font = 'bold 24px monospace';
    ctx.textBaseline = 'middle';

    const colors = ['#1e293b', '#0f172a', '#334155', '#475569', '#0284c7'];

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      const x = (i + 1) * charSpacing - 6;
      const y = height / 2 + (Math.random() * 6 - 3);
      const angle = (Math.random() * 26 - 13) * (Math.PI / 180);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = colors[i % colors.length];
      ctx.shadowColor = 'rgba(0, 0, 0, 0.15)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(char, 0, 0);
      ctx.restore();
    }
  }, []);

  // Initial setup
  useEffect(() => {
    if (captchaType === 'visual') {
      const code = generateVisualCaptcha();
      setTimeout(() => drawCaptcha(code), 50);
    } else {
      generateMathProblem();
    }
  }, [captchaType]);

  // Redraw when code changes
  useEffect(() => {
    if (captchaType === 'visual' && captchaCode) {
      drawCaptcha(captchaCode);
    }
  }, [captchaCode, captchaType, drawCaptcha]);

  const handleRefresh = () => {
    sounds.playSelect();
    if (captchaType === 'visual') {
      const code = generateVisualCaptcha();
      drawCaptcha(code);
    } else {
      generateMathProblem();
    }
  };

  const handleSpeak = () => {
    if (!('speechSynthesis' in window)) {
      alert('Speech synthesis is not supported on this browser.');
      return;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    const textToSpeak =
      captchaType === 'visual'
        ? `Security verification code: ${captchaCode.split('').join(', ')}`
        : `Solve this math problem: What is ${mathProblem.question}?`;

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.85;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const handleVerify = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (disabled || isVerified) return;

    const cleanInput = inputVal.trim().toUpperCase();
    let passed = false;

    if (captchaType === 'visual') {
      passed = cleanInput === captchaCode.toUpperCase();
    } else {
      passed = parseInt(cleanInput, 10) === mathProblem.answer;
    }

    if (passed) {
      sounds.playSuccess();
      setError(null);
      notifyVerification(true);
    } else {
      sounds.playError();
      setError(
        captchaType === 'visual'
          ? 'Incorrect security code. Please try again.'
          : 'Incorrect answer. Please solve the calculation to continue.'
      );
      notifyVerification(false);
      handleRefresh();
    }
  };

  // Auto-verify when correct length is typed
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);
    if (error) setError(null);

    const clean = val.trim().toUpperCase();
    if (captchaType === 'visual' && clean.length === captchaCode.length) {
      if (clean === captchaCode.toUpperCase()) {
        sounds.playSuccess();
        setError(null);
        notifyVerification(true);
      }
    } else if (captchaType === 'math' && clean.length > 0) {
      if (parseInt(clean, 10) === mathProblem.answer) {
        sounds.playSuccess();
        setError(null);
        notifyVerification(true);
      }
    }
  };

  return (
    <div
      id="anti-bot-captcha-container"
      className={`p-4 rounded-2xl border transition-all ${
        isVerified
          ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg ${
              isVerified
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            {isVerified ? <CheckCircle2 className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
          </div>
          <div>
            <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
              Bot Mitigation Firewall
            </span>
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
              {isVerified ? 'Human Verification Passed' : 'Security Verification (Anti-Bot)'}
            </h4>
          </div>
        </div>

        {!isVerified && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setCaptchaType((prev) => (prev === 'visual' ? 'math' : 'visual'));
              }}
              title={captchaType === 'visual' ? 'Switch to Math Challenge' : 'Switch to Visual Code'}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer text-3xs font-bold flex items-center gap-1"
            >
              {captchaType === 'visual' ? (
                <>
                  <Calculator className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">Math</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span className="hidden sm:inline">Code</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleSpeak}
              disabled={isSpeaking}
              title="Read security challenge aloud"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse text-indigo-600' : ''}`} />
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              title="Generate new challenge"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {isVerified ? (
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-100/60 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Identity confirmed: Real student browser verified.</span>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            className="text-3xs text-emerald-700 dark:text-emerald-400 underline hover:opacity-80 cursor-pointer ml-2"
          >
            Reset
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Challenge Display & Control Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              {/* Visual Canvas or Math Display */}
              {captchaType === 'visual' ? (
                <div className="relative border-2 border-slate-300 dark:border-slate-700 rounded-2xl overflow-hidden shadow-2xs shrink-0 bg-white flex items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    width={150}
                    height={46}
                    className="block cursor-pointer select-none"
                    onClick={handleRefresh}
                    title="Click to refresh image"
                  />
                </div>
              ) : (
                <div className="w-[150px] h-[46px] bg-indigo-50 dark:bg-indigo-950/70 border-2 border-indigo-200 dark:border-indigo-800 rounded-2xl flex items-center justify-center font-mono font-black text-xl text-indigo-900 dark:text-indigo-200 tracking-wider shadow-2xs shrink-0 select-none">
                  {mathProblem.question} = ?
                </div>
              )}

              {/* Mobile / Tablet Quick Helper Badges */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleSpeak}
                  disabled={isSpeaking}
                  title="Read security challenge aloud"
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <Volume2 className={`w-4 h-4 ${isSpeaking ? 'animate-pulse text-indigo-600' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={handleRefresh}
                  title="Generate new challenge"
                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            </div>

            <span className="text-3xs text-slate-600 dark:text-slate-400">
              {captchaType === 'visual' ? 'Type the 5 characters shown' : 'Solve the simple addition / subtraction'}
            </span>
          </div>

          {/* Input Box & Verify Button - Full Width on Mobile with Large Touch Targets */}
          <div className="flex items-stretch gap-2 w-full">
            <div className="flex-1 min-w-0">
              <input
                id="captcha-verification-input"
                type="text"
                value={inputVal}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleVerify();
                  }
                }}
                disabled={disabled}
                placeholder={captchaType === 'visual' ? 'Enter 5-character code' : 'Answer'}
                maxLength={6}
                className="w-full px-4 py-3 sm:py-2.5 rounded-xl border-2 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono font-bold text-base sm:text-sm tracking-widest uppercase placeholder:text-slate-400 dark:placeholder:text-slate-500 placeholder:normal-case placeholder:tracking-normal placeholder:font-normal placeholder:text-xs sm:placeholder:text-sm focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-4 focus:ring-indigo-600/15 outline-hidden transition-all text-center min-h-[44px]"
              />
            </div>

            <button
              type="button"
              id="captcha-verify-btn"
              onClick={() => handleVerify()}
              disabled={disabled || !inputVal.trim()}
              className="px-5 py-3 sm:py-2.5 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 disabled:opacity-40 text-white text-xs sm:text-sm font-black transition-all shadow-xs cursor-pointer shrink-0 min-h-[44px] flex items-center justify-center"
            >
              Verify
            </button>
          </div>

          {error && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
