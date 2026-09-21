import React, { useState } from 'react';
import {
  RolePermissions,
  ROLE_PERMISSIONS,
  UserAccount,
  UserRole,
  getUserPermissions,
} from '../../../types';
import {
  Users,
  Shield,
  UserPlus,
  KeyRound,
  Trash2,
  Sparkles,
  Info,
  Check,
  X,
  LogIn,
  BadgeCheck,
  Terminal,
  Sliders,
  RotateCcw,
  CheckSquare,
  Square,
  ShieldAlert,
  Save,
  LogOut,
  Eye,
  Lock,
} from 'lucide-react';
import { ConfirmModal } from '../../Common/ConfirmModal';

interface AccountsTabProps {
  accounts: UserAccount[];
  currentUser: UserAccount | null;
  permissions: RolePermissions;
  onAddAccount: (account: Omit<UserAccount, 'id' | 'createdAt'>) => void;
  onUpdateAccount: (account: UserAccount) => void;
  onDeleteAccount: (accountId: string) => void;
  onSwitchUser: (account: UserAccount) => void;
  onLogout?: () => void;
}

export const PERMISSION_DEFINITIONS: Array<{
  key: keyof RolePermissions;
  label: string;
  description: string;
  category: string;
}> = [
  {
    key: 'canConfigureElection',
    label: 'Configure Election & Clock Settings',
    description: 'Edit election title, institution name, dates, closing countdown clock & visibility',
    category: 'Configuration',
  },
  {
    key: 'canManageBallot',
    label: 'Manage Ballot Races & Candidates (Developer Only)',
    description: 'Add, modify, reorder, or delete contested positions and registered aspirants (Restricted strictly to Developer accounts by system policy)',
    category: 'Ballot Setup',
  },
  {
    key: 'canManageRoster',
    label: 'Manage Voter Roster',
    description: 'Import voter CSVs, add or remove student voters, and reset voting status',
    category: 'Voter Registry',
  },
  {
    key: 'canChangePollStatus',
    label: 'Poll Controls (Open / Close / Publish)',
    description: 'Shift election status: open polls for students, close voting, and publish official certified tallies',
    category: 'Poll Controls',
  },
  {
    key: 'canViewLiveTallies',
    label: 'Real-Time Tallies & Turnout Monitoring',
    description: 'Access the live real-time turnout metrics, ballot count streams, and race-by-race tallies',
    category: 'Monitoring',
  },
  {
    key: 'canManageAccounts',
    label: 'Manage Officer Accounts & Roles',
    description: 'Create, edit, or delete staff user accounts and grant/revoke individual permissions',
    category: 'Access Control',
  },
  {
    key: 'canResetElection',
    label: 'Election Factory Reset',
    description: 'Clear recorded ballots and initialize a fresh election cycle',
    category: 'Administration',
  },
  {
    key: 'canViewAuditLog',
    label: 'Inspect Audit Trail Logs',
    description: 'Scrutinize tamper-evident chronological security audit logs and ballot events',
    category: 'Security & Audit',
  },
  {
    key: 'canExportReports',
    label: 'Export Certified Reports & CSVs',
    description: 'Generate downloadable CSV data files, audit transcripts, and printable certification sheets',
    category: 'Reporting',
  },
  {
    key: 'canAccessDiagnostics',
    label: 'Technical Diagnostics & Raw DB Tools',
    description: 'Developer utilities, raw JSON database inspection, schema verification, and mock generators',
    category: 'Technical',
  },
];

const ROLE_DETAILS: Record<
  UserRole,
  { badgeClass: string; title: string; description: string; icon: any }
> = {
  'Electoral Commissioner': {
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    title: 'Electoral Commissioner',
    description:
      'Supreme commission authority. Can configure election rules, manage candidates, upload voter rosters, control poll opening/closing, and certify results.',
    icon: Shield,
  },
  'Association President': {
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    title: 'Association President',
    description:
      'Executive stakeholder oversight. Can monitor live tallies, inspect turnout charts, review audit trails, and export results.',
    icon: BadgeCheck,
  },
  'Alumni Rep': {
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-300',
    title: 'Alumni Representative',
    description:
      'Independent external scrutiny. Can audit participation numbers, scrutinize candidate distributions in the Agent Monitor, and export verification transcripts.',
    icon: Users,
  },
  Developer: {
    badgeClass: 'bg-cyan-50 text-cyan-800 border-cyan-300',
    title: 'Systems Developer',
    description:
      'Technical engineering administration. Decides permissions for every account, inspects underlying storage schemas, system diagnostics, and account setups.',
    icon: Terminal,
  },
  'Agent Monitor': {
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-300',
    title: 'Agent Monitor (Observer)',
    description:
      'Accredited election monitoring agent account. Dedicated exclusively to viewing real-time race monitoring charts with administrative controls locked.',
    icon: Eye,
  },
};

