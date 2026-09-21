import React from 'react';
import { ABSTAIN_SELECTION, Candidate, ElectionConfig, Position, Voter } from '../../types';
import { getCandidateColor, getCandidateInitials } from '../../utils/avatar';
import { AlertTriangle, Check, ArrowLeft, ShieldCheck, X } from 'lucide-react';
import { SchoolLogo } from '../Common/SchoolLogo';

interface ReviewBallotModalProps {
  isOpen: boolean;
  voter: Voter;
  positions: Position[];
  candidates: Candidate[];
  choices: Record<string, string>;
  isSubmitting: boolean;
  onConfirmSubmit: () => void;
  onBackToEdit: () => void;
  config?: ElectionConfig;
}

export const ReviewBallotModal: React.FC<ReviewBallotModalProps> = ({
  isOpen,
  voter,
  positions,
  candidates,
  choices,
  isSubmitting,
  onConfirmSubmit,
  onBackToEdit,
  config,
}) => {
  if (!isOpen) return null;

  const sortedPositions = [...positions].sort((a, b) => a.order - b.order);

  return (
    <div
      id="review-ballot-modal-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="review-ballot-modal-content"
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 mb-8 animate-in fade-in slide-in-from-top-4 duration-150 transition-colors"
      >
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start gap-3.5">
            {config && (
              <SchoolLogo
                logoUrl={config.logoUrl}
                schoolName={config.schoolName}
                size="md"
                shape="rounded"
                className="mt-1 hidden sm:flex shrink-0"
              />
            )}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="p-1.5 bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 rounded-lg">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400">
                  Final Review Step
                </span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Review Your Ballot Selections
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Voting as <strong className="text-slate-700 dark:text-slate-200">{voter.fullName}</strong> ({voter.voterId}). Please verify your
                choices below.
              </p>
            </div>
          </div>
          <button
            id="review-modal-close-btn"
            onClick={onBackToEdit}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="my-4 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/90 dark:border-amber-800 rounded-2xl flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm text-amber-900 dark:text-amber-200 font-medium">
            <strong>Important:</strong> Once you click &ldquo;Confirm & Submit Vote&rdquo;, your ballot is
            final and cast anonymously. You cannot vote again with this ID.
          </div>
        </div>

        {/* Review list of choices */}
        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto pr-1">
          {sortedPositions.map((pos, idx) => {
            const chosenId = choices[pos.id];
            const isAbstain = chosenId === ABSTAIN_SELECTION || !chosenId;
            const chosenCandidate = candidates.find((c) => c.id === chosenId);

            return (
              <div
                key={pos.id}
                className="p-3.5 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <span className="text-2xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-0.5">
                    Position {idx + 1}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">{pos.title}</h4>
                </div>

                <div className="text-right shrink-0">
                  {isAbstain ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      Abstained / Skipped
                    </span>
                  ) : chosenCandidate ? (
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <span className="text-sm font-bold text-emerald-950 dark:text-emerald-300 block">
                          {chosenCandidate.name}
                        </span>
                        {chosenCandidate.slogan && (
                          <span className="text-2xs text-slate-500 dark:text-slate-400 italic block max-w-[180px] truncate">
                            &ldquo;{chosenCandidate.slogan}&rdquo;
                          </span>
                        )}
                      </div>
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs border ${
                          getCandidateColor(chosenCandidate.name).bg
                        }`}
                      >
                        {getCandidateInitials(chosenCandidate.name)}
                      </div>
                    </div>
                  ) : (
                    <span className="text-xs text-rose-600 dark:text-rose-400 font-bold">Not Selected</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <button
            id="review-back-btn"
            type="button"
            onClick={onBackToEdit}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-3 rounded-2xl font-bold text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Make Changes</span>
          </button>

          <button
            id="review-submit-confirm-btn"
            type="button"
            onClick={onConfirmSubmit}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-7 py-3.5 rounded-2xl font-black text-sm text-slate-950 bg-amber-500 hover:bg-amber-600 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Check className="w-5 h-5 stroke-[2.5]" />
            <span>{isSubmitting ? 'Recording Vote...' : 'Confirm & Submit Vote'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
