import React, { useState } from 'react';
import {
  ElectionConfig,
  ElectionStatus,
  UserAccount,
  Voter,
} from '../types';
import {
  Vote,
  ShieldCheck,
  BarChart3,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  GraduationCap,
  Sparkles,
  PieChart as PieIcon,
  Lock,
  LogOut,
  UserCheck,
  Sun,
  Moon,
  History,
  RotateCw,
} from 'lucide-react';
import { sounds } from '../utils/audio';
import { ElectionClock } from './Common/ElectionClock';
import { SchoolLogo } from './Common/SchoolLogo';
import { forceClearAppCacheAndReload } from '../utils/version';

interface HeaderProps {
  config: ElectionConfig;
  status: ElectionStatus;
  currentView: 'booth' | 'admin' | 'results' | 'agents';
  onSelectView: (view: 'booth' | 'admin' | 'results' | 'agents') => void;
  isPractice: boolean;
  onTogglePractice: () => void;
  onRequestAdmin: () => void;
  isAdminAuthenticated?: boolean;
  currentUser?: UserAccount | null;
  onLogoutAdmin?: () => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  authenticatedVoter?: Voter | null;
  onRequestVoterResultsLogin?: () => void;
  onLogoutVoterResults?: () => void;
  onRequestAuditTrail?: () => void;
  activeAdminTab?: string;
}

