import React, { useState } from 'react';
import { ElectionConfig, ElectionStatus, Voter } from '../../types';
import { validateVoterLogin } from '../../utils/normalization';
import { sounds } from '../../utils/audio';
import { SchoolLogo } from '../Common/SchoolLogo';
import { CaptchaChallenge } from './CaptchaChallenge';
import {
  X,
  IdCard,
  KeyRound,
  Eye,
  EyeOff,
  BarChart3,
  AlertCircle,
  CheckCircle2,
  Lock,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface VoterResultsLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: ElectionConfig;
  status: ElectionStatus;
  roster: Voter[];
  onSuccess: (voter: Voter) => void;
}

export const VoterResultsLoginModal: React.FC<VoterResultsLoginModalProps> = ({
  isOpen,
  onClose,
  config,
  status,
  roster,
  onSuccess,
}) => {
  const [voterIdInput, setVoterIdInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(config.enableCaptcha === false);

  if (!isOpen) return null;

  const isPublished = status === 'Results Published';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isPublished) {
      setErrorMessage(
        'Official election results are not yet published by the Electoral Commission. Please check back after polls close.'
      );
      sounds.playError();
      return;
    }

    if (config.enableCaptcha !== false && !isCaptchaVerified) {
      setErrorMessage('Please complete the anti-bot verification challenge before proceeding.');
      sounds.playError();
      return;
    }

    // Validate credentials, allowing voters who already cast ballots to view results
    const validation = validateVoterLogin(roster, voterIdInput, pinInput, config.requirePin, {
      allowAlreadyVoted: true,
    });

    if (!validation.success) {
      setErrorMessage(validation.message);
      sounds.playError();
      return;
    }

    if (validation.voter) {
      sounds.playSuccess();
      onSuccess(validation.voter);
      onClose();
    }
  };

  return (
    <div
      id="voter-results-modal-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="voter-results-modal-card"
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 mb-8 animate-in fade-in slide-in-from-top-4 duration-150 transition-colors"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <SchoolLogo
              logoUrl={config.logoUrl}
              schoolName={config.schoolName}
              size="md"
              shape="rounded"
              className="shrink-0"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-3xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Student Results Access
                </span>
              </div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                View Official Results
              </h2>
            </div>
          </div>
          <button
            id="voter-results-modal-close-btn"
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status notice when NOT published */}
        {!isPublished ? (
          <div className="py-6 space-y-4 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-200 dark:border-amber-800 shadow-2xs">
              <Lock className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Results Not Yet Published
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed px-2">
                The Electoral Commission has not yet certified and published official results.
                Polls are currently in <strong className="text-slate-900 dark:text-slate-200">{status}</strong> state.
                Please check back once official results are declared.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold transition-colors cursor-pointer"
            >
              Return to Election Station
            </button>
          </div>
        ) : (
          /* Form when published */
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-2xl flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="text-xs text-emerald-900 dark:text-emerald-200">
                <strong>Certified Results Available:</strong> Enter your registered student ID and PIN to access the official election tallies and winner announcements.
              </div>
            </div>

            {/* Error Message */}
            {errorMessage && (
              <div
                id="voter-results-error-msg"
                className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-start gap-2.5 animate-shake text-rose-800 dark:text-rose-200 text-xs"
              >
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Voter ID Input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                Voter / Student ID
              </label>
              <div className="relative">
                <input
                  id="voter-results-id-input"
                  type="text"
                  required
                  autoFocus
                  value={voterIdInput}
                  onChange={(e) => setVoterIdInput(e.target.value)}
                  placeholder="e.g. STU101 or 2026-0042"
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-all"
                />
                <IdCard className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* PIN Input (if required by configuration) */}
            {config.requirePin && (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Assigned Passcode / Security PIN
                </label>
                <div className="relative">
                  <input
                    id="voter-results-pin-input"
                    type={showPin ? 'text' : 'password'}
                    required
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    placeholder="Enter assigned PIN"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden transition-all"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                  >
                    {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Anti-Bot Captcha (if enabled) */}
            {config.enableCaptcha !== false && (
              <CaptchaChallenge
                onVerify={(verified) => {
                  setIsCaptchaVerified(verified);
                  if (verified && errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                isVerified={isCaptchaVerified}
              />
            )}

            {/* Submit Button */}
            <button
              id="voter-results-submit-btn"
              type="submit"
              className="w-full py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer mt-2"
            >
              <BarChart3 className="w-4 h-4" />
              <span>Unlock & View Official Results</span>
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
