import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ABSTAIN_SELECTION,
  Candidate,
  Position,
  Voter,
} from '../../types';
import { getCandidateColor, getCandidateInitials } from '../../utils/avatar';
import { sounds } from '../../utils/audio';
import { ManifestoModal } from '../Common/ManifestoModal';
import { ConfirmModal } from '../Common/ConfirmModal';
import {
  CheckCircle2,
  Circle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  Send,
  LogOut,
  Sparkles,
  Info,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  Clock,
  RotateCcw,
  X,
} from 'lucide-react';

const IDLE_TIMEOUT_SECONDS = 180; // 3 minutes = 180 seconds
const WARNING_THRESHOLD_SECONDS = 45; // Show warning modal when 45 seconds remain

// --- Local Storage Autosave Helpers ---
export const getBallotAutosaveKey = (voterId: string): string => {
  return `school_election_ballot_draft_${voterId.trim().toUpperCase()}`;
};

export interface BallotAutosaveDraft {
  voterId: string;
  choices: Record<string, string>;
  activePosIndex: number;
  lastSavedAt: number;
}

export const loadBallotAutosave = (
  voterId: string,
  positions: Position[]
): { choices: Record<string, string>; activePosIndex: number; lastSavedAt: number } | null => {
  try {
    const raw = localStorage.getItem(getBallotAutosaveKey(voterId));
    if (!raw) return null;

    const data: BallotAutosaveDraft = JSON.parse(raw);
    if (!data || typeof data.choices !== 'object') return null;

    // Reject stale drafts older than 6 hours
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    if (data.lastSavedAt && Date.now() - data.lastSavedAt > SIX_HOURS_MS) {
      localStorage.removeItem(getBallotAutosaveKey(voterId));
      return null;
    }

    // Only keep choices for positions that currently exist on the ballot
    const validPositionIds = new Set(positions.map((p) => p.id));
    const validChoices: Record<string, string> = {};
    for (const [posId, choiceVal] of Object.entries(data.choices)) {
      if (validPositionIds.has(posId) && typeof choiceVal === 'string') {
        validChoices[posId] = choiceVal;
      }
    }

    let validIndex = 0;
    if (
      typeof data.activePosIndex === 'number' &&
      data.activePosIndex >= 0 &&
      data.activePosIndex < positions.length
    ) {
      validIndex = data.activePosIndex;
    }

    return {
      choices: validChoices,
      activePosIndex: validIndex,
      lastSavedAt: data.lastSavedAt || Date.now(),
    };
  } catch (err) {
    console.warn('Error reading ballot autosave from localStorage:', err);
    return null;
  }
};

export const clearBallotAutosave = (voterId: string): void => {
  try {
    localStorage.removeItem(getBallotAutosaveKey(voterId));
  } catch (err) {
    console.warn('Error clearing ballot autosave from localStorage:', err);
  }
};

interface BallotViewProps {
  voter: Voter;
  positions: Position[];
  candidates: Candidate[];
  isPractice: boolean;
  onReviewBallot: (choices: Record<string, string>) => void;
  onCancel: () => void;
  onSessionTimeout?: () => void;
}

