import React, { useState } from 'react';
import {
  AuditLogEntry,
  Candidate,
  ElectionConfig,
  ElectionData,
  ElectionStatus,
  Position,
  ROLE_PERMISSIONS,
  UserAccount,
  Voter,
  getUserPermissions,
} from '../../types';
import { PositionsTab } from './SetupTabs/PositionsTab';
import { CandidatesTab } from './SetupTabs/CandidatesTab';
import { VoterRosterTab } from './SetupTabs/VoterRosterTab';
import { ElectionSettingsTab } from './SetupTabs/ElectionSettingsTab';
import { AuditLogTab } from './SetupTabs/AuditLogTab';
import { AccountsTab } from './SetupTabs/AccountsTab';
import { LiveTurnoutView } from './LiveTurnoutView';
import { AgentMonitoringView } from '../Agents/AgentMonitoringView';
import { ElectionClock } from '../Common/ElectionClock';
import { ConfirmModal } from '../Common/ConfirmModal';
import {
  ShieldCheck,
  Play,
  Square,
  Sparkles,
  Lock,
  Unlock,
  Flame,
  ListOrdered,
  Users,
  UserCheck,
  Settings,
  History,
  ArrowLeft,
  PieChart as PieIcon,
  UserCog,
  BadgeCheck,
  Terminal,
  Shield,
  ShieldAlert,
  Clock,
  LogOut,
} from 'lucide-react';

