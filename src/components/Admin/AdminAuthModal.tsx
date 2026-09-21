import React, { useState, useEffect } from 'react';
import { UserAccount } from '../../types';
import {
  Lock,
  ShieldCheck,
  X,
  AlertCircle,
  KeyRound,
  Smartphone,
  Sparkles,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  ShieldAlert,
  Fingerprint,
} from 'lucide-react';
import { sounds } from '../../utils/audio';
import { generateTotpCode, verifyTotpCode } from '../../utils/totp';

interface AdminAuthModalProps {
  isOpen: boolean;
  expectedPin: string;
  accounts?: UserAccount[];
  onSuccess: (account?: UserAccount) => void;
  onCancel: () => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  expectedPin,
  accounts = [],
  onSuccess,
  onCancel,
}) => {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(
    accounts[0]?.id || ''
  );
  const [pinInput, setPinInput] = useState('');
  const [authMode, setAuthMode] = useState<'account' | 'pin'>('account');
  const [step, setStep] = useState<'credentials' | '2fa'>('credentials');
  const [twoFactorInput, setTwoFactorInput] = useState('');
  const [pendingAccount, setPendingAccount] = useState<UserAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [totpInfo, setTotpInfo] = useState<{ code: string; secondsRemaining: number }>({
    code: '123456',
    secondsRemaining: 30,
  });
  const [showBackupInput, setShowBackupInput] = useState(false);

  // Sync selectedAccountId if accounts change
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccountId) {
      setSelectedAccountId(accounts[0].id);
    }
  }, [accounts, selectedAccountId]);

  // Active TOTP ticker for 2FA step
  useEffect(() => {
    if (step !== '2fa' || !pendingAccount) return;

    const secret = pendingAccount.twoFactorSecret || 'DEFAULT-SECRET-2026';
    const updateCode = () => {
      setTotpInfo(generateTotpCode(secret));
    };

    updateCode();
    const interval = setInterval(updateCode, 1000);
    return () => clearInterval(interval);
  }, [step, pendingAccount]);

  if (!isOpen) return null;

  const currentSelectedAccount = accounts.find((a) => a.id === selectedAccountId);

  const resetModalState = () => {
    setPinInput('');
    setTwoFactorInput('');
    setStep('credentials');
    setPendingAccount(null);
    setError(null);
    setShowBackupInput(false);
  };

  const handleClose = () => {
    resetModalState();
    onCancel();
  };

  // Step 1: Check password / PIN
  const handleCredentialsSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (authMode === 'account' && currentSelectedAccount) {
      const isPinMatch =
        pinInput.trim() === currentSelectedAccount.passwordPin.trim() ||
        pinInput.trim() === expectedPin.trim();

      if (isPinMatch) {
        // Check if Two-Factor Authentication is enabled for this account
        if (currentSelectedAccount.twoFactorEnabled) {
          sounds.playSelect();
          setPendingAccount(currentSelectedAccount);
          setStep('2fa');
          setError(null);
          return;
        }

        // Direct success if 2FA is not enabled
        sounds.playSuccess();
        resetModalState();
        onSuccess(currentSelectedAccount);
        return;
      } else {
        setError(`Incorrect password/PIN for ${currentSelectedAccount.fullName}.`);
        sounds.playError();
        return;
      }
    }

    // Direct Master PIN mode
    if (pinInput.trim() === expectedPin.trim()) {
      sounds.playSuccess();
      const defaultCommissioner = accounts.find((a) => a.role === 'Electoral Commissioner');
      resetModalState();
      onSuccess(defaultCommissioner);
    } else {
      setError('Incorrect Administrator PIN. Please try again.');
      sounds.playError();
    }
  };

  // Step 2: Verify Two-Factor Authentication (TOTP or Backup Code)
  const handleTwoFactorSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingAccount) return;

    const secret = pendingAccount.twoFactorSecret || 'DEFAULT-SECRET-2026';
    const backupCodes = pendingAccount.twoFactorBackupCodes || ['BACKUP-8841', 'EMERGENCY-2026'];

    const result = verifyTotpCode(twoFactorInput, secret, backupCodes);

    if (result.valid) {
      sounds.playSuccess();
      const verifiedAccount = pendingAccount;
      resetModalState();
      onSuccess(verifiedAccount);
    } else {
      sounds.playError();
      setError(
        showBackupInput
          ? 'Invalid backup recovery code. Please check code format (e.g. BACKUP-8841).'
          : 'Invalid 6-digit authentication code. Please check your authenticator or enter the live token.'
      );
    }
  };

  // Helper: Quick autofill current TOTP for frictionless testing
  const handleAutofillTotp = () => {
    sounds.playSelect();
    setTwoFactorInput(totpInfo.code);
    setError(null);
  };

  return (
    <div
      id="admin-auth-modal"
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-150 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-slate-900 dark:bg-indigo-600 text-white shadow-xs">
              {step === '2fa' ? <Fingerprint className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {step === '2fa' ? 'Second-Factor Verification' : 'Staff Authentication'}
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {step === '2fa' ? 'Two-Factor Authentication' : 'Commission Sign-In'}
              </h3>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* STEP 1: CREDENTIALS SCREEN */}
        {step === 'credentials' && (
          <>
            {/* Tab switch between Account Login and Master PIN */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mb-4 text-xs font-bold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('account');
                  setError(null);
                }}
                className={`w-1/2 py-2 rounded-lg transition-all cursor-pointer ${
                  authMode === 'account'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Staff Officer Account
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('pin');
                  setError(null);
                }}
                className={`w-1/2 py-2 rounded-lg transition-all cursor-pointer ${
                  authMode === 'pin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Master Commission PIN
              </button>
            </div>

            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              {authMode === 'account' ? (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                      Staff Member & Role
                    </label>
                    <select
                      value={selectedAccountId}
                      onChange={(e) => {
                        setSelectedAccountId(e.target.value);
                        setError(null);
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-sm font-bold text-slate-900 dark:text-white focus:border-slate-900 dark:focus:border-indigo-500 focus:ring-2 focus:ring-slate-900/10 outline-hidden bg-white dark:bg-slate-800"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.fullName} ({acc.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  {currentSelectedAccount && (
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-2xs space-y-1.5">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                        <span>Role: <strong className="text-slate-900 dark:text-white">{currentSelectedAccount.role}</strong></span>
                        <span className="text-slate-500 dark:text-slate-400">Account: <strong className="text-slate-700 dark:text-slate-300 font-mono">@{currentSelectedAccount.username}</strong></span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                        <span className="text-3xs uppercase font-bold text-slate-400">2FA Security Status:</span>
                        <span
                          className={`inline-flex items-center gap-1 font-bold text-3xs px-2 py-0.5 rounded-full ${
                            currentSelectedAccount.twoFactorEnabled
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <ShieldCheck className="w-3 h-3" />
                          {currentSelectedAccount.twoFactorEnabled ? '2FA Enforced (Active)' : '2FA Disabled'}
                        </span>
                      </div>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="admin-pin-input"
                      className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1"
                    >
                      Enter Account Password / PIN
                    </label>
                    <input
                      id="admin-pin-input"
                      type="password"
                      autoFocus
                      value={pinInput}
                      onChange={(e) => {
                        setPinInput(e.target.value);
                        if (error) setError(null);
                      }}
                      placeholder="Enter PIN"
                      className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-slate-900 dark:focus:border-indigo-500 focus:ring-2 focus:ring-slate-900/10 text-center text-base font-bold tracking-widest text-slate-900 dark:text-white outline-hidden transition-all font-mono"
                      required
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label
                    htmlFor="admin-pin-input-master"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1"
                  >
                    Master Administrator PIN
                  </label>
                  <input
                    id="admin-pin-input-master"
                    type="password"
                    autoFocus
                    value={pinInput}
                    onChange={(e) => {
                      setPinInput(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder="Enter PIN"
                    className="w-full px-4 py-2.5 rounded-xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-slate-900 dark:focus:border-indigo-500 focus:ring-2 focus:ring-slate-900/10 text-center text-base font-bold tracking-widest text-slate-900 dark:text-white outline-hidden transition-all font-mono"
                    required
                  />
                  <p className="mt-1.5 text-2xs text-slate-400 text-center">
                    Enter the authorized Master Commission Security PIN.
                  </p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  id="admin-auth-submit-btn"
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-white bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{currentSelectedAccount?.twoFactorEnabled ? 'Next: Verify 2FA' : 'Unlock Admin'}</span>
                </button>
              </div>
            </form>
          </>
        )}

        {/* STEP 2: TWO-FACTOR AUTHENTICATION (2FA) SCREEN */}
        {step === '2fa' && pendingAccount && (
          <form onSubmit={handleTwoFactorSubmit} className="space-y-4 animate-in fade-in duration-200">
            {/* Identity Banner */}
            <div className="p-3.5 rounded-2xl bg-indigo-50/80 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between">
              <div>
                <span className="text-3xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block">
                  Authenticating As
                </span>
                <span className="font-bold text-xs text-slate-900 dark:text-white">
                  {pendingAccount.fullName}
                </span>
                <span className="block text-2xs text-slate-500 dark:text-slate-400">
                  {pendingAccount.role}
                </span>
              </div>
              <span className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-3xs font-black uppercase tracking-wider shadow-2xs flex items-center gap-1">
                <Smartphone className="w-3 h-3" />
                2FA Enabled
              </span>
            </div>

            {/* TOTP Live Simulation Banner */}
            <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2">
              <div className="flex items-center justify-between text-2xs text-slate-400 font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-indigo-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Live Authenticator Token
                </span>
                <span className="font-mono text-amber-400">{totpInfo.secondsRemaining}s</span>
              </div>

              <div className="flex items-center justify-between">
                <div className="font-mono text-2xl font-black tracking-widest text-emerald-400">
                  {totpInfo.code.slice(0, 3)} {totpInfo.code.slice(3)}
                </div>
                <button
                  type="button"
                  onClick={handleAutofillTotp}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-2xs font-bold transition-colors cursor-pointer border border-slate-700 flex items-center gap-1"
                >
                  <ArrowRight className="w-3 h-3 text-indigo-400" />
                  Auto-fill Token
                </button>
              </div>

              {/* Progress bar countdown */}
              <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-1000 ease-linear"
                  style={{ width: `${(totpInfo.secondsRemaining / 30) * 100}%` }}
                />
              </div>
            </div>

            {/* Code Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {showBackupInput ? 'Enter Recovery Backup Code' : 'Enter 6-Digit Authenticator Code'}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setShowBackupInput(!showBackupInput);
                    setTwoFactorInput('');
                    setError(null);
                  }}
                  className="text-3xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold cursor-pointer"
                >
                  {showBackupInput ? 'Use TOTP Code' : 'Use Backup Code'}
                </button>
              </div>

              <input
                id="two-factor-code-input"
                type="text"
                autoFocus
                value={twoFactorInput}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setTwoFactorInput(val);
                  if (error) setError(null);
                }}
                placeholder={showBackupInput ? 'e.g. BACKUP-8841' : '000 000'}
                maxLength={showBackupInput ? 16 : 7}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-200 dark:border-slate-700 dark:bg-slate-800 focus:border-indigo-600 dark:focus:border-indigo-400 focus:ring-4 focus:ring-indigo-600/10 text-center text-lg font-bold font-mono tracking-widest text-slate-900 dark:text-white outline-hidden transition-all"
                required
              />

              {showBackupInput ? (
                <p className="mt-1.5 text-2xs text-slate-500 dark:text-slate-400">
                  Example registered backup code: <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">BACKUP-8841</code> or <code className="font-mono font-bold text-indigo-600 dark:text-indigo-400">EMERGENCY-2026</code>
                </p>
              ) : (
                <p className="mt-1.5 text-2xs text-slate-500 dark:text-slate-400 text-center">
                  Enter the 6 digits generated by your mobile authenticator app.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setStep('credentials')}
                className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                &larr; Back
              </button>
              <button
                id="verify-2fa-submit-btn"
                type="submit"
                disabled={!twoFactorInput.trim()}
                className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Sign In</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
