import React from 'react';
import { Candidate, Position } from '../../types';
import { getCandidateColor, getCandidateInitials } from '../../utils/avatar';
import { BookOpen, X, Quote } from 'lucide-react';

interface ManifestoModalProps {
  candidate: Candidate | null;
  position?: Position;
  isOpen: boolean;
  onClose: () => void;
}

export const ManifestoModal: React.FC<ManifestoModalProps> = ({
  candidate,
  position,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !candidate) return null;

  const color = getCandidateColor(candidate.name);

  return (
    <div
      id="manifesto-modal-backdrop"
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="manifesto-modal-content"
        className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 p-6 md:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-150 transition-colors"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {candidate.photoUrl ? (
              <img
                src={candidate.photoUrl}
                alt={candidate.name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 dark:border-slate-700 shadow-sm"
              />
            ) : (
              <div
                className={`w-16 h-16 rounded-2xl flex items-center justify-center font-bold text-xl border shrink-0 ${color.bg}`}
              >
                {getCandidateInitials(candidate.name)}
              </div>
            )}
            <div>
              <span className="inline-block text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 rounded-full mb-1">
                Candidate for {position?.title || 'Council Position'}
              </span>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">{candidate.name}</h3>
            </div>
          </div>
          <button
            id="manifesto-modal-close-btn"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {candidate.slogan && (
          <div className="mt-4 p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 rounded-2xl flex items-start gap-2.5">
            <Quote className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200 italic">
              "{candidate.slogan}"
            </p>
          </div>
        )}

        <div className="mt-6">
          <div className="flex items-center gap-2 mb-2 text-slate-800 dark:text-slate-200 font-bold text-sm uppercase tracking-wider">
            <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Candidate Manifesto & Goals
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-750 rounded-2xl max-h-60 overflow-y-auto">
            <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-line">
              {candidate.manifesto || 'No detailed manifesto submitted yet.'}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            id="manifesto-modal-done-btn"
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-slate-950 font-semibold text-sm rounded-xl transition-colors shadow-sm cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
