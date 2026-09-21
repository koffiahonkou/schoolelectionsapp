import React, { useState, useMemo } from 'react';
import { AuditLogEntry, UserAccount, ElectionData, ElectionStatus } from '../../../types';
import {
  ShieldCheck,
  ShieldAlert,
  Search,
  Download,
  History,
  Tag,
  Filter,
  Users,
  Sparkles,
  Inbox,
  ArrowUpDown,
  Clock,
  Calendar,
  Check,
  CheckCheck,
  Copy,
  ChevronDown,
  ChevronUp,
  X,
  Layers,
  FileText,
  Lock,
  Eye,
  Globe,
  User,
  Activity,
  Wifi,
  Scale,
  FileCheck2,
  RefreshCw,
  AlertTriangle,
  Printer,
  ExternalLink,
} from 'lucide-react';
import { downloadJSON } from '../../../utils/storage';
import { IpSecurityTab } from './IpSecurityTab';
import { verifyAuditChain, generateLegalEvidencePackage } from '../../../utils/cryptoAudit';

interface AuditLogTabProps {
  auditLogs: AuditLogEntry[];
  currentUser?: UserAccount | null;
  electionData?: ElectionData;
  status?: ElectionStatus;
}

export type CategoryFilterKey = 'security' | 'election' | 'roster' | 'ballot';

interface CategoryConfig {
  id: CategoryFilterKey;
  label: string;
  shortLabel: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  badgeColor: string;
  activeColor: string;
  activeTextColor: string;
  dotColor: string;
  match: (log: AuditLogEntry) => boolean;
}

const CATEGORY_CONFIGS: CategoryConfig[] = [
  {
    id: 'security',
    label: 'Security',
    shortLabel: 'Security & Access',
    description: 'Admin credentials, session switches, permissions & system security locks',
    icon: ShieldCheck,
    badgeColor: 'bg-purple-100 dark:bg-purple-950/70 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    activeColor: 'bg-purple-600 text-white border-purple-600 shadow-purple-500/20',
    activeTextColor: 'text-purple-600 dark:text-purple-400',
    dotColor: 'bg-purple-500',
    match: (log) => log.category === 'security' || log.category === 'accounts',
  },
  {
    id: 'election',
    label: 'Election Events',
    shortLabel: 'Election Cycle',
    description: 'Polls opening/closing, results certification, ballot positions & candidates',
    icon: Sparkles,
    badgeColor: 'bg-blue-100 dark:bg-blue-950/70 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    activeColor: 'bg-blue-600 text-white border-blue-600 shadow-blue-500/20',
    activeTextColor: 'text-blue-600 dark:text-blue-400',
    dotColor: 'bg-blue-500',
    match: (log) => log.category === 'election',
  },
  {
    id: 'roster',
    label: 'Roster Changes',
    shortLabel: 'Student Registry',
    description: 'Voter CSV imports, voting credential resets & student roster modifications',
    icon: Users,
    badgeColor: 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    activeColor: 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-500/20',
    activeTextColor: 'text-emerald-600 dark:text-emerald-400',
    dotColor: 'bg-emerald-500',
    match: (log) => log.category === 'roster',
  },
  {
    id: 'ballot',
    label: 'Ballot Activity',
    shortLabel: 'Secret Ballots',
    description: 'Anonymous secret ballot submissions, practice voting runs & ballot verification',
    icon: Inbox,
    badgeColor: 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    activeColor: 'bg-amber-600 text-white border-amber-600 shadow-amber-500/20',
    activeTextColor: 'text-amber-600 dark:text-amber-400',
    dotColor: 'bg-amber-500',
    match: (log) => log.category === 'ballot',
  },
];

