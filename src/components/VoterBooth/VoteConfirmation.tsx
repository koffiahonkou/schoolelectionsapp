import React, { useEffect, useState, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { CheckCircle, ShieldCheck, ArrowRight, Clock, Sparkles } from 'lucide-react';

interface VoteConfirmationProps {
  voterName: string;
  isPractice: boolean;
  onFinish: () => void;
}

export const VoteConfirmation: React.FC<VoteConfirmationProps> = ({
  voterName,
  isPractice,
  onFinish,
}) => {
  const [countdown, setCountdown] = useState(8);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;
  const hasFinishedRef = useRef(false);

  const handleFinish = useCallback(() => {
    if (hasFinishedRef.current) return;
    hasFinishedRef.current = true;
    onFinishRef.current();
  }, []);

  useEffect(() => {
    // Fire confetti celebration
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#f59e0b', '#10b981', '#6366f1', '#ec4899', '#3b82f6'],
      });
    } catch {
      // ignore
    }

    const timer = setInterval(() => {
      setCountdown((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (countdown === 0) {
      handleFinish();
    }
  }, [countdown, handleFinish]);

  return (
    <div
      id="vote-confirmation-screen"
      className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6 transition-colors duration-200"
    >
      <div className="w-full max-w-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-3xl p-8 sm:p-10 shadow-2xl border border-emerald-100/80 dark:border-slate-800 text-center animate-in fade-in zoom-in-95 duration-200 transition-colors relative z-10">
        {/* Success Icon */}
        <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6 shadow-xs border-2 border-emerald-200 dark:border-emerald-800">
          <CheckCircle className="w-12 h-12 stroke-[2.2]" />
        </div>

        {isPractice ? (
          <span className="inline-block text-xs font-black uppercase tracking-wider bg-amber-500 text-slate-950 px-3 py-1 rounded-full mb-3">
            Demo Ballot Cast (Not Counted in Official Tally)
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 px-3 py-1 rounded-full mb-3 border border-emerald-300 dark:border-emerald-800">
            <Sparkles className="w-3.5 h-3.5" />
            Official Vote Successfully Recorded
          </span>
        )}

        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
          Thank You, {voterName}!
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          Your ballot has been deposited into the confidential electronic ballot box.
        </p>

        {/* Security & Secret Ballot Card */}
        <div className="mt-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-left flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong className="text-slate-800 dark:text-slate-200 font-semibold block mb-0.5">
              Secret Ballot Protection
            </strong>
            Your vote choices were stripped of all student identifying information and saved
            separately. Your roster entry only reflects that you participated.
          </div>
        </div>

        {/* Auto Return Countdown Indicator */}
        <div className="mt-8 flex items-center justify-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
          <Clock className="w-4 h-4 text-amber-500" />
          <span>
            Returning to booth login for the next voter in{' '}
            <span className="text-amber-700 dark:text-amber-400 font-black">{countdown}s</span>...
          </span>
        </div>

        {/* Next Voter Immediate Button */}
        <button
          id="next-voter-btn"
          type="button"
          onClick={handleFinish}
          className="mt-4 w-full py-4 px-6 rounded-2xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-slate-950 font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          <span>Done / Next Student Voter</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