export const AccountsTab: React.FC<AccountsTabProps> = ({
  accounts,
  currentUser,
  permissions,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onSwitchUser,
  onLogout,
}) => {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<UserAccount | null>(null);

  // Permission Editor Modal State (Developer & Account Admin Control)
  const [accountForPermissions, setAccountForPermissions] = useState<UserAccount | null>(null);
  const [draftPermissions, setDraftPermissions] = useState<RolePermissions | null>(null);

  // New account form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [passwordPin, setPasswordPin] = useState('');
  const [role, setRole] = useState<UserRole>('Association President');
  const [email, setEmail] = useState('');
  const [customPermsInCreate, setCustomPermsInCreate] = useState(false);
  const [createCustomPermissions, setCreateCustomPermissions] = useState<RolePermissions>(
    ROLE_PERMISSIONS['Association President']
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Active matrix view mode: 'roles' or 'users'
  const [matrixView, setMatrixView] = useState<'users' | 'roles'>('users');

  const canManageAccounts = permissions.canManageAccounts || currentUser?.role === 'Developer';

  // Open Permission Editor
  const handleOpenPermissionsEditor = (acc: UserAccount) => {
    setAccountForPermissions(acc);
    setDraftPermissions(getUserPermissions(acc));
  };

  // Toggle single permission in draft editor
  const handleToggleDraftPermission = (key: keyof RolePermissions) => {
    if (!draftPermissions) return;
    if (key === 'canManageBallot' && accountForPermissions?.role !== 'Developer') {
      return;
    }
    setDraftPermissions({
      ...draftPermissions,
      [key]: !draftPermissions[key],
    });
  };

  // Save Permissions to User Account
  const handleSavePermissions = () => {
    if (!accountForPermissions || !draftPermissions) return;
    const finalPermissions = {
      ...draftPermissions,
      canManageBallot: accountForPermissions.role === 'Developer' ? draftPermissions.canManageBallot : false,
    };
    onUpdateAccount({
      ...accountForPermissions,
      permissions: finalPermissions,
    });
    setAccountForPermissions(null);
    setDraftPermissions(null);
  };

  // Preset handlers for permissions editor
  const handleResetToRoleDefault = () => {
    if (!accountForPermissions) return;
    setDraftPermissions({ ...ROLE_PERMISSIONS[accountForPermissions.role] });
  };

  const handleGrantAll = () => {
    if (!draftPermissions) return;
    const allGranted: RolePermissions = {
      canConfigureElection: true,
      canManageBallot: accountForPermissions?.role === 'Developer',
      canManageRoster: true,
      canChangePollStatus: true,
      canViewLiveTallies: true,
      canManageAccounts: true,
      canResetElection: true,
      canViewAuditLog: true,
      canExportReports: true,
      canAccessDiagnostics: true,
    };
    setDraftPermissions(allGranted);
  };

  const handleRevokeAll = () => {
    if (!draftPermissions) return;
    const allRevoked: RolePermissions = {
      canConfigureElection: false,
      canManageBallot: false,
      canManageRoster: false,
      canChangePollStatus: false,
      canViewLiveTallies: false,
      canManageAccounts: false,
      canResetElection: false,
      canViewAuditLog: true, // keep audit viewing as safety baseline
      canExportReports: false,
      canAccessDiagnostics: false,
    };
    setDraftPermissions(allRevoked);
  };

  // Handle direct click in the User Permissions Matrix
  const handleToggleUserPermissionDirectly = (acc: UserAccount, key: keyof RolePermissions) => {
    if (!canManageAccounts) return;
    if (key === 'canManageBallot' && acc.role !== 'Developer') {
      // Ballot management is strictly reserved for the Developer role
      return;
    }
    const current = getUserPermissions(acc);
    const updated = {
      ...current,
      [key]: !current[key],
    };
    onUpdateAccount({
      ...acc,
      permissions: updated,
    });
  };

  // Handle Create Account Submit
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setFormError('Username cannot be empty.');
      return;
    }

    if (accounts.some((a) => a.username.toLowerCase() === cleanUsername)) {
      setFormError(`Username "${cleanUsername}" is already in use.`);
      return;
    }

    if (!passwordPin.trim()) {
      setFormError('Password or PIN is required.');
      return;
    }

    onAddAccount({
      fullName: fullName.trim() || 'Staff Officer',
      username: cleanUsername,
      passwordPin: passwordPin.trim(),
      role,
      email: email.trim() || undefined,
      isActive: true,
      permissions: customPermsInCreate ? createCustomPermissions : undefined,
    });

    // Reset
    setFullName('');
    setUsername('');
    setPasswordPin('');
    setRole('Association President');
    setEmail('');
    setCustomPermsInCreate(false);
    setCreateCustomPermissions(ROLE_PERMISSIONS['Association President']);
    setIsCreateModalOpen(false);
  };

  const isDeveloper = currentUser?.role === 'Developer';
  if (!isDeveloper) {
    return (
      <div id="accounts-restricted-container" className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-xl mx-auto my-8">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Developer Account Required</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Only the developer account is authorized to view and manage Staff Accounts &amp; Roles.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header with Developer Guidance & Create Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Staff Accounts & Developer Permission Controls</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage user accounts and decide exact permissions to grant to any user account.
          </p>
        </div>

        {canManageAccounts && (
          <button
            id="create-account-btn"
            type="button"
            onClick={() => {
              setCreateCustomPermissions(ROLE_PERMISSIONS[role]);
              setIsCreateModalOpen(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User Account</span>
          </button>
        )}
      </div>

      {/* Developer Permission Control Banner */}
      <div className="p-4 rounded-3xl bg-cyan-50 border border-cyan-200 text-cyan-950 text-xs flex items-start gap-3 shadow-2xs">
        <div className="p-2 rounded-xl bg-cyan-600 text-white shrink-0 mt-0.5">
          <Terminal className="w-4 h-4" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <strong className="text-cyan-900 text-sm font-black">
              Developer Permission Management
            </strong>
            <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold uppercase tracking-wider bg-cyan-200 text-cyan-900">
              Active Control
            </span>
          </div>
          <p className="text-cyan-800 leading-relaxed">
            As a developer or administrator, you can directly grant or revoke any of the 10 system permissions for any individual user account. Click <strong>"Permissions"</strong> on any account card or click any cell in the <strong>Active User Permissions Matrix</strong> below to toggle capabilities in real time.
          </p>
        </div>
      </div>

      {!canManageAccounts && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            You are viewing accounts in read-only observer mode. Log in as <strong>Developer</strong> or <strong>Electoral Commissioner</strong> to adjust user permissions.
          </span>
        </div>
      )}

      {/* Accounts List Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {accounts.map((acc) => {
          const roleConfig = ROLE_DETAILS[acc.role] || ROLE_DETAILS['Electoral Commissioner'];
          const isMe = currentUser?.id === acc.id || currentUser?.username === acc.username;
          const RoleIcon = roleConfig.icon;
          const accPerms = getUserPermissions(acc);
          const hasCustomPermissions = Boolean(acc.permissions);

          return (
            <div
              key={acc.id}
              className={`bg-white rounded-3xl p-5 border transition-all shadow-2xs flex flex-col justify-between ${
                isMe ? 'border-indigo-500 ring-2 ring-indigo-500/10' : 'border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2.5 rounded-2xl ${
                        acc.role === 'Electoral Commissioner'
                          ? 'bg-indigo-600 text-white'
                          : acc.role === 'Developer'
                          ? 'bg-cyan-600 text-white'
                          : acc.role === 'Association President'
                          ? 'bg-emerald-600 text-white'
                          : acc.role === 'Agent Monitor'
                          ? 'bg-purple-600 text-white'
                          : 'bg-amber-600 text-white'
                      }`}
                    >
                      <RoleIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-sm text-slate-900">{acc.fullName}</h4>
                        {isMe && (
                          <span className="px-2 py-0.5 rounded-full text-3xs font-black uppercase bg-indigo-100 text-indigo-800">
                            You
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-500 font-mono">@{acc.username}</span>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-extrabold uppercase tracking-wider border ${roleConfig.badgeClass}`}
                    >
                      {acc.role}
                    </span>
                    {hasCustomPermissions && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-extrabold uppercase tracking-wider bg-cyan-100 text-cyan-800 border border-cyan-200">
                        <Sparkles className="w-2.5 h-2.5" />
                        Customized
                      </span>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-600 leading-relaxed mb-3">
                  {roleConfig.description}
                </p>

                {/* Active Permissions Checklist Preview */}
                <div className="space-y-1.5 mb-4 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                  <div className="flex items-center justify-between text-2xs font-extrabold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-200/60">
                    <span>Active Granted Capabilities</span>
                    <span>
                      {Object.values(accPerms).filter(Boolean).length}/10 Granted
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-2xs font-semibold text-slate-600 pt-1">
                    <span className="flex items-center gap-1.5">
                      {accPerms.canChangePollStatus ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Poll Controls</span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      {accPerms.canManageBallot ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Ballot Setup</span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      {accPerms.canManageRoster ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Voter Roster</span>
                    </span>

                    <span className="flex items-center gap-1.5">
                      {accPerms.canViewLiveTallies ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <X className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span>Live Tallies</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Bottom Card Controls */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1 text-2xs text-slate-400 font-mono">
                  <KeyRound className="w-3 h-3 text-slate-400" />
                  <span>PIN: {acc.passwordPin}</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Permissions Edit Button (Developer Feature) */}
                  {canManageAccounts && (
                    <button
                      id={`edit-perms-btn-${acc.username}`}
                      type="button"
                      onClick={() => handleOpenPermissionsEditor(acc)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-800 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border border-cyan-200"
                      title="Adjust permissions for this account"
                    >
                      <Sliders className="w-3.5 h-3.5 text-cyan-700" />
                      <span>Permissions</span>
                    </button>
                  )}

                  {isMe && onLogout && (
                    <button
                      id="accounts-logout-staff-btn"
                      type="button"
                      onClick={onLogout}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 border border-rose-200"
                      title="Log out of your staff account"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-600" />
                      <span>Logout</span>
                    </button>
                  )}

                  {!isMe && (
                    <button
                      type="button"
                      onClick={() => onSwitchUser(acc)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
                    >
                      <LogIn className="w-3 h-3 text-slate-600" />
                      <span>Switch</span>
                    </button>
                  )}

                  {canManageAccounts && !isMe && accounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setAccountToDelete(acc)}
                      title="Delete account"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Permissions Matrix Reference Table with Interactive Developer Toggle */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Sliders className="w-4 h-4 text-cyan-600" />
              <span>Permission Enforcement Matrix</span>
            </h4>
            <p className="text-xs text-slate-500 mt-0.5">
              {matrixView === 'users'
                ? 'Developer interactive grid: Click any cell to toggle permissions for that specific account.'
                : 'Baseline permission template defaults associated with each authority role.'}
            </p>
          </div>

          <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setMatrixView('users')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                matrixView === 'users'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Active User Account ({accounts.length})
            </button>
            <button
              type="button"
              onClick={() => setMatrixView('roles')}
              className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                matrixView === 'roles'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Role Baseline
            </button>
          </div>
        </div>

        {/* 1. Interactive User Account Matrix (Developer Control) */}
        {matrixView === 'users' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-extrabold text-2xs uppercase tracking-wider">
                  <th className="py-3 px-3">System Permission</th>
                  {accounts.map((acc) => (
                    <th key={acc.id} className="py-3 px-3 text-center">
                      <div className="flex flex-col items-center">
                        <span className="font-bold text-slate-900 truncate max-w-[120px]">
                          {acc.fullName.split(' ')[0]}
                        </span>
                        <span className="text-3xs font-mono text-slate-400 lowercase">
                          @{acc.username}
                        </span>
                        <span className="text-3xs px-1.5 py-0.2 rounded-full font-extrabold uppercase bg-slate-100 text-slate-600 mt-0.5">
                          {acc.role.split(' ')[0]}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {PERMISSION_DEFINITIONS.map((def) => (
                  <tr key={def.key} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800 block">{def.label}</span>
                      <span className="text-3xs text-slate-400 block">{def.description}</span>
                    </td>
                    {accounts.map((acc) => {
                      const userPerms = getUserPermissions(acc);
                      const isAllowed = userPerms[def.key];

                      return (
                        <td key={acc.id} className="py-3 px-3 text-center">
                          {canManageAccounts ? (
                            <button
                              type="button"
                              onClick={() => handleToggleUserPermissionDirectly(acc, def.key)}
                              title={`Click to ${isAllowed ? 'revoke' : 'grant'} "${def.label}" for ${acc.fullName}`}
                              className={`inline-flex items-center justify-center w-7 h-7 rounded-xl transition-all cursor-pointer ${
                                isAllowed
                                  ? 'bg-emerald-100 hover:bg-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 hover:bg-slate-200 text-slate-400'
                              }`}
                            >
                              {isAllowed ? (
                                <Check className="w-4 h-4 text-emerald-700" />
                              ) : (
                                <X className="w-4 h-4 text-slate-400" />
                              )}
                            </button>
                          ) : (
                            <span
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                                isAllowed
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                              {isAllowed ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* 2. Role Baseline Matrix */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-extrabold text-2xs uppercase tracking-wider">
                  <th className="py-3 px-3">System Capability</th>
                  <th className="py-3 px-3 text-center text-indigo-600">Electoral Commissioner</th>
                  <th className="py-3 px-3 text-center text-emerald-600">Association President</th>
                  <th className="py-3 px-3 text-center text-amber-600">Alumni Rep</th>
                  <th className="py-3 px-3 text-center text-cyan-600">Developer</th>
                  <th className="py-3 px-3 text-center text-purple-600">Agent Monitor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {PERMISSION_DEFINITIONS.map((def) => (
                  <tr key={def.key} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <span className="font-semibold text-slate-800 block">{def.label}</span>
                      <span className="text-3xs text-slate-400">{def.description}</span>
                    </td>
                    {(
                      [
                        'Electoral Commissioner',
                        'Association President',
                        'Alumni Rep',
                        'Developer',
                        'Agent Monitor',
                      ] as UserRole[]
                    ).map((r) => {
                      const isAllowed = ROLE_PERMISSIONS[r][def.key];
                      return (
                        <td key={r} className="py-3 px-3 text-center">
                          {isAllowed ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-400">
                              <X className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* DEDICATED PERMISSIONS EDITOR MODAL (Developer Authority Control) */}
      {accountForPermissions && draftPermissions && (
        <div
          id="permissions-editor-modal"
          className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 pb-8 px-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-cyan-600 text-white">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-2xs font-extrabold uppercase tracking-wider text-cyan-700">
                    Developer Access Control
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    Permissions for {accountForPermissions.fullName}
                  </h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-500 font-mono">
                      @{accountForPermissions.username}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-3xs font-extrabold uppercase bg-slate-100 text-slate-700 border border-slate-200">
                      {accountForPermissions.role}
                    </span>
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setAccountForPermissions(null);
                  setDraftPermissions(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Action Presets */}
            <div className="py-3 flex items-center justify-between gap-2 flex-wrap bg-slate-50/80 px-4 -mx-6 sm:-mx-8 border-b border-slate-100 shrink-0">
              <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-400">
                Developer Presets:
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleResetToRoleDefault}
                  className="px-2.5 py-1 rounded-lg text-2xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Role Default</span>
                </button>
                <button
                  type="button"
                  onClick={handleGrantAll}
                  className="px-2.5 py-1 rounded-lg text-2xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <CheckSquare className="w-3 h-3" />
                  <span>Grant All (10)</span>
                </button>
                <button
                  type="button"
                  onClick={handleRevokeAll}
                  className="px-2.5 py-1 rounded-lg text-2xs font-bold bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Square className="w-3 h-3" />
                  <span>Revoke All</span>
                </button>
              </div>
            </div>

            {/* Interactive Permissions List */}
            <div className="overflow-y-auto py-4 space-y-3 flex-1 pr-1">
              {PERMISSION_DEFINITIONS.map((def) => {
                const isRestricted = def.key === 'canManageBallot' && accountForPermissions?.role !== 'Developer';
                const isChecked = isRestricted ? false : Boolean(draftPermissions[def.key]);
                return (
                  <div
                    key={def.key}
                    onClick={() => {
                      if (!isRestricted) {
                        handleToggleDraftPermission(def.key);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                      isRestricted
                        ? 'bg-slate-50/70 border-slate-200 opacity-60 cursor-not-allowed'
                        : isChecked
                        ? 'bg-emerald-50/60 border-emerald-200 ring-1 ring-emerald-500/20 cursor-pointer'
                        : 'bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{def.label}</span>
                        <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                          {def.category}
                        </span>
                        {isRestricted && (
                          <span className="text-3xs font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-md flex items-center gap-1">
                            <Lock className="w-2.5 h-2.5" />
                            Developer Only
                          </span>
                        )}
                      </div>
                      <p className="text-2xs text-slate-500 leading-relaxed">
                        {def.description}
                      </p>
                    </div>

                    <div className="shrink-0 pt-0.5">
                      <div
                        className={`w-6 h-6 rounded-xl flex items-center justify-center transition-colors ${
                          isRestricted
                            ? 'bg-slate-100 text-slate-400 border border-slate-200'
                            : isChecked
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 text-slate-300 border border-slate-200'
                        }`}
                      >
                        {isRestricted ? (
                          <Lock className="w-3 h-3 text-slate-400" />
                        ) : isChecked ? (
                          <Check className="w-4 h-4" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
              <span className="text-2xs text-slate-500">
                {Object.values(draftPermissions).filter(Boolean).length} of 10 permissions granted
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setAccountForPermissions(null);
                    setDraftPermissions(null);
                  }}
                  className="px-4 py-2 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePermissions}
                  className="px-4 py-2 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Permissions</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE NEW ACCOUNT MODAL */}
      {isCreateModalOpen && (
        <div
          id="create-account-modal"
          className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 pb-8 px-4 bg-slate-950/70 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 animate-in fade-in slide-in-from-top-4 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-indigo-600 text-white">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-2xs font-extrabold uppercase tracking-wider text-slate-500">
                    Access Control
                  </span>
                  <h3 className="text-lg font-bold text-slate-900">Create New Staff Account</h3>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Dr. Arthur Kingsley"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="e.g. akingsley"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Password / PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={passwordPin}
                    onChange={(e) => setPasswordPin(e.target.value)}
                    placeholder="e.g. secure123"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Assigned Authority Role *
                </label>
                <select
                  value={role}
                  onChange={(e) => {
                    const newRole = e.target.value as UserRole;
                    setRole(newRole);
                    if (!customPermsInCreate) {
                      setCreateCustomPermissions(ROLE_PERMISSIONS[newRole]);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-bold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden bg-white"
                >
                  <option value="Electoral Commissioner">
                    Electoral Commissioner (Full Election Authority)
                  </option>
                  <option value="Association President">
                    Association President (Executive Scrutiny & Tallies)
                  </option>
                  <option value="Alumni Rep">
                    Alumni Rep (Independent External Oversight)
                  </option>
                  <option value="Developer">
                    Developer (System Diagnostics & Tech Control)
                  </option>
                  <option value="Agent Monitor">
                    Agent Monitor (Observer - View-Only Real-Time Monitor)
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Email (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. officer@school.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
                />
              </div>

              {/* Developer Custom Permissions Toggle in Creation */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-slate-900 flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={customPermsInCreate}
                      onChange={(e) => {
                        setCustomPermsInCreate(e.target.checked);
                        if (e.target.checked) {
                          setCreateCustomPermissions(ROLE_PERMISSIONS[role]);
                        }
                      }}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Customize Specific Permissions Now (Developer Option)</span>
                  </label>
                </div>

                {customPermsInCreate ? (
                  <div className="space-y-2 p-3 bg-slate-50 rounded-2xl border border-slate-200 max-h-48 overflow-y-auto">
                    {PERMISSION_DEFINITIONS.map((def) => {
                      const isRestricted = def.key === 'canManageBallot' && role !== 'Developer';
                      return (
                        <label
                          key={def.key}
                          className={`flex items-center gap-2 text-2xs font-semibold text-slate-700 ${
                            isRestricted ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-slate-900'
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={isRestricted}
                            checked={isRestricted ? false : Boolean(createCustomPermissions[def.key])}
                            onChange={(e) =>
                              setCreateCustomPermissions({
                                ...createCustomPermissions,
                                [def.key]: isRestricted ? false : e.target.checked,
                              })
                            }
                            className="w-3.5 h-3.5 rounded text-indigo-600"
                          />
                          <span>{def.label}</span>
                          {isRestricted && (
                            <span className="text-3xs text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded-sm">
                              Developer Only
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200">
                    <span className="text-2xs font-bold text-slate-500 block mb-1">
                      Role Template Baseline:
                    </span>
                    <p className="text-2xs text-slate-600 leading-relaxed">
                      Will receive standard permissions for <strong>{role}</strong>. You can fine-tune these any time.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Save Account</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE ACCOUNT CONFIRM MODAL */}
      <ConfirmModal
        isOpen={Boolean(accountToDelete)}
        title="Delete Officer Account"
        message={`Are you sure you want to delete the account for "${accountToDelete?.fullName}" (@${accountToDelete?.username})? This action cannot be undone.`}
        confirmText="Delete Account"
        confirmVariant="danger"
        onConfirm={() => {
          if (accountToDelete) {
            onDeleteAccount(accountToDelete.id);
            setAccountToDelete(null);
          }
        }}
        onCancel={() => setAccountToDelete(null)}
      />
    </div>
  );
};