export const Header: React.FC<HeaderProps> = ({
  config,
  status,
  currentView,
  onSelectView,
  isPractice,
  onTogglePractice,
  onRequestAdmin,
  isAdminAuthenticated = false,
  currentUser = null,
  onLogoutAdmin,
  isDarkMode,
  onToggleDarkMode,
  authenticatedVoter = null,
  onRequestVoterResultsLogin,
  onLogoutVoterResults,
  onRequestAuditTrail,
  activeAdminTab,
}) => {
  const [isMuted, setIsMuted] = useState(!sounds.enabled);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleSound = () => {
    sounds.enabled = !sounds.enabled;
    setIsMuted(!sounds.enabled);
    if (sounds.enabled) {
      sounds.playSelect();
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const statusBadge = {
    Setup: (
      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-3xs sm:text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
        <span className="w-2 h-2 rounded-full bg-slate-500" />
        Setup Mode
      </span>
    ),
    Open: (
      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-3xs sm:text-xs font-bold uppercase tracking-wider bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        Polls Open
      </span>
    ),
    Closed: (
      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-3xs sm:text-xs font-bold uppercase tracking-wider bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
        <span className="w-2 h-2 rounded-full bg-amber-500" />
        Polls Closed
      </span>
    ),
    'Results Published': (
      <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-3xs sm:text-xs font-bold uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800">
        <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
        Official Results
      </span>
    ),
  }[status];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-xs print:hidden transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between py-2.5 md:py-0 min-h-16 md:h-20 gap-2 md:gap-4">
          {/* Top Line: Logo, Title & Status */}
          <div className="flex items-center justify-between gap-3 min-w-0">
            <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0">
              <SchoolLogo
                logoUrl={config.logoUrl}
                schoolName={config.schoolName}
                size="md"
                shape="rounded"
                className="shrink-0"
              />
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-sm sm:text-base md:text-lg font-black text-slate-900 dark:text-white truncate tracking-tight">
                    {config.title || 'School Elections'}
                  </h1>
                  {statusBadge}
                  {/* Header Election Clock countdown badge */}
                  <div className="hidden xl:block">
                    <ElectionClock config={config} status={status} variant="compact" />
                  </div>
                </div>
                <p className="text-2xs sm:text-xs text-slate-600 dark:text-slate-400 font-medium truncate">
                  {config.schoolName || 'Classroom Voting Station'} &bull; {config.date}
                </p>
              </div>
            </div>

            {/* Mobile Utility Controls bar (on small screens) */}
            <div className="flex md:hidden items-center gap-1 shrink-0">
              {/* Dark Mode Toggle for Mobile */}
              <button
                id="header-darkmode-toggle-mobile"
                type="button"
                onClick={onToggleDarkMode}
                title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                className="p-2 text-slate-600 dark:text-amber-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle dark mode"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Sound Toggle for Mobile */}
              <button
                id="header-audio-toggle-mobile"
                type="button"
                onClick={toggleSound}
                title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle Sound Effects"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Fullscreen Toggle for Mobile */}
              <button
                id="header-fullscreen-toggle-mobile"
                type="button"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Kiosk Fullscreen'}
                className="p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle Kiosk Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Force Refresh / Sync Station for Mobile */}
              <button
                id="header-refresh-station-mobile-btn"
                type="button"
                onClick={() => forceClearAppCacheAndReload()}
                title="Refresh Station to latest version (clears browser cache)"
                className="p-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Refresh Station"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Navigation & Controls for Desktop & Tablet */}
          <div className="flex items-center justify-between md:justify-end gap-2 sm:gap-3 flex-wrap">
            {/* View Switcher Tabs: ONLY rendered for authenticated Electoral Staff / Admin */}
            {isAdminAuthenticated ? (
              <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <nav className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                  {currentUser?.role !== 'Agent Monitor' && (
                    <>
                      <button
                        id="header-nav-booth"
                        onClick={() => onSelectView('booth')}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                          currentView === 'booth'
                            ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <Vote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Booth</span>
                      </button>

                      <button
                        id="header-nav-results"
                        onClick={() => onSelectView('results')}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                          currentView === 'results'
                            ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span>Results</span>
                      </button>
                    </>
                  )}

                  <button
                    id="header-nav-agents"
                    onClick={() => onSelectView('agents')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                      currentView === 'agents'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <PieIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Agent Monitor</span>
                    <span className="sm:hidden">Agents</span>
                  </button>

                  {currentUser?.role !== 'Agent Monitor' && (
                    <>
                      <button
                        id="header-nav-admin"
                        onClick={onRequestAdmin}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                          currentView === 'admin' && activeAdminTab !== 'audit'
                            ? 'bg-slate-900 dark:bg-slate-950 text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">Commission</span>
                        <span className="sm:hidden">Admin</span>
                      </button>

                      <button
                        id="header-nav-audit-trail"
                        onClick={onRequestAuditTrail || onRequestAdmin}
                        className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                          currentView === 'admin' && activeAdminTab === 'audit'
                            ? 'bg-purple-600 text-white shadow-xs'
                            : 'text-purple-700 dark:text-purple-300 hover:bg-purple-100/60 dark:hover:bg-purple-950/50'
                        }`}
                        title="Cryptographic Audit Trail & Legal Chain of Custody"
                      >
                        <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-600 dark:text-purple-400" />
                        <span className="hidden sm:inline">Audit Trail</span>
                        <span className="sm:hidden">Audit</span>
                      </button>
                    </>
                  )}
                </nav>

                {/* Staff User Badge & Logout Option */}
                <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="truncate max-w-[100px]" title={currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Staff Member'}>
                      {currentUser?.fullName.split(' ')[0] || 'Official'}
                    </span>
                  </div>
                  {onLogoutAdmin && (
                    <button
                      id="header-staff-logout-btn"
                      data-testid="header-lock-terminal-btn"
                      onClick={onLogoutAdmin}
                      title={`Log out of staff account (${currentUser?.fullName || 'Staff'})`}
                      className="px-2.5 py-1 text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700"
                      aria-label="Log out of staff account"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>Logout</span>
                    </button>
                  )}
                </div>
              </div>
            ) : authenticatedVoter ? (
              /* Student Voter Results Session Navigation */
              <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                <nav className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 shrink-0">
                  <button
                    id="header-nav-student-booth"
                    onClick={() => onSelectView('booth')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                      currentView === 'booth'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <Vote className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span>Booth</span>
                  </button>

                  <button
                    id="header-nav-student-results"
                    onClick={() => onSelectView('results')}
                    className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer shrink-0 ${
                      currentView === 'results'
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>Official Results</span>
                  </button>
                </nav>

                <div className="flex items-center gap-1.5 pl-1.5 border-l border-slate-200 dark:border-slate-800 shrink-0">
                  <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/60 rounded-xl text-xs font-bold text-indigo-800 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span className="truncate max-w-[120px]">{authenticatedVoter.fullName.split(' ')[0]}</span>
                  </div>
                  {onLogoutVoterResults && (
                    <button
                      id="header-student-logout-btn"
                      onClick={onLogoutVoterResults}
                      title="Exit Results View"
                      className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-xs font-bold"
                    >
                      <LogOut className="w-4 h-4" />
                      <span className="hidden sm:inline text-2xs">Exit</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Voter Experience: Results Login & Staff Access */
              <div className="flex items-center gap-2">
                {status === 'Results Published' && onRequestVoterResultsLogin && (
                  <button
                    id="header-view-results-btn"
                    onClick={onRequestVoterResultsLogin}
                    title="Log in with your Student ID to view certified election results"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors cursor-pointer"
                  >
                    <BarChart3 className="w-3.5 h-3.5" />
                    <span>View Official Results</span>
                  </button>
                )}

                <button
                  id="header-audit-trail-btn"
                  onClick={onRequestAuditTrail || onRequestAdmin}
                  title="Official Cryptographic Audit Trail (NIST SHA-256 Legal Evidence)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/50 dark:hover:bg-purple-900/60 transition-colors border border-purple-200 dark:border-purple-800 cursor-pointer shadow-2xs"
                >
                  <History className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                  <span>Audit Trail</span>
                </button>

                <button
                  id="header-staff-access-btn"
                  onClick={onRequestAdmin}
                  title="Official Staff Portal (Commission, Observers & Admins)"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors border border-slate-200 dark:border-slate-700 cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  <span>Staff Access</span>
                </button>
              </div>
            )}

            {/* Utility buttons for Desktop & Tablet (also practice toggle) */}
            <div className="flex items-center gap-1 sm:gap-1.5 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
              {config.allowPracticeBallot && (
                <button
                  id="header-practice-toggle"
                  onClick={onTogglePractice}
                  title={isPractice ? 'Practice mode active' : 'Switch to practice demo ballot'}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors border cursor-pointer ${
                    isPractice
                      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {isPractice ? 'Demo Active' : 'Demo'}
                </button>
              )}

              {/* Dark Mode Toggle Button (Visible on all screen sizes) */}
              <button
                id="header-darkmode-toggle"
                onClick={onToggleDarkMode}
                title={isDarkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
                className="hidden md:flex p-2 text-slate-600 dark:text-amber-400 hover:text-slate-900 dark:hover:text-amber-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle Dark Mode"
              >
                {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

              {/* Audio Sound Toggle (Desktop/Tablet) */}
              <button
                id="header-audio-toggle"
                onClick={toggleSound}
                title={isMuted ? 'Unmute sounds' : 'Mute sounds'}
                className="hidden md:flex p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle Sound Effects"
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>

              {/* Fullscreen Toggle (Desktop/Tablet) */}
              <button
                id="header-fullscreen-toggle"
                onClick={toggleFullscreen}
                title={isFullscreen ? 'Exit Fullscreen' : 'Kiosk Fullscreen'}
                className="hidden md:flex p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Toggle Kiosk Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Force Refresh / Sync Latest Build Button */}
              <button
                id="header-refresh-station-btn"
                onClick={() => forceClearAppCacheAndReload()}
                title="Refresh Station to latest version (clears transient browser cache)"
                className="p-2 text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                aria-label="Refresh Station"
              >
                <RotateCw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
