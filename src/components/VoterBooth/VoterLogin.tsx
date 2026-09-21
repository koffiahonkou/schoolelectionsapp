import React, { useState } from 'react';
import { ElectionConfig, ElectionStatus, Voter } from '../../types';
import { validateVoterLogin } from '../../utils/normalization';
import { sounds } from '../../utils/audio';
import { ElectionClock } from '../Common/ElectionClock';
import { SchoolLogo } from '../Common/SchoolLogo';
import { CaptchaChallenge } from './CaptchaChallenge';
import { QrScannerModal } from './QrScannerModal';
import { VoterResultsLoginModal } from './VoterResultsLoginModal';
import {
  KeyRound,
  IdCard,
  AlertCircle,
  ArrowRight,
  Sparkles,
  HelpCircle,
  Eye,
  EyeOff,
  ShieldAlert,
  X,
  QrCode,
  ScanLine,
  CheckCircle2,
  BarChart3,
  Lock,
} from 'lucide-react';

interface VoterLoginProps {
  config: ElectionConfig;
  status: ElectionStatus;
  roster: Voter[];
  isPractice: boolean;
  timeoutNotice?: string | null;
  onDismissTimeoutNotice?: () => void;
  onLoginSuccess: (voter: Voter, captchaVerified?: boolean) => void;
  onSwitchToAdmin: () => void;
  onViewResults?: (voter: Voter) => void;
  onAuditLog?: (
    eventType: 'voter_login' | 'voter_login_failed' | 'security_alert' | 'results_accessed',
    details: string,
    category: 'ballot' | 'security' | 'election',
    extra?: { actor?: string; actorRole?: string; metadata?: Record<string, any> }
  ) => void;
}

