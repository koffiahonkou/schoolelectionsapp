export type ElectionStatus = 'Setup' | 'Open' | 'Closed' | 'Results Published';

export type UserRole =
  | 'Electoral Commissioner'
  | 'Association President'
  | 'Alumni Rep'
  | 'Developer'
  | 'Agent Monitor';

export interface RolePermissions {
  canConfigureElection: boolean; // Change title, school, date, closing time, clock options
  canManageBallot: boolean; // Add/edit/delete positions and candidates
  canManageRoster: boolean; // Import/edit voter roster, reset status
  canChangePollStatus: boolean; // Open polls, close polls, publish results
  canViewLiveTallies: boolean; // Live votes tallying
  canManageAccounts: boolean; // Create/edit user accounts & roles
  canResetElection: boolean; // Wipe election, start fresh
  canViewAuditLog: boolean; // Audit logs scrutiny
  canExportReports: boolean; // CSV & print report export
  canAccessDiagnostics: boolean; // Developer diagnostic tools & JSON dump
}

export interface UserAccount {
  id: string;
  username: string;
  fullName: string;
  role: UserRole;
  passwordPin: string;
  email?: string;
  createdAt: string;
  lastLogin?: string;
  isActive: boolean;
  twoFactorEnabled?: boolean;
  twoFactorSecret?: string;
  twoFactorBackupCodes?: string[];
  permissions?: RolePermissions; // Developer-granted custom permission overrides
}

export function getUserPermissions(account: UserAccount | null | undefined): RolePermissions {
  if (!account) {
    return { ...ROLE_PERMISSIONS['Electoral Commissioner'] };
  }
  if (account.permissions) {
    return {
      ...(ROLE_PERMISSIONS[account.role] || ROLE_PERMISSIONS['Electoral Commissioner']),
      ...account.permissions,
    };
  }
  return { ...(ROLE_PERMISSIONS[account.role] || ROLE_PERMISSIONS['Electoral Commissioner']) };
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  'Electoral Commissioner': {
    canConfigureElection: true,
    canManageBallot: false, // Restricted strictly to Developer account
    canManageRoster: true,
    canChangePollStatus: true,
    canViewLiveTallies: true,
    canManageAccounts: true,
    canResetElection: true,
    canViewAuditLog: true,
    canExportReports: true,
    canAccessDiagnostics: true,
  },
  'Association President': {
    canConfigureElection: false,
    canManageBallot: false,
    canManageRoster: false,
    canChangePollStatus: false,
    canViewLiveTallies: true,
    canManageAccounts: false,
    canResetElection: false,
    canViewAuditLog: true,
    canExportReports: true,
    canAccessDiagnostics: false,
  },
  'Alumni Rep': {
    canConfigureElection: false,
    canManageBallot: false,
    canManageRoster: false,
    canChangePollStatus: false,
    canViewLiveTallies: true,
    canManageAccounts: false,
    canResetElection: false,
    canViewAuditLog: true,
    canExportReports: true,
    canAccessDiagnostics: false,
  },
  Developer: {
    canConfigureElection: true,
    canManageBallot: true,
    canManageRoster: true,
    canChangePollStatus: true,
    canViewLiveTallies: true,
    canManageAccounts: true,
    canResetElection: true,
    canViewAuditLog: true,
    canExportReports: true,
    canAccessDiagnostics: true,
  },
  'Agent Monitor': {
    canConfigureElection: false,
    canManageBallot: false,
    canManageRoster: false,
    canChangePollStatus: false,
    canViewLiveTallies: true,
    canManageAccounts: false,
    canResetElection: false,
    canViewAuditLog: false,
    canExportReports: false,
    canAccessDiagnostics: false,
  },
};

export type BackgroundThemeOption = 'default' | 'warm_pavilion' | 'auditorium' | 'chamber' | 'minimal';

