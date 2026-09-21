import React from 'react';
import { TestTube, Info } from 'lucide-react';

interface PracticeBannerProps {
  isPractice: boolean;
  onExitPractice?: () => void;
}

export const PracticeBanner: React.FC<PracticeBannerProps> = ({ isPractice, onExitPractice }) => {
  if (!isPractice) return null;

  return (
    <div
      id="practice-mode-banner"
      className="bg-amber-500 text-slate-950 px-4 py-2.5 shadow-md flex items-center justify-between border-b-2 border-amber-600 animate-pulse-subtle"
    >
      <div className="flex items-center gap-2.5 mx-auto text-xs md:text-sm font-bold tracking-wide uppercase">
        <TestTube className="w-5 h-5 shrink-0" />
        <span>PRACTICE BALLOT MODE &mdash; VOTES CAST HERE ARE FOR DEMO PURPOSES AND WILL NOT BE COUNTED</span>
        <span className="hidden sm:inline-flex items-center gap-1 bg-amber-400/80 px-2 py-0.5 rounded text-amber-950 text-xs">
          <Info className="w-3.5 h-3.5" /> Sample Student ID: STU101 (PIN: 4321)
        </span>
      </div>
      {onExitPractice && (
        <button
          id="exit-practice-btn"
          onClick={onExitPractice}
          className="text-xs font-bold uppercase bg-slate-900 text-white px-3 py-1 rounded-lg hover:bg-slate-800 transition-colors ml-2 shrink-0"
        >
          Exit Demo
        </button>
      )}
    </div>
  );
};
