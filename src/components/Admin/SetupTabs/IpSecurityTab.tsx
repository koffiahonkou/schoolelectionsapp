import React, { useState, useEffect, useCallback } from 'react';
import { IpLogEntry, SecurityThreatSummary, UserAccount } from '../../../types';
import {
  ShieldAlert,
  ShieldCheck,
  Globe,
  RefreshCw,
  Ban,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  Copy,
  CheckCheck,
  Wifi,
  Activity,
  Zap,
  Lock,
  Eye,
  Filter,
} from 'lucide-react';
import { downloadJSON } from '../../../utils/storage';
import { sounds } from '../../../utils/audio';

interface IpSecurityTabProps {
  currentUser?: UserAccount | null;
  onAuditLog?: (entry: { eventType: string; details: string; category: string }) => void;
}

export const IpSecurityTab: React.FC<IpSecurityTabProps> = ({
  currentUser,
  onAuditLog,
}) => {
  const [logs, setLogs] = useState<IpLogEntry[]>([]);
  const [summary, setSummary] = useState<SecurityThreatSummary>({
    totalRequests: 0,
    uniqueIps: 0,
    suspiciousEvents: 0,
    rateLimitedEvents: 0,
    activeBlockedIps: [],
    recentThreats: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'suspicious' | 'blocked' | 'ratelimited'>('all');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchIpSecurityData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch('/api/security/ip-logs');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setLogs(json.logs || []);
          if (json.summary) {
            setSummary(json.summary);
          }
        }
      }
    } catch (err) {
      console.warn('[IpSecurityTab] Failed to fetch security logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIpSecurityData();
    const timer = setInterval(fetchIpSecurityData, 6000);
    return () => clearInterval(timer);
  }, [fetchIpSecurityData]);

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    sounds.playSelect();
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleToggleBlockIp = async (ip: string, currentlyBlocked: boolean) => {
    sounds.playSelect();
    try {
      const res = await fetch('/api/security/flag-ip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip,
          block: !currentlyBlocked,
          reason: currentlyBlocked
            ? 'Administrator manual unblock'
            : 'Blocked by commission officer for suspicious behavior or DoS burst',
          actor: currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Administrator',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setActionMessage(
            !currentlyBlocked
              ? `IP address ${ip} has been added to the firewall blocklist.`
              : `IP address ${ip} has been removed from the firewall blocklist.`
          );
          setTimeout(() => setActionMessage(null), 4000);
          fetchIpSecurityData();
        }
      }
    } catch (err) {
      console.error('Failed to update IP block status:', err);
    }
  };

  const filteredLogs = logs.filter((log) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      log.ip.toLowerCase().includes(q) ||
      log.action.toLowerCase().includes(q) ||
      log.endpoint.toLowerCase().includes(q) ||
      (log.threatReason && log.threatReason.toLowerCase().includes(q)) ||
      (log.actor && log.actor.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (filterMode === 'suspicious') return log.isSuspicious;
    if (filterMode === 'ratelimited') return log.status === 429;
    if (filterMode === 'blocked') return summary.activeBlockedIps.includes(log.ip);

    return true;
  });

  const handleExportIpLogs = () => {
    downloadJSON(
      `security-ip-audit-report-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          summary,
          logs: filteredLogs,
        },
        null,
        2
      )
    );
    sounds.playSuccess();
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>IP Traffic Logging &amp; DoS Rate-Limit Monitor</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Real-time ingress monitoring, IP origin tracking, bot mitigation, and active DoS firewall defense.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchIpSecurityData}
            disabled={isLoading}
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh Stream</span>
          </button>

          <button
            type="button"
            onClick={handleExportIpLogs}
            className="px-3 py-2 rounded-xl bg-slate-900 dark:bg-indigo-600 hover:bg-slate-800 dark:hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export IP Log</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
          <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Metrics Dashboard Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Total Ingress Requests */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-3xs uppercase font-extrabold tracking-wider">Total Requests</span>
            <Activity className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {summary.totalRequests}
          </div>
          <span className="text-3xs font-bold text-slate-400 mt-1 block">Live API invocations</span>
        </div>

        {/* Unique IP Addresses */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-3xs uppercase font-extrabold tracking-wider">Unique Client IPs</span>
            <Wifi className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {summary.uniqueIps}
          </div>
          <span className="text-3xs font-bold text-slate-400 mt-1 block">Distinct client devices</span>
        </div>

        {/* Suspicious Events */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-3xs uppercase font-extrabold tracking-wider">Suspicious Events</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className={`text-2xl font-black font-mono ${summary.suspiciousEvents > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-white'}`}>
            {summary.suspiciousEvents}
          </div>
          <span className="text-3xs font-bold text-slate-400 mt-1 block">Failed attempts / anomalies</span>
        </div>

        {/* Rate Limited (DoS Throttled) */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-3xs uppercase font-extrabold tracking-wider">DoS Blocks (429)</span>
            <Zap className="w-4 h-4 text-rose-500" />
          </div>
          <div className={`text-2xl font-black font-mono ${summary.rateLimitedEvents > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {summary.rateLimitedEvents}
          </div>
          <span className="text-3xs font-bold text-slate-400 mt-1 block">Rate-limited flood bursts</span>
        </div>

        {/* Active Blocked IPs */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-3xs uppercase font-extrabold tracking-wider">Firewall Blocklist</span>
            <Ban className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">
            {summary.activeBlockedIps.length}
          </div>
          <span className="text-3xs font-bold text-slate-400 mt-1 block">Banned IPs</span>
        </div>
      </div>

      {/* Recent Suspicious Activity Alert Banner if any */}
      {summary.recentThreats.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-850 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-bold text-xs">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Active Security Anomalies Detected ({summary.recentThreats.length})</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-2xs">
            {summary.recentThreats.slice(0, 4).map((threat) => (
              <div
                key={threat.id}
                className="p-2.5 rounded-xl bg-white/80 dark:bg-slate-900/80 border border-amber-200/80 dark:border-amber-900 flex items-center justify-between gap-2"
              >
                <div>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block">
                    {threat.ip} &bull; {threat.action}
                  </span>
                  <span className="text-amber-700 dark:text-amber-400 text-3xs">
                    {threat.threatReason || 'Unusual rate of failed attempts'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleToggleBlockIp(threat.ip, summary.activeBlockedIps.includes(threat.ip))
                  }
                  className="px-2 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 text-3xs font-bold cursor-pointer transition-colors shrink-0"
                >
                  {summary.activeBlockedIps.includes(threat.ip) ? 'Unblock' : 'Block IP'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter IP logs by IP address, action, or endpoint..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-50 dark:bg-slate-850 placeholder:text-slate-400 focus:border-indigo-500 outline-hidden transition-colors"
          />
        </div>

        {/* Filter buttons */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'all'
                ? 'bg-slate-900 dark:bg-indigo-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All Logs ({logs.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('suspicious')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'suspicious'
                ? 'bg-amber-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Suspicious ({summary.suspiciousEvents})
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('ratelimited')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'ratelimited'
                ? 'bg-rose-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            DoS Blocks (429)
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('blocked')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filterMode === 'blocked'
                ? 'bg-rose-700 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Banned IPs ({summary.activeBlockedIps.length})
          </button>
        </div>
      </div>

      {/* IP Access Stream Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-850/80 border-b border-slate-200 dark:border-slate-800 text-3xs font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 px-4">Origin IP</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">HTTP Method / Endpoint</th>
                <th className="py-3 px-4">Action</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Threat Assessment</th>
                <th className="py-3 px-4 text-right">Firewall Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 dark:text-slate-500">
                    No matching IP records found for this filter.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isBlocked = summary.activeBlockedIps.includes(log.ip);
                  return (
                    <tr
                      key={log.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-850/40 transition-colors ${
                        log.isSuspicious ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                      }`}
                    >
                      {/* IP with copy */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span>{log.ip}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(log.ip, log.id)}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer"
                            title="Copy IP"
                          >
                            {copiedKey === log.id ? (
                              <CheckCheck className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-2xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: 'numeric',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </td>

                      {/* Endpoint */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="font-mono text-2xs bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                          <strong>{log.method}</strong> {log.endpoint}
                        </span>
                      </td>

                      {/* Action & Actor */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {log.action}
                        </div>
                        {log.actor && (
                          <span className="text-3xs text-slate-400 dark:text-slate-500 block">
                            By: {log.actor}
                          </span>
                        )}
                      </td>

                      {/* Status Code */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-2xs px-2 py-0.5 rounded-full ${
                            log.status === 200
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : log.status === 429
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-black'
                              : log.status === 403
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {log.status} {log.status === 429 ? 'RATE LIMITED' : ''}
                        </span>
                      </td>

                      {/* Threat Assessment */}
                      <td className="py-3 px-4">
                        {log.isSuspicious ? (
                          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 font-bold text-2xs">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                            <span>{log.threatReason || 'Suspicious Traffic'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-2xs font-semibold">
                            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Legitimate Ingress</span>
                          </div>
                        )}
                      </td>

                      {/* Action Button */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleToggleBlockIp(log.ip, isBlocked)}
                          className={`px-2.5 py-1 rounded-lg text-2xs font-bold transition-colors cursor-pointer ${
                            isBlocked
                              ? 'bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-800 dark:text-slate-200'
                              : 'bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900'
                          }`}
                        >
                          {isBlocked ? 'Unblock' : 'Block IP'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