interface AdminDashboardProps {
  initialTab?: 'turnout' | 'agentCharts' | 'positions' | 'candidates' | 'roster' | 'settings' | 'audit' | 'accounts';
  onTabChange?: (tab: 'turnout' | 'agentCharts' | 'positions' | 'candidates' | 'roster' | 'settings' | 'audit' | 'accounts') => void;
  electionData: ElectionData;
  status: ElectionStatus;
  currentUser: UserAccount | null;
  onUpdateStatus: (newStatus: ElectionStatus) => void;
  onUpdateConfig: (config: ElectionConfig) => void;
  onUpdatePositions: (positions: Position[]) => void;
  onDeletePosition: (positionId: string) => void;
  onAddCandidate: (candidate: Candidate) => void;
  onUpdateCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (candidateId: string) => void;
  onUpdateVoters: (voters: Voter[], logMessage: string) => void;
  onResetVoterStatus: (voterId: string) => void;
  onStartNewElection: (clearRoster: boolean, isFullSystemWipe?: boolean) => void;
  onExportBackupJson: () => void;
  onImportBackupJson?: (data: ElectionData) => void;
  onLoadDefaultDemo: () => void;
  onReturnToBooth: () => void;
  onAddAccount: (account: Omit<UserAccount, 'id' | 'createdAt'>) => void;
  onUpdateAccount: (account: UserAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onSwitchUser: (account: UserAccount) => void;
  onLogout?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  initialTab,
  onTabChange,
  electionData,
  status,
  currentUser,
  onUpdateStatus,
  onUpdateConfig,
  onUpdatePositions,
  onDeletePosition,
  onAddCandidate,
  onUpdateCandidate,
  onDeleteCandidate,
  onUpdateVoters,
  onResetVoterStatus,
  onStartNewElection,
  onExportBackupJson,
  onImportBackupJson,
  onLoadDefaultDemo,
  onReturnToBooth,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onSwitchUser,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'turnout'
    | 'agentCharts'
    | 'accounts'
    | 'positions'
    | 'candidates'
    | 'roster'
    | 'settings'
    | 'audit'
  >(initialTab || (status === 'Open' ? 'turnout' : 'positions'));

  React.useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  // Derive permissions for current logged in user (supports Developer-assigned custom permissions)
  const effectiveRole = currentUser?.role || 'Electoral Commissioner';
  const permissions = getUserPermissions(currentUser);
  const isDeveloper = currentUser?.role === 'Developer';

  // Only the developer account should be able to view "Staff Account & Roles" and "Settings & Clock"
  React.useEffect(() => {
    if (!isDeveloper && (activeTab === 'accounts' || activeTab === 'settings')) {
      setActiveTab('turnout');
    }
  }, [isDeveloper, activeTab]);

  // Confirmation Modals
  const [isOpenPollsConfirm, setIsOpenPollsConfirm] = useState(false);
  const [isClosePollsConfirm, setIsClosePollsConfirm] = useState(false);
  const [isPublishConfirm, setIsPublishConfirm] = useState(false);
  const [isUnlockConfirm, setIsUnlockConfirm] = useState(false);
  const [isLogoutConfirm, setIsLogoutConfirm] = useState(false);

  // Validation before opening voting
  const canOpenVoting =
    electionData.positions.length > 0 &&
    electionData.candidates.length > 0 &&
    electionData.voters.length > 0;

  // Setup is locked if polls have opened or closed, unless in Setup mode
  const isSetupLocked = status !== 'Setup';

  // Role icon helper
  const RoleIcon =
    effectiveRole === 'Electoral Commissioner'
      ? Shield
      : effectiveRole === 'Association President'
      ? BadgeCheck
      : effectiveRole === 'Developer'
      ? Terminal
      : Users;

  return (
    <div id="admin-portal" className="min-h-[calc(100vh-5rem)] bg-slate-100/50 dark:bg-slate-950/65 backdrop-blur-[2px] pb-16 transition-colors duration-200">
      {/* Top Banner with Commission Controls & Active User Profile */}
      <div className="bg-slate-900 text-white border-b border-slate-800 shadow-md print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-2xl bg-indigo-600 text-white shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-black tracking-tight text-white">
                    Electoral Commission Control Panel
                  </h2>
                  {/* Current Active Staff User Badge */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-2xs font-extrabold uppercase tracking-wider bg-slate-800 text-indigo-300 border border-slate-700">
                      <RoleIcon className="w-3 h-3 text-indigo-400" />
                      <span>
                        {currentUser?.fullName || 'Electoral Commissioner'} ({effectiveRole})
                      </span>
                    </span>
                    {onLogout && (
                      <button
                        id="admin-badge-logout-btn"
                        type="button"
                        onClick={() => setIsLogoutConfirm(true)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider bg-rose-950/60 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-800/70 transition-colors cursor-pointer"
                        title="Log out from staff account"
                      >
                        <LogOut className="w-2.5 h-2.5" />
                        <span>Logout</span>
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {electionData.config.title} &bull; {electionData.config.schoolName}
                </p>
              </div>
            </div>

            {/* Poll Status State Machine Buttons & Navigation Controls */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {permissions.canChangePollStatus ? (
                <>
                  {status === 'Setup' && (
                    <button
                      id="open-voting-trigger-btn"
                      type="button"
                      onClick={() => setIsOpenPollsConfirm(true)}
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      <span>Open Voting (Start Polls)</span>
                    </button>
                  )}

                  {status === 'Open' && (
                    <button
                      id="close-voting-trigger-btn"
                      type="button"
                      onClick={() => setIsClosePollsConfirm(true)}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Square className="w-4 h-4 fill-slate-950" />
                      <span>Close Voting (End Polls)</span>
                    </button>
                  )}

                  {status === 'Closed' && (
                    <button
                      id="publish-results-trigger-btn"
                      type="button"
                      onClick={() => setIsPublishConfirm(true)}
                      className="px-4 py-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white font-black text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Publish Official Results</span>
                    </button>
                  )}

                  {status === 'Results Published' && (
                    <button
                      type="button"
                      onClick={() => onUpdateStatus('Closed')}
                      className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-2 border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Lock className="w-4 h-4" />
                      <span>Unpublish Results</span>
                    </button>
                  )}

                  {/* Unlock Setup if closed or open */}
                  {isSetupLocked && (
                    <button
                      id="unlock-setup-trigger-btn"
                      type="button"
                      onClick={() => setIsUnlockConfirm(true)}
                      title="Unlock setup to edit positions or candidates"
                      className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
                    >
                      <Unlock className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Unlock Setup</span>
                    </button>
                  )}
                </>
              ) : (
                <span
                  title="Your role does not have permission to alter poll state."
                  className="px-3 py-2 rounded-xl bg-slate-800/90 text-slate-400 text-2xs font-semibold border border-slate-700 flex items-center gap-1.5"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Poll Controls Restricted ({effectiveRole})</span>
                </span>
              )}

              {/* Direct Quick Link to Cryptographic Audit Trail */}
              <button
                id="admin-header-audit-quick-btn"
                type="button"
                onClick={() => {
                  setActiveTab('audit');
                  onTabChange?.('audit');
                }}
                className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  activeTab === 'audit'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-xs'
                    : 'bg-slate-800 hover:bg-slate-700 text-purple-300 border-purple-800/60'
                }`}
                title="View Court-Admissible Cryptographic Audit Trail (SHA-256 Chained)"
              >
                <History className="w-4 h-4 text-purple-400" />
                <span>Audit Trail &amp; Evidence ({electionData.auditLogs.length})</span>
              </button>

              {/* Return to booth button */}
              <button
                type="button"
                onClick={onReturnToBooth}
                className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Booth</span>
              </button>

              {/* Staff Logout button */}
              {onLogout && (
                <button
                  id="admin-logout-btn"
                  type="button"
                  onClick={() => setIsLogoutConfirm(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
                  title={`Log out of staff account (${currentUser?.fullName || 'Staff'})`}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Admin Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
        {/* Navigation Tabs Bar - wraps to second line without horizontal scrollbar */}
        <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-slate-200 dark:border-slate-800 print:hidden">
          <button
            id="tab-turnout"
            onClick={() => {
              setActiveTab('turnout');
              onTabChange?.('turnout');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'turnout'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
            }`}
          >
            <Flame className="w-4 h-4 text-amber-500" />
            <span>Turnout Monitor</span>
          </button>

          <button
            id="tab-audit"
            onClick={() => {
              setActiveTab('audit');
              onTabChange?.('audit');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'audit'
                ? 'bg-purple-600 text-white shadow-xs border border-purple-500'
                : 'text-purple-700 dark:text-purple-300 bg-purple-50/70 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-800'
            }`}
          >
            <History className={`w-4 h-4 ${activeTab === 'audit' ? 'text-white' : 'text-purple-600 dark:text-purple-400'}`} />
            <span>Audit Trail &amp; IP Security ({electionData.auditLogs.length})</span>
            <span className={`px-1.5 py-0.2 rounded-md text-3xs font-extrabold uppercase ${activeTab === 'audit' ? 'bg-purple-800 text-white' : 'bg-purple-200 text-purple-800 dark:bg-purple-900 dark:text-purple-200'}`}>
              NIST SHA-256
            </span>
          </button>

          <button
            id="tab-roster"
            onClick={() => {
              setActiveTab('roster');
              onTabChange?.('roster');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'roster'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
            }`}
          >
            <UserCheck className="w-4 h-4 text-blue-600" />
            <span>Voter Roster ({electionData.voters.length})</span>
          </button>

          <button
            id="tab-positions"
            onClick={() => {
              setActiveTab('positions');
              onTabChange?.('positions');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'positions'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
            }`}
          >
            <ListOrdered className="w-4 h-4 text-indigo-600" />
            <span>Positions ({electionData.positions.length})</span>
          </button>

          <button
            id="tab-candidates"
            onClick={() => {
              setActiveTab('candidates');
              onTabChange?.('candidates');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'candidates'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-600" />
            <span>Candidates ({electionData.candidates.length})</span>
          </button>

          <button
            id="tab-agent-charts"
            onClick={() => {
              setActiveTab('agentCharts');
              onTabChange?.('agentCharts');
            }}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              activeTab === 'agentCharts'
                ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
            }`}
          >
            <PieIcon className="w-4 h-4 text-emerald-600" />
            <span>Aspirant Agent Pie Charts</span>
          </button>

          {isDeveloper && (
            <button
              id="tab-accounts"
              onClick={() => {
                setActiveTab('accounts');
                onTabChange?.('accounts');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'accounts'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
              }`}
            >
              <UserCog className="w-4 h-4 text-indigo-600" />
              <span>Staff Accounts & Roles ({electionData.accounts?.length || 4})</span>
            </button>
          )}

          {isDeveloper && (
            <button
              id="tab-settings"
              onClick={() => {
                setActiveTab('settings');
                onTabChange?.('settings');
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeTab === 'settings'
                  ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-800'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/60 dark:hover:bg-slate-900/60'
              }`}
            >
              <Settings className="w-4 h-4 text-slate-600" />
              <span>Settings & Clock</span>
            </button>
          )}
        </div>

        {/* Tab Content Panels */}
        <div className="mt-6">
          {activeTab === 'turnout' && (
            <div className="space-y-6">
              {/* Election Clock prominently positioned for the Admin */}
              <ElectionClock
                config={electionData.config}
                status={status}
                variant="card"
              />

              <LiveTurnoutView
                config={electionData.config}
                status={status}
                positions={electionData.positions}
                candidates={electionData.candidates}
                ballots={electionData.ballots}
                voters={electionData.voters}
              />
            </div>
          )}

          {activeTab === 'agentCharts' && (
            <AgentMonitoringView
              config={electionData.config}
              status={status}
              positions={electionData.positions}
              candidates={electionData.candidates}
              ballots={electionData.ballots}
              voters={electionData.voters}
              onReturnToBooth={onReturnToBooth}
            />
          )}

          {activeTab === 'accounts' && isDeveloper && (
            <AccountsTab
              accounts={electionData.accounts || []}
              currentUser={currentUser}
              permissions={permissions}
              onAddAccount={onAddAccount}
              onUpdateAccount={onUpdateAccount}
              onDeleteAccount={onDeleteAccount}
              onSwitchUser={onSwitchUser}
              onLogout={onLogout}
            />
          )}

          {activeTab === 'accounts' && !isDeveloper && (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Developer Access Restricted</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only the developer account is authorized to view Staff Accounts &amp; Roles.
              </p>
            </div>
          )}

          {activeTab === 'positions' && (
            <PositionsTab
              positions={electionData.positions}
              candidates={electionData.candidates}
              isLocked={isSetupLocked || currentUser?.role !== 'Developer'}
              currentUser={currentUser}
              onUpdatePositions={onUpdatePositions}
              onDeletePosition={onDeletePosition}
              onUnlockRequest={() => setIsUnlockConfirm(true)}
            />
          )}

          {activeTab === 'candidates' && (
            <CandidatesTab
              candidates={electionData.candidates}
              positions={electionData.positions}
              isLocked={isSetupLocked || currentUser?.role !== 'Developer'}
              currentUser={currentUser}
              onAddCandidate={onAddCandidate}
              onUpdateCandidate={onUpdateCandidate}
              onDeleteCandidate={onDeleteCandidate}
              onUnlockRequest={() => setIsUnlockConfirm(true)}
            />
          )}

          {activeTab === 'roster' && (
            <VoterRosterTab
              voters={electionData.voters}
              requirePin={electionData.config.requirePin}
              electionTitle={electionData.config.title}
              schoolName={electionData.config.schoolName}
              currentUser={currentUser}
              onUpdateVoters={onUpdateVoters}
              onResetVoterStatus={onResetVoterStatus}
            />
          )}

          {activeTab === 'settings' && isDeveloper && (
            <div className="space-y-6">
              <ElectionSettingsTab
                config={electionData.config}
                status={status}
                currentUser={currentUser}
                onUpdateStatus={onUpdateStatus}
                onSaveConfig={onUpdateConfig}
                onStartNewElection={onStartNewElection}
                onExportBackupJson={onExportBackupJson}
                onImportBackupJson={onImportBackupJson}
                onLoadDefaultDemo={onLoadDefaultDemo}
              />

              {/* Live Preview of Election Clock for settings confirmation */}
              <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3 transition-colors">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Election Clock Live Simulation Preview</span>
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  This preview renders using your currently saved closing time ({electionData.config.closingTime || '18:00'}) and end date ({electionData.config.endDate || electionData.config.date}).
                </p>
                <ElectionClock
                  config={electionData.config}
                  status={status}
                  variant="card"
                />
              </div>
            </div>
          )}

          {activeTab === 'settings' && !isDeveloper && (
            <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-3 max-w-lg mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Developer Access Restricted</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Only the developer account is authorized to view Settings &amp; Clock.
              </p>
            </div>
          )}

          {activeTab === 'audit' && (
            <AuditLogTab
              auditLogs={electionData.auditLogs}
              currentUser={currentUser}
              electionData={electionData}
              status={status}
            />
          )}
        </div>
      </div>

      {/* Confirmation Modals */}
      {/* Open Polls Confirmation */}
      <ConfirmModal
        isOpen={isOpenPollsConfirm}
        title="Open Voting Station?"
        message={
          canOpenVoting
            ? `This will open the official voting booth for ${electionData.voters.length} registered students across ${electionData.positions.length} positions. Ballot setup will be locked during voting.`
            : `Notice: You currently have ${electionData.positions.length} positions, ${electionData.candidates.length} candidates, and ${electionData.voters.length} voters registered. We recommend having at least one position, candidate, and voter before opening polls.`
        }
        confirmLabel="Confirm & Open Polls"
        confirmVariant="success"
        onConfirm={() => {
          onUpdateStatus('Open');
          setIsOpenPollsConfirm(false);
          setActiveTab('turnout');
        }}
        onCancel={() => setIsOpenPollsConfirm(false)}
      />

      {/* Close Polls Confirmation */}
      <ConfirmModal
        isOpen={isClosePollsConfirm}
        title="Close Voting Station?"
        message="Are you sure you want to conclude the election? Once closed, students will no longer be able to submit ballots, and you can review final counts before publishing."
        confirmLabel="Confirm & Close Polls"
        confirmVariant="danger"
        onConfirm={() => {
          onUpdateStatus('Closed');
          setIsClosePollsConfirm(false);
          setActiveTab('turnout');
        }}
        onCancel={() => setIsClosePollsConfirm(false)}
      />

      {/* Publish Official Results Confirmation */}
      <ConfirmModal
        isOpen={isPublishConfirm}
        title="Publish Certified Results?"
        message="Publishing results will make official tallies, turnout charts, and winning candidates visible to students and the public."
        confirmLabel="Confirm & Publish"
        confirmVariant="success"
        onConfirm={() => {
          onUpdateStatus('Results Published');
          setIsPublishConfirm(false);
          setActiveTab('turnout');
        }}
        onCancel={() => setIsPublishConfirm(false)}
      />

      {/* Unlock Setup Confirmation */}
      <ConfirmModal
        isOpen={isUnlockConfirm}
        title="Unlock Ballot Setup?"
        message="Warning: Unlocking ballot setup will return the election to Setup mode. Ensure this is intentional if voting is already underway."
        confirmLabel="Yes, Unlock Setup"
        confirmVariant="warning"
        onConfirm={() => {
          onUpdateStatus('Setup');
          setIsUnlockConfirm(false);
          setActiveTab('positions');
        }}
        onCancel={() => setIsUnlockConfirm(false)}
      />

      {/* Staff Logout Confirmation Modal */}
      <ConfirmModal
        isOpen={isLogoutConfirm}
        title="Log Out of Staff Account?"
        message={`Are you sure you want to log out of your staff session (${currentUser?.fullName || 'Staff Member'} - ${effectiveRole})? This will lock administrative controls and return this station to the public Voter Booth.`}
        confirmLabel="Yes, Log Out"
        cancelLabel="Stay Logged In"
        confirmVariant="danger"
        onConfirm={() => {
          setIsLogoutConfirm(false);
          onLogout?.();
        }}
        onCancel={() => setIsLogoutConfirm(false)}
      />
    </div>
  );
};