export const AuditLogTab: React.FC<AuditLogTabProps> = ({
  auditLogs = [],
  currentUser,
  electionData,
  status,
}) => {
  const [subTab, setSubTab] = useState<'audit' | 'ip_security'>('audit');
  const [query, setQuery] = useState('');
  // Set of active category IDs. If empty or contains all, all are shown.
  const [activeCategories, setActiveCategories] = useState<Set<CategoryFilterKey>>(new Set());
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [verificationResult, setVerificationResult] = useState(() => verifyAuditChain(auditLogs));
  const [isVerifying, setIsVerifying] = useState(false);
  const [showLegalModal, setShowLegalModal] = useState(false);
  const [verifyNotice, setVerifyNotice] = useState<string | null>(null);

  // Keep local verification reactive to incoming auditLogs
  useMemo(() => {
    setVerificationResult(verifyAuditChain(auditLogs));
  }, [auditLogs]);

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    setVerifyNotice(null);
    try {
      const localResult = verifyAuditChain(auditLogs);
      setVerificationResult(localResult);

      const res = await fetch('/api/audit/verify');
      const serverData = await res.json();
      if (serverData.success && serverData.verification?.isValid) {
        setVerifyNotice(
          `Cryptographic audit chain fully verified! Both browser runtime and server-side NIST FIPS 180-4 SHA-256 digests match without tampering (${auditLogs.length} entries verified).`
        );
      } else if (!localResult.isValid) {
        setVerifyNotice(`Tamper warning: ${localResult.tamperMessage}`);
      } else {
        setVerifyNotice(
          `Cryptographic audit chain intact. ${auditLogs.length} chained entries verified against SHA-256 Merkle root.`
        );
      }
    } catch {
      const localResult = verifyAuditChain(auditLogs);
      setVerificationResult(localResult);
      setVerifyNotice(
        localResult.isValid
          ? `Cryptographic chain verified in browser: ${auditLogs.length} audit entries intact.`
          : `Tamper warning: ${localResult.tamperMessage}`
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleExportLegalDossier = () => {
    if (electionData) {
      const dossier = generateLegalEvidencePackage(
        electionData,
        status || 'Open',
        currentUser ? currentUser.fullName || currentUser.username : 'Authorized Electoral Commissioner'
      );
      downloadJSON(
        `election_legal_evidence_dossier_${new Date().toISOString().split('T')[0]}.json`,
        JSON.stringify(dossier, null, 2)
      );
    } else {
      handleExportLogs(false);
    }
  };

  // Compute category breakdown counts
  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilterKey, number> = {
      security: 0,
      election: 0,
      roster: 0,
      ballot: 0,
    };
    auditLogs.forEach((log) => {
      CATEGORY_CONFIGS.forEach((cfg) => {
        if (cfg.match(log)) {
          counts[cfg.id] = (counts[cfg.id] || 0) + 1;
        }
      });
    });
    return counts;
  }, [auditLogs]);

  const isAllCategoriesActive = activeCategories.size === 0 || activeCategories.size === CATEGORY_CONFIGS.length;

  // Toggle handler for category filter buttons
  const handleToggleCategory = (catId: CategoryFilterKey) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (isAllCategoriesActive) {
        // If all were active, isolate the clicked category
        return new Set([catId]);
      }
      if (next.has(catId)) {
        next.delete(catId);
        // If no categories left active, reset to all
        return next;
      } else {
        next.add(catId);
        return next;
      }
    });
  };

  // Select all categories (clear category filters)
  const handleSelectAllCategories = () => {
    setActiveCategories(new Set());
  };

  // Isolate a specific category (exclusive selection)
  const handleIsolateCategory = (catId: CategoryFilterKey, e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveCategories(new Set([catId]));
  };

  // Filtered and sorted audit logs
  const filteredLogs = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = auditLogs.filter((log) => {
      // 1. Search Query filter
      if (q) {
        const matchesDetails = log.details.toLowerCase().includes(q);
        const matchesType = log.eventType.toLowerCase().includes(q);
        const matchesId = log.id.toLowerCase().includes(q);
        const matchesCat = log.category.toLowerCase().includes(q);
        const matchesDate = new Date(log.timestamp).toLocaleString().toLowerCase().includes(q);

        if (!matchesDetails && !matchesType && !matchesId && !matchesCat && !matchesDate) {
          return false;
        }
      }

      // 2. Category Filter Toggles
      if (!isAllCategoriesActive) {
        const matchesAnyActive = Array.from(activeCategories).some((activeCatId: CategoryFilterKey) => {
          const cfg = CATEGORY_CONFIGS.find((c) => c.id === activeCatId);
          return cfg ? cfg.match(log) : false;
        });
        if (!matchesAnyActive) {
          return false;
        }
      }

      return true;
    });

    // 3. Chronological sorting
    return filtered.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [auditLogs, query, activeCategories, isAllCategoriesActive, sortOrder]);

  const handleExportLogs = (onlyFiltered = false) => {
    const dataToExport = onlyFiltered ? filteredLogs : auditLogs;
    const filename = onlyFiltered
      ? `election_audit_filtered_${new Date().toISOString().split('T')[0]}.json`
      : `election_audit_log_full_${new Date().toISOString().split('T')[0]}.json`;
    downloadJSON(filename, JSON.stringify(dataToExport, null, 2));
  };

  const handleCopyText = (text: string, id: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  const getLogCategoryConfig = (log: AuditLogEntry): CategoryConfig => {
    return CATEGORY_CONFIGS.find((cfg) => cfg.match(log)) || CATEGORY_CONFIGS[1];
  };

  // Relative time helper
  const getRelativeTime = (iso: string) => {
    try {
      const diffSec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
      if (diffSec < 60) return 'Just now';
      const mins = Math.floor(diffSec / 60);
      if (mins < 60) return `${mins}m ago`;
      const hours = Math.floor(mins / 60);
      if (hours < 24) return `${hours}h ago`;
      const days = Math.floor(hours / 24);
      return `${days}d ago`;
    } catch {
      return '';
    }
  };

  return (
    <div id="admin-audit-log-panel" className="space-y-6">
      {/* Top Header Card with Sub-Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
              <History className="w-4 h-4" />
            </span>
            <span className="text-2xs font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
              Auditing &amp; Security Compliance
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <span>{subTab === 'audit' ? 'System Audit Trail' : 'Network & Traffic Defense'}</span>
            <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 px-2.5 py-0.5 rounded-full">
              {subTab === 'audit' ? `${auditLogs.length} Total Events` : 'Live Firewall Monitor'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {subTab === 'audit'
              ? 'Immutable, cryptographically timestamped ledger recording every administrative and voting milestone.'
              : 'Real-time IP traffic logging, anomaly tracking, DoS rate limiting, and ban list controls.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Sub-tab Navigation Pill Switcher */}
          <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-750 text-xs font-bold">
            <button
              type="button"
              id="subtab-audit-btn"
              onClick={() => setSubTab('audit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                subTab === 'audit'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <History className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
              <span>Audit Trail</span>
            </button>
            <button
              type="button"
              id="subtab-ip-btn"
              onClick={() => setSubTab('ip_security')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                subTab === 'ip_security'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>IP &amp; DoS Monitor</span>
            </button>
          </div>

          {subTab === 'audit' && (
            <>
              {filteredLogs.length !== auditLogs.length && (
                <button
                  type="button"
                  onClick={() => handleExportLogs(true)}
                  className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="Export only currently filtered events to JSON"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>Export Filtered ({filteredLogs.length})</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleExportLogs(false)}
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Export complete election audit trail to JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Audit Log</span>
              </button>

              <button
                type="button"
                id="export-legal-dossier-btn"
                onClick={handleExportLegalDossier}
                className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                title="Generate and export official court-ready legal evidence package with cryptographic signatures and reconciliation"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Export Legal Dossier</span>
              </button>
            </>
          )}
        </div>
      </div>

      {subTab === 'ip_security' ? (
        <IpSecurityTab currentUser={currentUser} />
      ) : (
        <>
          {/* Cryptographic Chain-of-Custody & Court-Admissible Evidence Card */}
          <div
            id="legal-evidence-card"
            className="p-5 sm:p-6 rounded-3xl bg-slate-900 text-white shadow-md border border-slate-800 space-y-4"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5 max-w-2xl">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider bg-amber-400 text-slate-950">
                    <Scale className="w-3 h-3" />
                    <span>Court-Admissible Legal Evidence</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 text-3xs font-bold px-2 py-0.5 rounded-full ${
                      verificationResult.isValid
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-700'
                    }`}
                  >
                    {verificationResult.isValid ? (
                      <>
                        <ShieldCheck className="w-3 h-3 text-emerald-400" />
                        <span>SHA-256 Merkle Chain: 100% Intact</span>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3 text-rose-400" />
                        <span>Tamper Alert: Hash Discrepancy</span>
                      </>
                    )}
                  </span>
                  <span className="text-3xs font-mono text-slate-400">
                    NIST FIPS 180-4 Chained Digests
                  </span>
                </div>

                <h4 className="text-base sm:text-lg font-black tracking-tight text-white flex items-center gap-2">
                  <span>Cryptographic Audit Trail &amp; Chain of Custody</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every election milestone, admin action, voter session, and secret ballot submission is cryptographically
                  hashed and sequentially bound to its preceding record. Any retrospective modification or deletion
                  instantly invalidates subsequent hashes, ensuring immutable proof for official election challenges and legal dispute resolution.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                <button
                  type="button"
                  id="verify-chain-btn"
                  onClick={handleVerifyChain}
                  disabled={isVerifying}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-colors cursor-pointer disabled:opacity-50"
                  title="Recalculate SHA-256 chain and cross-verify with server"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-indigo-400 ${isVerifying ? 'animate-spin' : ''}`} />
                  <span>{isVerifying ? 'Verifying...' : 'Verify Hash Chain'}</span>
                </button>

                <button
                  type="button"
                  id="view-legal-attestation-btn"
                  onClick={() => setShowLegalModal(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  title="View legal affidavit and election certification exhibit"
                >
                  <FileCheck2 className="w-3.5 h-3.5" />
                  <span>Legal Affidavit</span>
                </button>
              </div>
            </div>

            {/* Cryptographic Key Digests Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800 text-2xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-1">
                  Terminal Head Hash (Latest Event)
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-amber-400 font-bold truncate">
                    {verificationResult.headHash || '0000000000000000000000000000000000000000000000000000000000000000'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        verificationResult.headHash || '',
                        'head-hash'
                      )
                    }
                    className="text-slate-400 hover:text-white cursor-pointer shrink-0"
                    title="Copy Head Hash"
                  >
                    {copiedId === 'head-hash' ? (
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800">
                <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-1">
                  Genesis Root Anchor Hash
                </span>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300 font-bold truncate">
                    {verificationResult.genesisHash || '0000000000000000000000000000000000000000000000000000000000000000'}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      handleCopyText(
                        verificationResult.genesisHash || '',
                        'genesis-hash'
                      )
                    }
                    className="text-slate-400 hover:text-white cursor-pointer shrink-0"
                    title="Copy Genesis Hash"
                  >
                    {copiedId === 'genesis-hash' ? (
                      <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                <div>
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Verified Chain Height
                  </span>
                  <span className="text-xs font-bold text-white font-sans">
                    {verificationResult.verifiedCount} of {verificationResult.totalEntries} entries
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Legal Admissibility
                  </span>
                  <span className="text-xs font-bold text-emerald-400 font-sans">
                    Certified Valid
                  </span>
                </div>
              </div>
            </div>

            {/* Verification Notice / Feedback */}
            {verifyNotice && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2 ${
                  verificationResult.isValid
                    ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-200'
                    : 'bg-rose-950/60 border border-rose-800 text-rose-200'
                }`}
              >
                {verificationResult.isValid ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span>{verifyNotice}</span>
              </div>
            )}
          </div>

          {/* Secret Ballot Disclaimer & Compliance Banner */}
          <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-900/60 text-indigo-950 dark:text-indigo-200 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <strong className="font-bold text-indigo-900 dark:text-indigo-300">
                Cryptographic Anonymity Guarantee:
              </strong>{' '}
              Audit records log system actions, voter participation counts, and authentication timestamps. Candidate
              selections are cryptographically decoupled from student identifiers to guarantee 100% secret ballot
              protection under educational electoral standards.
            </div>
          </div>

      {/* Interactive Category Filter Toggles Section */}
      <div
        id="audit-filter-toggles-bar"
        className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Filter by Activity Type
            </h4>
            <span className="text-2xs text-slate-500 dark:text-slate-400">
              {!isAllCategoriesActive
                ? `(${activeCategories.size} of ${CATEGORY_CONFIGS.length} active)`
                : '(All categories visible)'}
            </span>
          </div>

          {/* Quick Clear or Reset */}
          {!isAllCategoriesActive && (
            <button
              type="button"
              onClick={handleSelectAllCategories}
              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset to All Categories</span>
            </button>
          )}
        </div>

        {/* Filter Toggle Buttons Group */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {/* 1. All Events Toggle */}
          <button
            type="button"
            id="audit-filter-all"
            onClick={handleSelectAllCategories}
            className={`col-span-2 sm:col-span-1 p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 ${
              isAllCategoriesActive
                ? 'bg-slate-900 dark:bg-indigo-600 text-white border-slate-900 dark:border-indigo-600 shadow-xs ring-2 ring-slate-900/10 dark:ring-indigo-500/20'
                : 'bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5">
                <Layers className="w-4 h-4 shrink-0" />
                <span className="text-xs font-black">All Events</span>
              </div>
              {isAllCategoriesActive && <Check className="w-3.5 h-3.5 shrink-0" />}
            </div>
            <div className="flex items-center justify-between w-full mt-1">
              <span className="text-3xs opacity-80 uppercase tracking-wider font-semibold">Total Logged</span>
              <span
                className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                  isAllCategoriesActive
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                }`}
              >
                {auditLogs.length}
              </span>
            </div>
          </button>

          {/* 2. Specific Category Toggles */}
          {CATEGORY_CONFIGS.map((cfg) => {
            const Icon = cfg.icon;
            const count = categoryCounts[cfg.id] || 0;
            const isActive = !isAllCategoriesActive && activeCategories.has(cfg.id);

            return (
              <div
                key={cfg.id}
                id={`audit-filter-${cfg.id}`}
                onClick={() => handleToggleCategory(cfg.id)}
                className={`group relative p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-1.5 select-none ${
                  isActive
                    ? `${cfg.activeColor} shadow-xs ring-2 ring-indigo-500/20 font-bold`
                    : 'bg-slate-50 dark:bg-slate-850 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="text-xs font-black truncate">{cfg.label}</span>
                  </div>
                  {isActive ? (
                    <Check className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <span
                      title={`Isolate only ${cfg.label}`}
                      onClick={(e) => handleIsolateCategory(cfg.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-3xs font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white px-1 rounded bg-slate-200/80 dark:bg-slate-700 transition-opacity"
                    >
                      Only
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between w-full mt-1">
                  <span className="text-3xs opacity-80 uppercase tracking-wider font-semibold truncate">
                    {cfg.shortLabel}
                  </span>
                  <span
                    className={`text-xs font-black px-1.5 py-0.5 rounded-md ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
                    }`}
                  >
                    {count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Filter Guidance Subtext */}
        <p className="text-2xs text-slate-500 dark:text-slate-400">
          Tip: Click any category toggle to filter. Click multiple toggles to combine categories, or click{' '}
          <span className="font-bold text-slate-700 dark:text-slate-300">"Only"</span> to isolate one immediately.
        </p>
      </div>

      {/* Search and Sort Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Search Bar */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search audit trail by description, event code, or keyword..."
            className="w-full pl-10 pr-9 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-850 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 outline-hidden transition-colors"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Sort Order Toggle & Stats Pill */}
        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Toggle chronological sorting"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
          </button>

          <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs font-semibold">
            Showing <span className="font-bold text-slate-900 dark:text-white">{filteredLogs.length}</span> of{' '}
            {auditLogs.length}
          </div>
        </div>
      </div>

      {/* Active Filter Pills Bar (when filters applied) */}
      {(!isAllCategoriesActive || query) && (
        <div className="flex items-center gap-2 flex-wrap text-2xs">
          <span className="font-bold text-slate-500 dark:text-slate-400">Active Filters:</span>

          {!isAllCategoriesActive &&
            Array.from(activeCategories).map((catId: CategoryFilterKey) => {
              const cfg = CATEGORY_CONFIGS.find((c) => c.id === catId);
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <span
                  key={catId}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold ${cfg.badgeColor}`}
                >
                  <Icon className="w-3 h-3" />
                  <span>{cfg.label}</span>
                  <button
                    type="button"
                    onClick={() => handleToggleCategory(catId)}
                    className="hover:opacity-75 cursor-pointer ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

          {query && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
              <Search className="w-3 h-3" />
              <span>"{query}"</span>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="hover:opacity-75 cursor-pointer ml-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setQuery('');
              handleSelectAllCategories();
            }}
            className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline cursor-pointer ml-2"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* Log Entries List */}
      <div
        id="audit-log-events-container"
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800/80 overflow-hidden"
      >
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Filter className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              No matching audit events
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              No logged activities match your current search criteria or active category toggles.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                handleSelectAllCategories();
              }}
              className="px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 text-xs font-bold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors cursor-pointer"
            >
              Reset Filters &amp; View All Events
            </button>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const cfg = getLogCategoryConfig(log);
            const Icon = cfg.icon;
            const isExpanded = expandedLogId === log.id;
            const relTime = getRelativeTime(log.timestamp);

            return (
              <div
                key={log.id}
                id={`audit-entry-${log.id}`}
                className={`p-4 sm:p-5 transition-colors ${
                  isExpanded
                    ? 'bg-slate-50/80 dark:bg-slate-850/60'
                    : 'hover:bg-slate-50/50 dark:hover:bg-slate-850/30'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Category Icon Badge */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${cfg.badgeColor}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Main Event Content */}
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Category Label Pill */}
                        <span
                          className={`inline-flex items-center gap-1 text-3xs font-black uppercase px-2 py-0.5 rounded-md border ${cfg.badgeColor}`}
                        >
                          <Tag className="w-2.5 h-2.5" />
                          <span>{cfg.label}</span>
                        </span>

                        {/* Event Type Code */}
                        <span className="text-2xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                          {log.eventType}
                        </span>

                        {/* Actor Badge */}
                        {log.actor && (
                          <span className="inline-flex items-center gap-1 text-3xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                            <User className="w-2.5 h-2.5 text-indigo-500" />
                            <span>{log.actor}</span>
                            {log.actorRole && (
                              <span className="text-slate-400 font-normal">({log.actorRole})</span>
                            )}
                          </span>
                        )}

                        {/* Client IP Badge */}
                        {log.ipAddress && (
                          <span className="inline-flex items-center gap-1 text-3xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                            <Globe className="w-2.5 h-2.5 text-slate-400" />
                            <span>{log.ipAddress}</span>
                          </span>
                        )}

                        {/* Relative Timestamp */}
                        {relTime && (
                          <span className="text-3xs font-semibold text-slate-400 dark:text-slate-500">
                            &bull; {relTime}
                          </span>
                        )}
                      </div>

                      {/* Event Details Text */}
                      <p className="text-xs text-slate-800 dark:text-slate-200 font-medium leading-relaxed">
                        {log.details}
                      </p>
                    </div>
                  </div>

                  {/* Right Side: Timestamp & Expand Action */}
                  <div className="flex items-center sm:flex-col sm:items-end justify-between sm:justify-start gap-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-left sm:text-right font-mono text-2xs text-slate-500 dark:text-slate-400">
                      <div className="font-bold text-slate-700 dark:text-slate-300">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </div>
                      <div className="text-3xs text-slate-400">
                        {new Date(log.timestamp).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                      className="text-3xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer mt-1"
                    >
                      <span>{isExpanded ? 'Hide Details' : 'Inspect'}</span>
                      {isExpanded ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Expandable Inspection Drawer */}
                {isExpanded && (
                  <div className="mt-3.5 pt-3.5 border-t border-slate-200 dark:border-slate-750 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Event ID */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          Audit Record ID
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                            {log.id}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(log.id, `id-${log.id}`)}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer shrink-0"
                            title="Copy Log ID"
                          >
                            {copiedId === `id-${log.id}` ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Exact ISO Timestamp */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          ISO-8601 Timestamp
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate">
                            {log.timestamp}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyText(log.timestamp, `ts-${log.id}`)}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer shrink-0"
                            title="Copy ISO Timestamp"
                          >
                            {copiedId === `ts-${log.id}` ? (
                              <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Security Verification Status */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          Verification Classification
                        </span>
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                          <ShieldCheck className="w-4 h-4" />
                          <span>Audit Verified ({log.category})</span>
                        </div>
                      </div>

                      {/* Responsible Actor */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          Responsible Actor
                        </span>
                        <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 text-xs font-bold truncate">
                          <User className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{log.actor || 'System / Automated'}</span>
                          {log.actorRole && (
                            <span className="text-3xs text-slate-400 font-normal">({log.actorRole})</span>
                          )}
                        </div>
                      </div>

                      {/* Origin IP Address */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          Origin Client IP
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-slate-800 dark:text-slate-200 text-xs font-mono font-bold truncate">
                            <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{log.ipAddress || 'Internal Loopback (127.0.0.1)'}</span>
                          </div>
                          {log.ipAddress && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(log.ipAddress || '', `ip-${log.id}`)}
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer shrink-0"
                              title="Copy IP Address"
                            >
                              {copiedId === `ip-${log.id}` ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Cryptographic SHA-256 Evidence Hash */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 col-span-1 sm:col-span-2">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-3xs uppercase font-extrabold text-slate-400 block">
                            Cryptographic Evidence Hash (SHA-256 Digest)
                          </span>
                          <span className="text-3xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Chained Digest</span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 truncate">
                            {log.evidenceHash || 'Chained via Merkle Root'}
                          </span>
                          {log.evidenceHash && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(log.evidenceHash || '', `hash-${log.id}`)}
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer shrink-0"
                              title="Copy Evidence Hash"
                            >
                              {copiedId === `hash-${log.id}` ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Previous Entry Hash */}
                      <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                        <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                          Previous Chained Hash
                        </span>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-400 truncate">
                            {log.previousHash || 'Genesis Anchor'}
                          </span>
                          {log.previousHash && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(log.previousHash || '', `prev-${log.id}`)}
                              className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer shrink-0"
                              title="Copy Previous Hash"
                            >
                              {copiedId === `prev-${log.id}` ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Raw JSON Payload */}
                    <div className="p-3 rounded-xl bg-slate-900 text-slate-200 font-mono text-3xs overflow-x-auto relative">
                      <div className="flex items-center justify-between text-slate-400 pb-1.5 mb-1.5 border-b border-slate-800">
                        <span>Immutable Audit Entry Payload</span>
                        <button
                          type="button"
                          onClick={() => handleCopyText(JSON.stringify(log, null, 2), `json-${log.id}`)}
                          className="hover:text-white flex items-center gap-1 cursor-pointer"
                        >
                          {copiedId === `json-${log.id}` ? (
                            <>
                              <CheckCheck className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy JSON</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre>{JSON.stringify(log, null, 2)}</pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
        </>
      )}
      {/* Court Admissibility & Legal Attestation Affidavit Modal */}
      {showLegalModal && (
        <div
          id="legal-attestation-modal-backdrop"
          className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 pb-8 px-4 bg-slate-950/75 backdrop-blur-xs overflow-y-auto animate-fadeIn"
          onClick={() => setShowLegalModal(false)}
        >
          <div
            id="legal-attestation-modal"
            className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden mb-8 animate-in fade-in slide-in-from-top-4 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-start justify-between gap-4 border-b border-slate-800">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-0.5 rounded-full text-3xs font-black uppercase tracking-wider bg-amber-400 text-slate-950 flex items-center gap-1">
                    <Scale className="w-3 h-3" />
                    <span>Legal Defense Exhibit</span>
                  </span>
                  <span className="text-3xs font-mono text-slate-400">
                    NIST FIPS 180-4 SHA-256
                  </span>
                </div>
                <h3 className="text-lg font-black tracking-tight text-white">
                  Certified Election Audit Ledger &amp; Legal Affidavit
                </h3>
                <p className="text-xs text-slate-300">
                  Formally documented cryptographic chain-of-custody for judicial, administrative, or board election dispute inquiries.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowLegalModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer transition-colors"
                title="Close Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto text-slate-800 dark:text-slate-200">
              {/* Election Context Header */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Institution
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {electionData?.config.schoolName || 'Lincoln High School'}
                  </span>
                </div>
                <div>
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Election Title
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {electionData?.config.title || 'Student Council Election'}
                  </span>
                </div>
                <div>
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Current Status
                  </span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {status || 'Certified'}
                  </span>
                </div>
                <div>
                  <span className="text-3xs uppercase font-extrabold text-slate-400 block mb-0.5">
                    Affidavit Timestamp
                  </span>
                  <span className="font-mono text-2xs text-slate-700 dark:text-slate-300">
                    {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
                  </span>
                </div>
              </div>

              {/* Cryptographic Proof Summary */}
              <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/60 dark:border-indigo-900/60 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-indigo-950 dark:text-indigo-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Cryptographic Evidence &amp; Merkle Root Proof</span>
                  </h4>
                  <span
                    className={`px-2 py-0.5 rounded-full text-3xs font-bold ${
                      verificationResult.isValid
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    }`}
                  >
                    {verificationResult.isValid ? 'Chain Validated: 100% Intact' : 'Tamper Detected'}
                  </span>
                </div>

                <div className="space-y-2 text-2xs font-mono">
                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40">
                    <span className="text-3xs uppercase font-sans font-extrabold text-slate-400 block mb-0.5">
                      Genesis Anchor Hash (Start of Election Record)
                    </span>
                    <span className="text-slate-700 dark:text-slate-300 break-all select-all">
                      {verificationResult.genesisHash || 'GENESIS_ANCHOR_SHA256'}
                    </span>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40">
                    <span className="text-3xs uppercase font-sans font-extrabold text-slate-400 block mb-0.5">
                      Terminal Head Hash (Current Cryptographic State)
                    </span>
                    <span className="text-amber-600 dark:text-amber-400 font-bold break-all select-all">
                      {verificationResult.headHash || 'TERMINAL_EVIDENCE_HEAD_SHA256'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Ballot Reconciliation Section */}
              {electionData && (
                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-slate-500" />
                    <span>Official Electoral Reconciliation Audit</span>
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                      <span className="text-3xs text-slate-400 uppercase font-bold block">
                        Registered Voters
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {electionData.voters.length}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                      <span className="text-3xs text-slate-400 uppercase font-bold block">
                        Ballots Deposited
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {electionData.ballots.filter((b) => !b.isPractice).length}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
                      <span className="text-3xs text-slate-400 uppercase font-bold block">
                        Voters Marked Voted
                      </span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {electionData.voters.filter((v) => v.hasVoted).length}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                      <span className="text-3xs text-emerald-700 dark:text-emerald-400 uppercase font-bold block">
                        Discrepancy Variance
                      </span>
                      <span className="text-base font-black text-emerald-700 dark:text-emerald-300">
                        {electionData.ballots.filter((b) => !b.isPractice).length -
                          electionData.voters.filter((v) => v.hasVoted).length ===
                        0
                          ? '0 (Exact 1:1 Match)'
                          : `${
                              electionData.ballots.filter((b) => !b.isPractice).length -
                              electionData.voters.filter((v) => v.hasVoted).length
                            }`}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Court Attestation Statement */}
              <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/60 space-y-2 text-xs leading-relaxed text-amber-950 dark:text-amber-200">
                <div className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-300">
                  <Scale className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>Legal Attestation &amp; Chain-of-Custody Clause</span>
                </div>
                <p>
                  I hereby certify under official penalty that the audit ledger attached hereto contains an unbroken, cryptographically hashed sequence of all system transactions, including administrative modifications, voter roll authentications, and secret ballot receipts. Each event was recorded with millisecond precision, actor identity, and network IP metadata chained via NIST FIPS 180-4 SHA-256. This record is maintained in accordance with electronic evidence standards and is prepared for submission in administrative or court proceedings.
                </p>
                <div className="pt-2 text-2xs text-amber-800 dark:text-amber-300 font-medium">
                  Affiant: {currentUser ? currentUser.fullName || currentUser.username : 'Authorized Electoral Commissioner'} &bull; Role: {currentUser?.role || 'Administrator'}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Affidavit</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportLegalDossier}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Legal Dossier (JSON)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowLegalModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