export interface ElectionConfig {
  id: string;
  title: string;
  schoolName: string;
  logoUrl?: string; // School crest or logo URL (uses placeholder if omitted)
  customBackgroundUrl?: string; // Custom image URL for booth and portal backgrounds
  backgroundTheme?: BackgroundThemeOption; // Background aesthetic theme
  date: string;
  endDate?: string; // End date for countdown clock
  closingTime?: string; // HH:MM or ISO timestamp for countdown
  showClockToVoters: boolean; // Display countdown clock to voters if results aren't yet published
  requirePin: boolean;
  adminPin: string;
  hideTalliesDuringVoting: boolean; // Hide candidate vote counts until closed
  allowPracticeBallot: boolean;
  enableCaptcha?: boolean; // Captcha anti-bot verification at login
}

export interface Position {
  id: string;
  title: string;
  description: string;
  maxSelections: number; // usually 1
  order: number;
}

export interface Candidate {
  id: string;
  positionId: string;
  name: string;
  slogan: string;
  photoUrl: string;
  manifesto: string;
}

export interface Voter {
  id: string;
  fullName: string;
  voterId: string; // Stored in normalized UPPERCASE
  pin?: string;
  hasVoted: boolean;
  votedAt?: string | null;
}

export const ABSTAIN_SELECTION = '__ABSTAIN__';

export interface Ballot {
  id: string;
  submittedAt: string;
  isPractice: boolean;
  // positionId -> candidateId OR '__ABSTAIN__'
  choices: Record<string, string>;
  evidenceHash?: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  eventType:
    | 'election_created'
    | 'settings_updated'
    | 'positions_updated'
    | 'candidates_updated'
    | 'roster_imported'
    | 'roster_modified'
    | 'voting_opened'
    | 'voting_closed'
    | 'results_published'
    | 'ballot_submitted'
    | 'election_reset'
    | 'setup_unlocked'
    | 'account_created'
    | 'account_updated'
    | 'account_deleted'
    | 'permissions_updated'
    | 'admin_login'
    | 'admin_logout'
    | 'admin_2fa_verified'
    | 'admin_auth_failed'
    | 'voter_reset'
    | 'data_backup_exported'
    | 'data_backup_imported'
    | 'rate_limit_exceeded'
    | 'security_alert'
    | 'voter_login'
    | 'voter_login_failed'
    | 'voter_session_timeout'
    | 'voter_session_cancelled'
    | 'ballot_receipt_generated'
    | 'results_accessed'
    | 'legal_audit_exported';
  details: string;
  category: 'election' | 'roster' | 'ballot' | 'security' | 'accounts' | 'admin';
  actor?: string; // Admin user name or "Master Admin" or "Voter"
  actorRole?: string; // Role of the actor
  ipAddress?: string; // Client IP address
  userAgent?: string; // Browser / Device info
  metadata?: Record<string, any>;
  previousHash?: string; // Cryptographic chain: hash of previous audit entry
  evidenceHash?: string; // SHA-256 integrity hash for legal admissibility
}

export interface IpLogEntry {
  id: string;
  ip: string;
  timestamp: string;
  endpoint: string;
  method: string;
  status: number;
  action: string;
  actor?: string;
  userAgent?: string;
  isSuspicious: boolean;
  threatReason?: string;
}

export interface SecurityThreatSummary {
  totalRequests: number;
  uniqueIps: number;
  suspiciousEvents: number;
  rateLimitedEvents: number;
  activeBlockedIps: string[];
  recentThreats: IpLogEntry[];
}

export interface PositionTally {
  position: Position;
  candidates: Array<{
    candidate: Candidate;
    votes: number;
    percentageOfValid: number;
    percentageOfTotal: number;
  }>;
  validVotes: number;
  abstainVotes: number;
  totalVotes: number;
  winners: Candidate[];
  isTie: boolean;
  tiedCandidates: Candidate[];
}

export interface ElectionTallyReport {
  totalRegisteredVoters: number;
  totalBallotsCast: number;
  turnoutPercentage: number;
  positionTallies: Record<string, PositionTally>;
}

export interface ElectionData {
  config: ElectionConfig;
  positions: Position[];
  candidates: Candidate[];
  voters: Voter[];
  ballots: Ballot[];
  auditLogs: AuditLogEntry[];
  accounts: UserAccount[];
}