export const BallotView: React.FC<BallotViewProps> = ({
  voter,
  positions,
  candidates,
  isPractice,
  onReviewBallot,
  onCancel,
  onSessionTimeout,
}) => {
  // Sort positions by order
  const sortedPositions = [...positions].sort((a, b) => a.order - b.order);

  // Check and restore existing autosaved draft from localStorage on initial render
  const initialAutosaveRef = useRef<{
    choices: Record<string, string>;
    activePosIndex: number;
    lastSavedAt: number;
  } | null>(null);

  if (initialAutosaveRef.current === null) {
    initialAutosaveRef.current = loadBallotAutosave(voter.voterId, sortedPositions);
  }

  const initialDraft = initialAutosaveRef.current;
  const hasInitialDraft = !!(initialDraft && Object.keys(initialDraft.choices).length > 0);

  const [activePosIndex, setActivePosIndex] = useState<number>(() => {
    return initialDraft?.activePosIndex ?? 0;
  });

  // choices: positionId -> candidateId OR '__ABSTAIN__'
  const [choices, setChoices] = useState<Record<string, string>>(() => {
    return initialDraft?.choices ?? {};
  });

  const [lastSavedTimestamp, setLastSavedTimestamp] = useState<number | null>(() => {
    return initialDraft?.lastSavedAt ?? null;
  });

  const [showRestoredNotice, setShowRestoredNotice] = useState<boolean>(hasInitialDraft);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [manifestoCandidate, setManifestoCandidate] = useState<Candidate | null>(null);

  // Autosave to localStorage whenever choices or active position changes
  useEffect(() => {
    if (Object.keys(choices).length > 0) {
      try {
        const now = Date.now();
        const payload: BallotAutosaveDraft = {
          voterId: voter.voterId,
          choices,
          activePosIndex,
          lastSavedAt: now,
        };
        localStorage.setItem(getBallotAutosaveKey(voter.voterId), JSON.stringify(payload));
        setLastSavedTimestamp(now);
      } catch (err) {
        console.warn('Failed to autosave ballot choices to localStorage:', err);
      }
    }
  }, [choices, activePosIndex, voter.voterId]);

  // Handler to clear draft choices completely
  const handleClearDraft = () => {
    setChoices({});
    setActivePosIndex(0);
    clearBallotAutosave(voter.voterId);
    setLastSavedTimestamp(null);
    setShowRestoredNotice(false);
    sounds.playSelect();
  };

  // Handler to cancel voting session safely
  const handleInitiateCancel = () => {
    if (Object.keys(choices).length > 0) {
      setIsCancelConfirmOpen(true);
    } else {
      clearBallotAutosave(voter.voterId);
      onCancel();
    }
  };

  const handleConfirmCancel = () => {
    clearBallotAutosave(voter.voterId);
    setIsCancelConfirmOpen(false);
    onCancel();
  };

  // 3-Minute Idle Security Session Timeout State
  const [secondsRemaining, setSecondsRemaining] = useState<number>(IDLE_TIMEOUT_SECONDS);
  const [isWarningModalOpen, setIsWarningModalOpen] = useState<boolean>(false);
  const lastActivityRef = useRef<number>(Date.now());
  const warningChimePlayedRef = useRef<boolean>(false);
  const isWarningModalOpenRef = useRef<boolean>(false);

  // Keep ref synchronized with state for event listeners
  useEffect(() => {
    isWarningModalOpenRef.current = isWarningModalOpen;
  }, [isWarningModalOpen]);

  // Reset user activity timer
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    setSecondsRemaining(IDLE_TIMEOUT_SECONDS);
    setIsWarningModalOpen(false);
    warningChimePlayedRef.current = false;
  }, []);

  // Monitor idle activity across window events
  useEffect(() => {
    let throttleTimeout: NodeJS.Timeout | null = null;

    const handleGlobalActivity = (e: Event) => {
      // If warning modal is open, require explicit interaction (click or keypress)
      if (isWarningModalOpenRef.current) {
        if (e.type === 'keydown') {
          resetActivityTimer();
        }
        return;
      }

      if (!throttleTimeout) {
        throttleTimeout = setTimeout(() => {
          lastActivityRef.current = Date.now();
          throttleTimeout = null;
        }, 400);
      }
    };

    const activityEvents = [
      'mousedown',
      'mousemove',
      'keydown',
      'touchstart',
      'touchmove',
      'scroll',
      'click',
    ];

    activityEvents.forEach((evt) => {
      window.addEventListener(evt, handleGlobalActivity, { passive: true });
    });

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSeconds = Math.floor((now - lastActivityRef.current) / 1000);
      const remaining = Math.max(0, IDLE_TIMEOUT_SECONDS - elapsedSeconds);

      setSecondsRemaining(remaining);

      // Warning threshold reached (45 seconds or less remaining)
      if (remaining <= WARNING_THRESHOLD_SECONDS && remaining > 0) {
        setIsWarningModalOpen(true);
        if (!warningChimePlayedRef.current) {
          sounds.playAlert();
          warningChimePlayedRef.current = true;
        }
      } else if (remaining > WARNING_THRESHOLD_SECONDS) {
        setIsWarningModalOpen(false);
        warningChimePlayedRef.current = false;
      }

      // Timeout expired (full 3 minutes reached)
      if (remaining <= 0) {
        clearInterval(intervalId);
        if (onSessionTimeout) {
          onSessionTimeout();
        } else {
          onCancel();
        }
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
      if (throttleTimeout) clearTimeout(throttleTimeout);
      activityEvents.forEach((evt) => {
        window.removeEventListener(evt, handleGlobalActivity);
      });
    };
  }, [onSessionTimeout, onCancel, resetActivityTimer]);

  const currentPosition = sortedPositions[activePosIndex];
  const currentCandidates = currentPosition
    ? candidates.filter((c) => c.positionId === currentPosition.id)
    : [];

  const handleSelectCandidate = (candidateId: string) => {
    if (!currentPosition) return;
    setChoices((prev) => ({
      ...prev,
      [currentPosition.id]: candidateId,
    }));
    sounds.playSelect();
  };

  const handleSelectAbstain = () => {
    if (!currentPosition) return;
    setChoices((prev) => ({
      ...prev,
      [currentPosition.id]: ABSTAIN_SELECTION,
    }));
    sounds.playSelect();
  };

  const currentChoice = currentPosition ? choices[currentPosition.id] : undefined;
  const hasSelectedCurrentOption = currentChoice !== undefined;

  const isLastPosition = activePosIndex === sortedPositions.length - 1;
  const isFirstPosition = activePosIndex === 0;

  // Count answered positions
  const answeredCount = sortedPositions.filter((p) => choices[p.id] !== undefined).length;
  const progressPercent = Math.round((answeredCount / sortedPositions.length) * 100);

  const handleNext = () => {
    // Prevent voter from proceeding until one option is selected in the current position
    if (!hasSelectedCurrentOption) {
      return;
    }
    if (isLastPosition) {
      onReviewBallot(choices);
    } else {
      setActivePosIndex((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstPosition) {
      setActivePosIndex((prev) => prev - 1);
    }
  };

  if (!currentPosition) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center bg-white dark:bg-slate-900 rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800">
        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">No positions configured yet</h3>
        <p className="text-slate-500 dark:text-slate-400 mt-2">The Electoral Commission has not added ballot positions yet.</p>
        <button
          onClick={onCancel}
          className="mt-6 px-6 py-2.5 bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 rounded-xl font-bold text-sm cursor-pointer"
        >
          Return to Login
        </button>
      </div>
    );
  }

  return (
    <div
      id="voter-ballot-screen"
      className="min-h-[calc(100vh-5rem)] py-6 px-3 sm:px-6 lg:px-8 transition-colors duration-200"
    >
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        {/* Top Info Bar */}
        <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/90 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-black flex items-center justify-center text-sm border border-amber-300 dark:border-amber-800 shrink-0">
              {voter.fullName.charAt(0)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">{voter.fullName}</h2>
                <span className="text-xs font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700">
                  ID: {voter.voterId}
                </span>
                {isPractice && (
                  <span className="text-2xs font-bold uppercase bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                    Practice
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                Secret Ballot: Your selections remain strictly confidential and untraceable.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Local Storage Autosave Status Badge */}
            <div
              id="voter-autosave-badge"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 shadow-2xs"
              title={
                lastSavedTimestamp
                  ? `Ballot choices autosaved locally at ${new Date(lastSavedTimestamp).toLocaleTimeString()}`
                  : 'Autosave active: pending selections persist across browser refreshes'
              }
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Autosaved</span>
              {lastSavedTimestamp && (
                <span className="font-mono text-3xs opacity-80 hidden sm:inline">
                  {new Date(lastSavedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>

            {/* Idle Security Timer Indicator */}
            <div
              id="voter-idle-security-badge"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                secondsRemaining <= WARNING_THRESHOLD_SECONDS
                  ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-900 dark:text-amber-200 border-amber-300 dark:border-amber-700 animate-pulse'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
              title="Automatic session timeout protects your ballot secrecy after 3 minutes of inactivity."
            >
              <Clock
                className={`w-3.5 h-3.5 ${
                  secondsRemaining <= WARNING_THRESHOLD_SECONDS
                    ? 'text-amber-600 dark:text-amber-400 animate-spin'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              />
              <span>
                {secondsRemaining <= WARNING_THRESHOLD_SECONDS
                  ? `Timeout in ${secondsRemaining}s`
                  : 'Idle Security: 3m'}
              </span>
            </div>

            <button
              id="ballot-exit-btn"
              onClick={handleInitiateCancel}
              className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 px-3 py-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Cancel & Exit</span>
            </button>
          </div>
        </div>

        {/* Restored Draft Alert Banner */}
        {showRestoredNotice && Object.keys(choices).length > 0 && (
          <div
            id="ballot-restored-banner"
            className="p-3.5 sm:p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-300/90 dark:border-amber-800 text-amber-950 dark:text-amber-200 text-xs sm:text-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs animate-in fade-in"
          >
            <div className="flex items-center gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Selections Restored from Autosave:</strong> Your pending choices were recovered ({Object.keys(choices).length} answered). You can change any vote or continue reviewing.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
              <button
                type="button"
                id="clear-ballot-draft-btn"
                onClick={handleClearDraft}
                className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 text-xs font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>Reset Choices</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRestoredNotice(false)}
                className="p-1 rounded-lg hover:bg-amber-200/50 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 transition-colors cursor-pointer"
                title="Dismiss notice"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Ballot Progress Status Header (Sequential voting - position jumping disabled) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-200/90 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300">
            <span>
              Position {activePosIndex + 1} of {sortedPositions.length}:{' '}
              <strong className="text-slate-900 dark:text-white">{currentPosition.title}</strong>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {answeredCount}/{sortedPositions.length} completed ({progressPercent}%)
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-amber-500 to-emerald-500 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Current Position Question Card */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-8 shadow-sm border border-slate-200 dark:border-slate-800">
          <div className="mb-6">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-3 py-1 rounded-full border border-amber-200 dark:border-amber-800 inline-block mb-2">
              Position #{activePosIndex + 1} &bull; Select One
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
              {currentPosition.title}
            </h2>
            {currentPosition.description && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                {currentPosition.description}
              </p>
            )}
          </div>

          {/* Candidate Selection List */}
          <div className="space-y-3.5">
            {currentCandidates.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-slate-50 dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-sm">
                No candidates are registered for this position. You may abstain.
              </div>
            ) : (
              currentCandidates.map((candidate) => {
                const isSelected = currentChoice === candidate.id;
                const color = getCandidateColor(candidate.name);

                return (
                  <div
                    key={candidate.id}
                    id={`candidate-card-${candidate.id}`}
                    onClick={() => handleSelectCandidate(candidate.id)}
                    className={`relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                      isSelected
                        ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/30 shadow-md ring-2 ring-amber-500/20'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                      {/* Selection Radio Circle */}
                      <div className="shrink-0 text-amber-600 dark:text-amber-500">
                        {isSelected ? (
                          <CheckCircle2 className="w-6 h-6 fill-amber-500 text-white dark:text-slate-950" />
                        ) : (
                          <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                        )}
                      </div>

                      {/* Photo or Initials */}
                      {candidate.photoUrl ? (
                        <img
                          src={candidate.photoUrl}
                          alt={candidate.name}
                          className="w-14 h-14 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                        />
                      ) : (
                        <div
                          className={`w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-lg border shrink-0 ${color.bg}`}
                        >
                          {getCandidateInitials(candidate.name)}
                        </div>
                      )}

                      {/* Candidate Name & Slogan */}
                      <div className="min-w-0 flex-1">
                        <h4 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-tight truncate">
                          {candidate.name}
                        </h4>
                        {candidate.slogan ? (
                          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 font-medium italic mt-0.5 line-clamp-2">
                            "{candidate.slogan}"
                          </p>
                        ) : (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Candidate</p>
                        )}
                      </div>
                    </div>

                    {/* Manifesto Trigger Button */}
                    <button
                      id={`view-manifesto-${candidate.id}`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setManifestoCandidate(candidate);
                      }}
                      className="w-full sm:w-auto shrink-0 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3.5 py-2.5 sm:py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-transparent dark:border-indigo-800/60"
                    >
                      <Info className="w-3.5 h-3.5" />
                      <span>Read Manifesto</span>
                    </button>
                  </div>
                );
              })
            )}

            {/* Explicit Abstain / Skip Option */}
            <div
              id={`abstain-option-${currentPosition.id}`}
              onClick={handleSelectAbstain}
              className={`p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer flex items-center gap-4 ${
                currentChoice === ABSTAIN_SELECTION
                  ? 'border-slate-800 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 shadow-sm ring-2 ring-slate-800/10'
                  : 'border-dashed border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 bg-slate-50/70 dark:bg-slate-900/60 hover:bg-slate-100/70 dark:hover:bg-slate-850'
              }`}
            >
              <div className="shrink-0 text-slate-700 dark:text-slate-300">
                {currentChoice === ABSTAIN_SELECTION ? (
                  <CheckCircle2 className="w-6 h-6 fill-slate-800 dark:fill-slate-300 text-white dark:text-slate-950" />
                ) : (
                  <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600" />
                )}
              </div>
              <div>
                <h4 className="text-sm sm:text-base font-bold text-slate-800 dark:text-slate-200">
                  Abstain / Skip this Position
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  I choose not to vote for any candidate for {currentPosition.title}. Your abstention will be recorded as a valid blank vote.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Navigation */}
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <button
              id="ballot-prev-btn"
              type="button"
              disabled={isFirstPosition}
              onClick={handlePrev}
              className={`px-5 py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-colors ${
                isFirstPosition
                  ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed bg-slate-50 dark:bg-slate-900'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white cursor-pointer'
              }`}
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              {!hasSelectedCurrentOption && (
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/90 dark:border-amber-800 px-3.5 py-2.5 sm:py-2 rounded-xl flex items-center justify-center gap-1.5 text-center shadow-2xs">
                  <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>Select a candidate or abstain to proceed</span>
                </span>
              )}

              <button
                id="ballot-next-btn"
                type="button"
                disabled={!hasSelectedCurrentOption}
                onClick={handleNext}
                className={`px-6 py-3.5 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                  hasSelectedCurrentOption
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 shadow-md hover:shadow-lg cursor-pointer'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed shadow-none'
                }`}
              >
                {isLastPosition ? (
                  <>
                    <span>Review & Submit Ballot</span>
                    <Send className="w-4 h-4" />
                  </>
                ) : (
                  <>
                    <span>Next Position</span>
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Helpful reminder */}
        <div className="text-center text-xs text-slate-400 dark:text-slate-500 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500" />
          <span>You can review and change your choices on the next screen before final submission.</span>
        </div>
      </div>

      {/* Candidate Manifesto Modal */}
      <ManifestoModal
        candidate={manifestoCandidate}
        position={currentPosition}
        isOpen={!!manifestoCandidate}
        onClose={() => setManifestoCandidate(null)}
      />

      {/* 3-Minute Idle Security Warning Modal */}
      {isWarningModalOpen && (
        <div
          id="session-inactivity-warning-modal"
          className="fixed inset-0 z-[70] flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="inactivity-warning-title"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-amber-200 dark:border-amber-800 text-center space-y-5 animate-in fade-in slide-in-from-top-4 duration-150">
            {/* Warning Icon Badge */}
            <div className="w-16 h-16 rounded-3xl bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto border border-amber-300 dark:border-amber-700 shadow-inner">
              <Clock className="w-8 h-8 animate-pulse" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-2xs font-extrabold uppercase tracking-wider">
                <ShieldAlert className="w-3 h-3" />
                <span>Security Protection Active</span>
              </div>
              <h3
                id="inactivity-warning-title"
                className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight"
              >
                Are you still voting?
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-sm mx-auto">
                Your screen has been idle. To protect your ballot secrecy and prevent unauthorized booth access, this session will automatically close in:
              </p>
            </div>

            {/* Countdown Badge & Progress */}
            <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800/80 space-y-2.5">
              <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-amber-600 dark:text-amber-400">
                0:{secondsRemaining < 10 ? '0' : ''}{secondsRemaining}
              </div>
              <div className="text-2xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Seconds remaining before auto-logout
              </div>
              <div className="w-full h-2 bg-amber-200 dark:bg-amber-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-1000 ease-linear"
                  style={{
                    width: `${Math.round((secondsRemaining / WARNING_THRESHOLD_SECONDS) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="button"
                id="keep-voting-btn"
                onClick={resetActivityTimer}
                className="flex-1 px-5 py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>I'm Still Voting</span>
              </button>

              <button
                type="button"
                id="inactivity-exit-btn"
                onClick={onCancel}
                className="px-4 py-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Exit Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard & Exit Confirmation Dialog */}
      <ConfirmModal
        isOpen={isCancelConfirmOpen}
        title="Discard Ballot Selections?"
        message="You have active ballot selections saved. Exiting the booth now will clear your temporary draft selections and return to the login screen."
        confirmLabel="Discard & Exit"
        cancelLabel="Continue Voting"
        confirmVariant="danger"
        onConfirm={handleConfirmCancel}
        onCancel={() => setIsCancelConfirmOpen(false)}
      />
    </div>
  );
};