export const VoterLogin: React.FC<VoterLoginProps> = ({
  config,
  status,
  roster,
  isPractice,
  timeoutNotice,
  onDismissTimeoutNotice,
  onLoginSuccess,
  onSwitchToAdmin,
  onViewResults,
  onAuditLog,
}) => {
  const [voterIdInput, setVoterIdInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCaptchaVerified, setIsCaptchaVerified] = useState(config.enableCaptcha === false);
  const [isQrScannerOpen, setIsQrScannerOpen] = useState(false);
  const [scannedBadgeInfo, setScannedBadgeInfo] = useState<{ voterId: string; name?: string } | null>(null);
  const [isResultsModalOpen, setIsResultsModalOpen] = useState(false);

  const isPollsOpen = status === 'Open' || isPractice;

  const handleVoterIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVoterIdInput(e.target.value);
    if (timeoutNotice && onDismissTimeoutNotice) {
      onDismissTimeoutNotice();
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPinInput(e.target.value);
    if (timeoutNotice && onDismissTimeoutNotice) {
      onDismissTimeoutNotice();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // If official results are published, voters log in with credentials to view results!
    if (status === 'Results Published' && !isPractice) {
      if (config.enableCaptcha !== false && !isCaptchaVerified) {
        setErrorMessage('Please complete the anti-bot security verification challenge before continuing.');
        sounds.playError();
        return;
      }

      const validation = validateVoterLogin(roster, voterIdInput, pinInput, config.requirePin, {
        allowAlreadyVoted: true,
      });

      if (!validation.success) {
        setErrorMessage(validation.message);
        sounds.playError();
        onAuditLog?.(
          'voter_login_failed',
          `Results view login failed: ${validation.message} (Input ID: "${voterIdInput.trim().toUpperCase()}").`,
          'security',
          {
            actor: `Unverified (${voterIdInput.trim().toUpperCase() || 'Empty'})`,
            actorRole: 'Voter',
            metadata: { attemptedId: voterIdInput.trim().toUpperCase(), reason: validation.message },
          }
        );
        return;
      }

      if (validation.voter) {
        sounds.playSuccess();
        if (onViewResults) {
          onViewResults(validation.voter);
        } else {
          onLoginSuccess(validation.voter, isCaptchaVerified);
        }
      }
      return;
    }

    if (!isPollsOpen) {
      if (status === 'Setup') {
        setErrorMessage('Voting has not opened yet. The Electoral Commission is finalizing setup.');
      } else if (status === 'Closed') {
        setErrorMessage('Voting has concluded for this election. Polls are closed. Results will be viewable once published.');
      }
      sounds.playError();
      onAuditLog?.(
        'security_alert',
        `Voter booth login rejected: Polls are currently ${status.toLowerCase()}. Attempted ID: "${voterIdInput.trim().toUpperCase()}".`,
        'security',
        { actor: `Student ID: ${voterIdInput.trim().toUpperCase()}`, actorRole: 'Voter' }
      );
      return;
    }

    if (config.enableCaptcha !== false && !isPractice && !isCaptchaVerified) {
      setErrorMessage('Please complete the anti-bot security verification challenge before continuing.');
      sounds.playError();
      onAuditLog?.(
        'security_alert',
        `Voter booth login blocked: Anti-bot CAPTCHA challenge incomplete for Student ID "${voterIdInput.trim().toUpperCase()}".`,
        'security',
        { actor: `Student ID: ${voterIdInput.trim().toUpperCase()}`, actorRole: 'Voter' }
      );
      return;
    }

    // In practice mode, if roster is empty or student enters any ID, we can create a simulated demo voter
    if (isPractice && roster.length === 0) {
      const demoVoter: Voter = {
        id: 'demo-voter',
        fullName: 'Demo Student Voter',
        voterId: voterIdInput.trim().toUpperCase() || 'PRACTICE1',
        hasVoted: false,
      };
      sounds.playSelect();
      onLoginSuccess(demoVoter, true);
      return;
    }

    const validation = validateVoterLogin(roster, voterIdInput, pinInput, config.requirePin);

    if (!validation.success) {
      setErrorMessage(validation.message);
      sounds.playError();
      const isDuplicate = validation.message.includes('already cast');
      onAuditLog?.(
        isDuplicate ? 'security_alert' : 'voter_login_failed',
        `Voter authentication failed: ${validation.message} (Input ID: "${voterIdInput.trim().toUpperCase()}").`,
        'security',
        {
          actor: `Student ID: ${voterIdInput.trim().toUpperCase() || 'Empty'}`,
          actorRole: 'Voter',
          metadata: { attemptedId: voterIdInput.trim().toUpperCase(), reason: validation.message },
        }
      );
      return;
    }

    if (validation.voter) {
      sounds.playSelect();
      onLoginSuccess(validation.voter, isCaptchaVerified);
    }
  };

  return (
    <div
      id="voter-login-screen"
      className="min-h-[calc(100vh-5rem)] flex items-center justify-center p-4 sm:p-6 transition-colors duration-200"
    >
      <div className="w-full max-w-md bg-white/95 dark:bg-slate-900/90 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200/80 dark:border-slate-800 transition-all relative z-10">
        {/* School Branding & Logo Placeholder */}
        <div id="voter-school-branding" className="flex flex-col items-center justify-center text-center pb-5 mb-5 border-b border-slate-100 dark:border-slate-800">
          <SchoolLogo
            logoUrl={config.logoUrl}
            schoolName={config.schoolName}
            size="lg"
            shape="rounded"
            showPlaceholderBadge={false}
            className="mb-2.5"
          />
          <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
            {config.schoolName || 'Lincoln High School'}
          </h3>
          <p className="text-2xs text-slate-500 dark:text-slate-400 font-medium line-clamp-1 mt-0.5">
            {config.title || 'Student Council General Election'}
          </p>
        </div>

        {/* Booth Badge */}
        <div className="flex items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <span className="p-2 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-xl">
              <IdCard className="w-5 h-5" />
            </span>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                Official Student Ballot
              </span>
              <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                Voter Verification
              </h2>
            </div>
          </div>
          {isPractice && (
            <span className="text-xs font-black uppercase tracking-wider bg-amber-500 text-slate-950 px-2.5 py-1 rounded-full shadow-xs">
              Demo
            </span>
          )}
        </div>

        {/* Official Election Clock (shown to voters if enabled in settings and results not published) */}
        <ElectionClock
          config={config}
          status={status}
          variant="booth"
          forVoters={true}
        />

        {/* Session Inactivity Timeout Notice Banner */}
        {timeoutNotice && (
          <div
            id="session-timeout-notice-banner"
            className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700 text-amber-950 dark:text-amber-100 flex items-start justify-between gap-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-extrabold text-amber-950 dark:text-amber-100 text-xs">
                    Session Inactivity Timeout
                  </span>
                  <span className="text-3xs font-black uppercase px-1.5 py-0.5 rounded bg-amber-200/90 dark:bg-amber-900 text-amber-900 dark:text-amber-200">
                    Security Protection
                  </span>
                </div>
                <p className="text-amber-900/90 dark:text-amber-200/90 font-medium">
                  {timeoutNotice}
                </p>
              </div>
            </div>
            {onDismissTimeoutNotice && (
              <button
                type="button"
                onClick={onDismissTimeoutNotice}
                className="text-amber-700 dark:text-amber-400 hover:text-amber-950 dark:hover:text-white p-1 rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 cursor-pointer shrink-0"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Polls Not Open Banner (Setup or Closed) */}
        {status === 'Setup' && !isPractice && (
          <div
            id="polls-setup-notice-banner"
            className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">
                <Lock className="w-4 h-4" />
              </div>
              <div className="text-xs leading-relaxed">
                <span className="font-extrabold text-amber-950 dark:text-white block text-xs">
                  Voting Has Not Begun (Setup Mode)
                </span>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  The Electoral Commission is in <strong>Setup Mode</strong>. Ballots unlock when polls are officially opened.
                </p>
              </div>
            </div>
            <button
              id="banner-staff-open-polls-btn"
              type="button"
              onClick={onSwitchToAdmin}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-xs transition-colors self-end sm:self-auto"
            >
              Open Polls / Staff Login
            </button>
          </div>
        )}

        {status === 'Closed' && !isPractice && (
          <div
            id="polls-closed-notice-banner"
            className="mb-6 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200 flex items-start gap-3 shadow-xs"
          >
            <div className="p-2 rounded-xl bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-200 shrink-0 mt-0.5">
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-xs leading-relaxed">
              <span className="font-extrabold text-amber-950 dark:text-amber-100 block text-xs">
                Polls Are Currently Closed
              </span>
              <p className="text-amber-900/90 dark:text-amber-200/90 mt-0.5">
                Voting has concluded for this election. Certified official results will be made viewable once published by the Electoral Commission.
              </p>
            </div>
          </div>
        )}

        {/* Results Published Announcement Banner */}
        {status === 'Results Published' && (
          <div
            id="results-published-banner"
            className="mb-6 p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 flex items-start gap-3 shadow-xs"
          >
            <Sparkles className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-extrabold text-emerald-900 dark:text-emerald-200">
                Official Election Results Published
              </p>
              <p className="mt-1 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed">
                Voting has concluded. Enter your Student ID and PIN below to authenticate and view the certified results.
              </p>
            </div>
          </div>
        )}


        {/* Error Notification */}
        {errorMessage && (
          <div
            id="voter-login-error"
            className="mb-6 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 flex items-start gap-3 animate-in fade-in"
          >
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm font-medium leading-snug">
              {errorMessage}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2">
              <label
                htmlFor="voter-id-input"
                className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                Student / Voter ID
              </label>
              <button
                id="open-qr-scanner-btn"
                type="button"
                onClick={() => {
                  setIsQrScannerOpen(true);
                  sounds.playSelect();
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:hover:bg-amber-900 text-amber-900 dark:text-amber-300 text-xs font-bold transition-all shadow-2xs cursor-pointer border border-amber-300/80 dark:border-amber-800"
                title="Scan QR Code from Student ID card"
              >
                <QrCode className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span>Scan ID / QR Code</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="voter-id-input"
                type="text"
                autoFocus
                value={voterIdInput}
                onChange={(e) => {
                  handleVoterIdChange(e);
                  if (errorMessage) setErrorMessage(null);
                  if (scannedBadgeInfo) setScannedBadgeInfo(null);
                }}
                placeholder="e.g. STU101"
                className="w-full px-4 py-3.5 pl-11 pr-24 rounded-2xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 text-base font-bold text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden transition-all"
                required
              />
              <IdCard className="w-5 h-5 text-slate-400 dark:text-slate-500 absolute left-3.5 top-4 pointer-events-none" />

              {/* Inside input quick scanner trigger */}
              <button
                type="button"
                onClick={() => {
                  setIsQrScannerOpen(true);
                  sounds.playSelect();
                }}
                className="absolute right-2.5 top-2.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-100 dark:bg-slate-700 dark:hover:bg-amber-950/70 text-slate-700 hover:text-amber-900 dark:text-slate-200 dark:hover:text-amber-300 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer border border-slate-200 dark:border-slate-600"
                title="Open camera scanner"
              >
                <ScanLine className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">Scan</span>
              </button>
            </div>

            {/* Scanned Badge Notification Pill */}
            {scannedBadgeInfo && (
              <div
                id="scanned-badge-confirmation"
                className="mt-2 p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200 text-xs flex items-center justify-between animate-in fade-in"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Card Scanned: <strong className="font-mono font-bold">{scannedBadgeInfo.voterId}</strong>
                    {scannedBadgeInfo.name ? ` (${scannedBadgeInfo.name})` : ''}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setScannedBadgeInfo(null)}
                  className="text-3xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer ml-2"
                >
                  Clear
                </button>
              </div>
            )}

            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-500" />
              Scan your card QR code or type your Student ID.
            </p>
          </div>

          {config.requirePin && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="voter-pin-input"
                  className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  Access PIN / Security Code
                </label>
                <span className="text-3xs font-semibold text-slate-500 dark:text-slate-400">
                  Assigned 8-digit unique code
                </span>
              </div>
              <div className="relative">
                <input
                  id="voter-pin-input"
                  type={showPin ? 'text' : 'password'}
                  value={pinInput}
                  onChange={(e) => {
                    handlePinChange(e);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. 7K9X2M4P"
                  className="w-full px-4 py-3.5 pl-11 pr-11 rounded-2xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-amber-500 focus:ring-4 focus:ring-amber-500/20 text-base font-mono font-bold text-slate-900 dark:text-white uppercase placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-hidden transition-all tracking-wider"
                />
                <KeyRound className="w-5 h-5 text-slate-400 dark:text-slate-500 absolute left-3.5 top-4 pointer-events-none" />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3.5 top-3.5 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
                  title={showPin ? 'Hide Access PIN' : 'Show Access PIN'}
                >
                  {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}

          {config.enableCaptcha !== false && !isPractice && (
            <div className="pt-1">
              <CaptchaChallenge
                onVerify={(verified) => {
                  setIsCaptchaVerified(verified);
                  if (verified && errorMessage) {
                    setErrorMessage(null);
                  }
                }}
                isVerified={isCaptchaVerified}
              />
            </div>
          )}

          <button
            id="voter-login-submit-btn"
            type="submit"
            className={`w-full mt-2 py-4 px-6 rounded-2xl active:scale-[0.98] font-black text-base shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${
              status === 'Results Published' && !isPractice
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-slate-950'
            }`}
          >
            {status === 'Results Published' && !isPractice ? (
              <>
                <BarChart3 className="w-5 h-5" />
                <span>Log In to View Official Results</span>
              </>
            ) : (
              <>
                <span>Proceed to Ballot</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </button>

          {/* Discreet link to view or check official results status */}
          <div className="pt-2 text-center">
            <button
              id="check-results-status-btn"
              type="button"
              onClick={() => setIsResultsModalOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors cursor-pointer"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>
                {status === 'Results Published'
                  ? 'Alternative: Open Student Results Modal'
                  : 'Check Official Results Publication Status'}
              </span>
            </button>
          </div>
        </form>

        {/* Classroom Instruction Helper */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-start gap-2 text-slate-600 dark:text-slate-400 text-xs">
          <HelpCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
          <p>
            {status === 'Results Published'
              ? 'Results are certified by the Electoral Commission. Voters may authenticate to review winner announcements.'
              : 'Each registered student may submit exactly one ballot. Once submitted, choices cannot be altered.'}
          </p>
        </div>

      </div>

      {/* QR Code / Student ID Card Scanner Modal */}
      <QrScannerModal
        isOpen={isQrScannerOpen}
        onClose={() => setIsQrScannerOpen(false)}
        roster={roster}
        requirePin={config.requirePin}
        onScanSuccess={(result) => {
          setVoterIdInput(result.voterId);
          if (result.pin) {
            setPinInput(result.pin);
          }
          const student = roster.find(
            (v) => v.voterId.toUpperCase() === result.voterId.toUpperCase()
          );
          setScannedBadgeInfo({
            voterId: result.voterId,
            name: student?.fullName,
          });
          if (errorMessage) setErrorMessage(null);
          if (timeoutNotice && onDismissTimeoutNotice) {
            onDismissTimeoutNotice();
          }
        }}
      />

      {/* Voter Official Results Access Modal */}
      <VoterResultsLoginModal
        isOpen={isResultsModalOpen}
        onClose={() => setIsResultsModalOpen(false)}
        config={config}
        status={status}
        roster={roster}
        onSuccess={(voter) => {
          if (onViewResults) {
            onViewResults(voter);
          }
        }}
      />
    </div>
  );
};
