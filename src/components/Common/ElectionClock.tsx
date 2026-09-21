import React, { useEffect, useState, useMemo } from 'react';
import { ElectionConfig, ElectionStatus } from '../../types';
import { Clock, AlertCircle, CheckCircle2, Calendar, Sparkles } from 'lucide-react';

export interface ElectionClockProps {
  config: ElectionConfig;
  status: ElectionStatus;
  variant?: 'card' | 'compact' | 'banner' | 'booth';
  forVoters?: boolean; // When true, respects showClockToVoters and hides if results published
  className?: string;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
  targetDate: Date;
  formattedTarget: string;
}

function computeTimeRemaining(endDateStr: string, closingTimeStr: string): TimeRemaining {
  // Normalize closing time to HH:MM:SS
  const cleanTime = closingTimeStr.trim() || '18:00';
  const timeWithSeconds = cleanTime.length === 5 ? `${cleanTime}:00` : cleanTime;
  const isoString = `${endDateStr}T${timeWithSeconds}`;

  let targetDate = new Date(isoString);
  if (isNaN(targetDate.getTime())) {
    // Fallback: use today with closing time
    const today = new Date().toISOString().split('T')[0];
    targetDate = new Date(`${today}T${timeWithSeconds}`);
    if (isNaN(targetDate.getTime())) {
      targetDate = new Date(Date.now() + 6 * 3600 * 1000); // 6 hours from now
    }
  }

  const now = new Date();
  const totalMs = targetDate.getTime() - now.getTime();
  const isExpired = totalMs <= 0;

  const validDiff = Math.max(0, totalMs);
  const days = Math.floor(validDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((validDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((validDiff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((validDiff % (1000 * 60)) / 1000);

  const formattedTarget = targetDate.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return {
    days,
    hours,
    minutes,
    seconds,
    totalMs,
    isExpired,
    targetDate,
    formattedTarget,
  };
}

export const ElectionClock: React.FC<ElectionClockProps> = ({
  config,
  status,
  variant = 'card',
  forVoters = false,
  className = '',
}) => {
  // 1. Check voter display constraints:
  // If for voters and showClockToVoters is false, or if results already published, do not render to voters
  if (forVoters && (!config.showClockToVoters || status === 'Results Published')) {
    return null;
  }

  const endDate = config.endDate || config.date;
  const closingTime = config.closingTime || '18:00';

  const [timeRemaining, setTimeRemaining] = useState<TimeRemaining>(() =>
    computeTimeRemaining(endDate, closingTime)
  );

  useEffect(() => {
    // Update every second
    const update = () => {
      setTimeRemaining(computeTimeRemaining(endDate, closingTime));
    };

    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [endDate, closingTime]);

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

  // Determine status message and color theme
  const isCompleted = status === 'Results Published';
  const isVotingLive = status === 'Open' && !timeRemaining.isExpired;

  // COMPACT PILL / BADGE VARIANT
  if (variant === 'compact') {
    if (isCompleted) {
      return (
        <div
          id="election-clock-compact"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-800 dark:text-indigo-300 text-xs font-bold ${className}`}
        >
          <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
          <span>Election Concluded</span>
        </div>
      );
    }

    if (timeRemaining.isExpired) {
      return (
        <div
          id="election-clock-compact"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-bold ${className}`}
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span>Polls Closed (Time Expired)</span>
        </div>
      );
    }

    return (
      <div
        id="election-clock-compact"
        className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-xs text-xs font-bold border border-transparent dark:border-slate-700 ${className}`}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Clock className="w-3.5 h-3.5 text-slate-300" />
        <span className="text-slate-300 text-2xs uppercase tracking-wider font-semibold">
          {status === 'Open' ? 'Closes in:' : 'Target:'}
        </span>
        <span className="font-mono tracking-wider text-emerald-400">
          {timeRemaining.days > 0 && `${timeRemaining.days}d `}
          {pad(timeRemaining.hours)}:{pad(timeRemaining.minutes)}:{pad(timeRemaining.seconds)}
        </span>
      </div>
    );
  }

  // VOTER BOOTH BANNER VARIANT
  if (variant === 'booth') {
    if (isCompleted) return null;

    return (
      <div
        id="election-clock-booth"
        className={`w-full bg-linear-to-r from-indigo-50 via-sky-50 to-indigo-50 dark:from-indigo-950/40 dark:via-slate-900 dark:to-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 rounded-2xl p-3 sm:p-4 mb-4 shadow-2xs transition-colors ${className}`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <span className="text-2xs font-extrabold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block">
                Official Voting Window
              </span>
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Polls scheduled to close on{' '}
                <strong className="text-slate-900 dark:text-white">{timeRemaining.formattedTarget}</strong>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-white/90 dark:bg-slate-850 backdrop-blur-xs px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/70 self-start sm:self-auto shadow-2xs">
            <span className="text-2xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mr-1">
              Time Remaining:
            </span>
            {timeRemaining.isExpired ? (
              <span className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                Voting window has reached cutoff
              </span>
            ) : (
              <div className="flex items-center gap-1 font-mono text-sm font-black text-indigo-900 dark:text-indigo-200">
                {timeRemaining.days > 0 && (
                  <>
                    <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 px-1.5 py-0.5 rounded text-xs font-bold">
                      {timeRemaining.days}d
                    </span>
                    <span className="text-indigo-400">:</span>
                  </>
                )}
                <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 px-1.5 py-0.5 rounded text-xs font-bold">
                  {pad(timeRemaining.hours)}h
                </span>
                <span className="text-indigo-400">:</span>
                <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 px-1.5 py-0.5 rounded text-xs font-bold">
                  {pad(timeRemaining.minutes)}m
                </span>
                <span className="text-indigo-400">:</span>
                <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-900 dark:text-indigo-200 px-1.5 py-0.5 rounded text-xs font-bold">
                  {pad(timeRemaining.seconds)}s
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // BANNER VARIANT (Sleek horizontal ribbon)
  if (variant === 'banner') {
    return (
      <div
        id="election-clock-banner"
        className={`w-full bg-slate-900 dark:bg-slate-850 text-white px-4 py-2.5 rounded-2xl flex items-center justify-between gap-3 shadow-sm border border-slate-800 dark:border-slate-700 ${className}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
          <span className="text-xs text-slate-300 truncate">
            Closing: <strong className="text-white">{timeRemaining.formattedTarget}</strong>
          </span>
        </div>
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold shrink-0">
          <span className="text-slate-400 uppercase text-2xs">Remaining:</span>
          <span className="text-emerald-400">
            {timeRemaining.days > 0 && `${timeRemaining.days}d `}
            {pad(timeRemaining.hours)}:{pad(timeRemaining.minutes)}:{pad(timeRemaining.seconds)}
          </span>
        </div>
      </div>
    );
  }

  // DEFAULT HERO CARD VARIANT
  return (
    <div
      id="election-clock-card"
      className={`bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xs transition-all ${className}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-2xl ${
              isCompleted
                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                : timeRemaining.isExpired
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                : 'bg-slate-900 dark:bg-slate-800 text-white'
            }`}
          >
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-black text-slate-900 dark:text-white">Election Clock & Countdown</h4>
              {isVotingLive && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live Ticking
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>Target End: <strong className="text-slate-800 dark:text-slate-200">{timeRemaining.formattedTarget}</strong></span>
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div>
          {isCompleted ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Election Concluded
            </span>
          ) : timeRemaining.isExpired ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
              <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              Closing Time Passed
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Voting Window Open
            </span>
          )}
        </div>
      </div>

      {/* Countdown Digits Grid */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4 pt-5">
        {/* Days */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 sm:p-4 text-center border border-slate-200/80 dark:border-slate-700">
          <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white block leading-tight">
            {pad(timeRemaining.days)}
          </span>
          <span className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 block">
            Days
          </span>
        </div>

        {/* Hours */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 sm:p-4 text-center border border-slate-200/80 dark:border-slate-700">
          <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white block leading-tight">
            {pad(timeRemaining.hours)}
          </span>
          <span className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 block">
            Hours
          </span>
        </div>

        {/* Minutes */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 sm:p-4 text-center border border-slate-200/80 dark:border-slate-700">
          <span className="font-mono text-2xl sm:text-3xl font-black text-slate-900 dark:text-white block leading-tight">
            {pad(timeRemaining.minutes)}
          </span>
          <span className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 block">
            Minutes
          </span>
        </div>

        {/* Seconds */}
        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-3 sm:p-4 text-center border border-slate-200/80 dark:border-slate-700">
          <span className="font-mono text-2xl sm:text-3xl font-black text-indigo-600 dark:text-indigo-400 block leading-tight">
            {pad(timeRemaining.seconds)}
          </span>
          <span className="text-2xs sm:text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1 block">
            Seconds
          </span>
        </div>
      </div>

      {/* Voter visibility note for admins */}
      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-2xs text-slate-500 dark:text-slate-400">
        <span>
          Voter Booth Visibility:{' '}
          <strong className={config.showClockToVoters ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}>
            {config.showClockToVoters
              ? 'Enabled (visible until results published)'
              : 'Disabled (admin-only)'}
          </strong>
        </span>
        <span className="text-slate-400 dark:text-slate-500">End Date: {endDate} at {closingTime}</span>
      </div>
    </div>
  );
};
