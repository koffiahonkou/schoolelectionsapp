import React, { useState } from 'react';
import { UserAccount, Voter } from '../../../types';
import { normalizeVoterId } from '../../../utils/normalization';
import { downloadCSV } from '../../../utils/storage';
import {
  generate8DigitVoterCode,
  generateUniqueVoterCode,
} from '../../../utils/codeGenerator';
import {
  UserCheck,
  Plus,
  FileSpreadsheet,
  Download,
  Search,
  Trash2,
  Printer,
  X,
  Check,
  IdCard,
  Lock,
  Sparkles,
  KeyRound,
  RefreshCw,
  Copy,
  CheckCheck,
  QrCode,
  Database,
} from 'lucide-react';
import { ConfirmModal } from '../../Common/ConfirmModal';
import { VoterQrCardsModal } from '../VoterQrCardsModal';
import { syncVoterRosterToFirestoreTokens } from '../../../lib/firebaseVoting';

interface VoterRosterTabProps {
  voters: Voter[];
  requirePin: boolean;
  electionTitle?: string;
  schoolName?: string;
  currentUser?: UserAccount | null;
  onUpdateVoters: (voters: Voter[], logMessage: string) => void;
  onResetVoterStatus?: (voterId: string) => void;
}

export const VoterRosterTab: React.FC<VoterRosterTabProps> = ({
  voters,
  requirePin,
  electionTitle,
  schoolName,
  currentUser,
  onUpdateVoters,
}) => {
  const isDeveloper = currentUser?.role === 'Developer';
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'VOTED' | 'NOT_VOTED'>('ALL');

  // Manual Add Form
  const [isAdding, setIsAdding] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualId, setManualId] = useState('');
  const [manualPin, setManualPin] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);

  // Bulk Code Generation Modal
  const [isBulkGenerateModalOpen, setIsBulkGenerateModalOpen] = useState(false);
  const [bulkGenerateScope, setBulkGenerateScope] = useState<'ALL_VOTERS' | 'UNVOTED' | 'MISSING_PIN'>('ALL_VOTERS');

  // QR Cards Modal
  const [isQrCardsModalOpen, setIsQrCardsModalOpen] = useState(false);
  const [selectedQrVoter, setSelectedQrVoter] = useState<Voter | null>(null);

  // Delete Voter Modal
  const [deleteConfirmVoter, setDeleteConfirmVoter] = useState<Voter | null>(null);

  // Copy code feedback
  const [copiedPin, setCopiedPin] = useState<string | null>(null);

  // Import feedback notice
  const [importNotice, setImportNotice] = useState<string | null>(null);

  // Firestore Voter Tokens Sync
  const [isSyncingFirestore, setIsSyncingFirestore] = useState(false);

  const handleSyncFirestoreTokens = async () => {
    setIsSyncingFirestore(true);
    try {
      const res = await syncVoterRosterToFirestoreTokens(voters);
      if (res.success) {
        setImportNotice(`Successfully synchronized ${res.count} voter tokens to Firestore database.`);
      } else {
        setImportNotice('Voter token synchronization completed with warnings.');
      }
    } catch (err: any) {
      setImportNotice(`Sync notice: ${err?.message || 'Check Firestore configuration.'}`);
    } finally {
      setIsSyncingFirestore(false);
      setTimeout(() => setImportNotice(null), 5000);
    }
  };

  // Statistics
  const totalVoters = voters.length;
  const votedCount = voters.filter((v) => v.hasVoted).length;
  const remainingCount = totalVoters - votedCount;
  const turnoutPercent =
    totalVoters > 0 ? ((votedCount / totalVoters) * 100).toFixed(1) : '0.0';
  const votersWithPinCount = voters.filter((v) => v.pin && v.pin.trim().length >= 4).length;

  // Filtered list
  const filteredVoters = voters.filter((voter) => {
    const query = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      voter.fullName.toLowerCase().includes(query) ||
      voter.voterId.toLowerCase().includes(query) ||
      (voter.pin && voter.pin.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (statusFilter === 'VOTED') return voter.hasVoted;
    if (statusFilter === 'NOT_VOTED') return !voter.hasVoted;
    return true;
  });

  // Copy PIN / Access code to clipboard
  const handleCopyPin = (pin: string) => {
    try {
      navigator.clipboard.writeText(pin);
      setCopiedPin(pin);
      setTimeout(() => setCopiedPin(null), 2000);
    } catch {
      // fallback
    }
  };

  // Open Add Single Voter form with fresh 8-digit unique PIN (Developer only)
  const handleOpenAddForm = () => {
    if (!isDeveloper) return;
    const existingPins = new Set<string>(
      voters.filter((v) => v.pin).map((v) => v.pin!.trim().toUpperCase())
    );
    const freshPin = generateUniqueVoterCode(existingPins);
    // Suggest a next sequential student ID placeholder
    const nextNum = voters.length + 101;
    setManualId(`STU${nextNum}`);
    setManualName('');
    setManualPin(freshPin);
    setManualError(null);
    setIsAdding(true);
  };

  // Regenerate single 8-digit unique code in manual add form (Developer only)
  const handleGenerateFreshManualPin = () => {
    if (!isDeveloper) return;
    const existingPins = new Set<string>(
      voters.filter((v) => v.pin).map((v) => v.pin!.trim().toUpperCase())
    );
    const freshPin = generateUniqueVoterCode(existingPins);
    setManualPin(freshPin);
  };

  // Regenerate 8-digit Access PIN for a specific UNVOTED voter (Developer only)
  const handleRegeneratePinSingle = (voter: Voter) => {
    if (!isDeveloper || voter.hasVoted) return; // Developer-only and unvoted
    const existingPins = new Set<string>(
      voters
        .filter((v) => v.id !== voter.id && v.pin)
        .map((v) => v.pin!.trim().toUpperCase())
    );
    const newPin = generateUniqueVoterCode(existingPins);
    const updated = voters.map((v) => (v.id === voter.id ? { ...v, pin: newPin } : v));
    onUpdateVoters(
      updated,
      `Generated new 8-digit Access PIN (${newPin}) for ${voter.fullName} (${voter.voterId}).`
    );
    setImportNotice(`Generated new 8-digit Access PIN for ${voter.fullName}.`);
    setTimeout(() => setImportNotice(null), 4000);
  };

  // Bulk generate 8-digit unique Access PINs / Security Codes at once for all voters (Developer only)
  const handleConfirmBulkGenerateCodes = () => {
    if (!isDeveloper) return;
    const existingPins = new Set<string>();

    let modifiedCount = 0;
    const updatedVoters = voters.map((voter) => {
      // If scope is UNVOTED and voter has already voted, retain their existing PIN
      if (bulkGenerateScope === 'UNVOTED' && voter.hasVoted) {
        if (voter.pin) existingPins.add(voter.pin.trim().toUpperCase());
        return voter;
      }

      // If scope is MISSING_PIN and voter already has an 8-character PIN, retain it
      if (bulkGenerateScope === 'MISSING_PIN' && voter.pin && voter.pin.trim().length === 8) {
        existingPins.add(voter.pin.trim().toUpperCase());
        return voter;
      }

      const newPin = generateUniqueVoterCode(existingPins);
      existingPins.add(newPin);
      modifiedCount++;
      return {
        ...voter,
        pin: newPin,
      };
    });

    setIsBulkGenerateModalOpen(false);
    onUpdateVoters(
      updatedVoters,
      `Generated unique 8-digit Access PINs / Security Codes for ${modifiedCount} voters.`
    );
    setImportNotice(
      `Successfully generated unique 8-digit Access PINs for ${modifiedCount} student voters.`
    );
    setTimeout(() => setImportNotice(null), 5000);
  };

  // Handle CSV file upload (Developer only)
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isDeveloper) {
      setImportNotice('Importing voter records is restricted strictly to the Developer account.');
      setTimeout(() => setImportNotice(null), 5000);
      return;
    }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r\n|\n|\r/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length === 0) return;

      const newVoters: Voter[] = [];
      const existingIds = new Set<string>(voters.map((v) => normalizeVoterId(v.voterId)));
      const existingPins = new Set<string>(
        voters.filter((v) => v.pin).map((v) => v.pin!.trim().toUpperCase())
      );
      let duplicateCount = 0;
      let generatedPinsCount = 0;

      // Check header row
      const firstLineLower = lines[0].toLowerCase();
      const hasHeader =
        firstLineLower.includes('name') ||
        firstLineLower.includes('id') ||
        firstLineLower.includes('pin') ||
        firstLineLower.includes('code');
      const startIdx = hasHeader ? 1 : 0;

      for (let i = startIdx; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.replace(/^["']|["']$/g, '').trim());
        if (parts.length >= 1 && parts[0].length > 0) {
          const name = parts[0];
          let rawId = parts[1] || '';
          let rawPin = parts[2] || '';

          // If Student ID is missing, assign sequential STU ID
          if (!rawId) {
            rawId = `STU${voters.length + newVoters.length + 101}`;
          }

          // If Access PIN is missing or blank, automatically generate an 8-digit unique code!
          if (!rawPin) {
            rawPin = generateUniqueVoterCode(existingPins);
            existingPins.add(rawPin);
            generatedPinsCount++;
          } else {
            existingPins.add(rawPin.toUpperCase());
          }

          const normalizedId = normalizeVoterId(rawId);
          if (normalizedId && !existingIds.has(normalizedId)) {
            existingIds.add(normalizedId);
            newVoters.push({
              id: 'voter-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
              fullName: name,
              voterId: normalizedId,
              pin: rawPin.toUpperCase(),
              hasVoted: false,
              votedAt: null,
            });
          } else {
            duplicateCount++;
          }
        }
      }

      if (newVoters.length > 0) {
        onUpdateVoters(
          [...voters, ...newVoters],
          `Imported ${newVoters.length} voters from CSV (${generatedPinsCount} generated 8-digit PINs, ${duplicateCount} duplicate IDs skipped).`
        );
        setImportNotice(
          `Imported ${newVoters.length} voters (${generatedPinsCount} assigned fresh 8-digit Access PINs).`
        );
        setTimeout(() => setImportNotice(null), 5000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Download Sample CSV template showcasing Student IDs and 8-digit unique Access PINs
  const handleDownloadSampleCSV = () => {
    const sample = `Full Name,Student / Voter ID,Access PIN / Security Code\nAlex Johnson,STU101,7K9X2M4P\nBrooke Davis,STU102,3H8N5W2R\nCameron Lee,STU103,9B4T7Q1Y\nDana Scully,STU104,6V2P8M3K\nEvan Wright,STU105,4N9D2X7L\nFiona Gallagher,STU106,`;
    downloadCSV('sample_voter_roster_template.csv', sample);
  };

  // Export Current Roster to CSV with complete Student IDs, 8-digit Access PINs, and Voted status
  const handleExportRosterCSV = () => {
    let csv = `Full Name,Student / Voter ID,Access PIN / Security Code,Status,Voted At\n`;
    voters.forEach((v) => {
      csv += `"${v.fullName.replace(/"/g, '""')}","${v.voterId}","${v.pin || ''}","${
        v.hasVoted ? 'Voted' : 'Not Voted'
      }","${v.votedAt || ''}"\n`;
    });
    downloadCSV(`voter_roster_${new Date().toISOString().split('T')[0]}.csv`, csv);
  };

  // Manual Add Form Submit (Developer only)
  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setManualError(null);

    if (!isDeveloper) {
      setManualError('Adding voter records is restricted strictly to the Developer account.');
      return;
    }

    const normId = normalizeVoterId(manualId);
    if (!normId) {
      setManualError('Please provide a valid Student / Voter ID.');
      return;
    }

    if (voters.some((v) => normalizeVoterId(v.voterId) === normId)) {
      setManualError(`A student with Voter ID "${normId}" already exists in the roster.`);
      return;
    }

    const assignedPin = manualPin.trim().toUpperCase() || generate8DigitVoterCode();

    const newVoter: Voter = {
      id: 'voter-' + Date.now(),
      fullName: manualName.trim(),
      voterId: normId,
      pin: assignedPin,
      hasVoted: false,
      votedAt: null,
    };

    onUpdateVoters(
      [...voters, newVoter],
      `Added voter ${newVoter.fullName} (${newVoter.voterId}) with 8-digit Access PIN to roster.`
    );
    setManualName('');
    setManualId('');
    setManualPin('');
    setIsAdding(false);
  };

  const handleDeleteSingle = (voterId: string) => {
    const target = voters.find((v) => v.id === voterId);
    if (target?.hasVoted) return; // Strict lock: voters with VOTED status cannot be deleted
    const updated = voters.filter((v) => v.id !== voterId);
    onUpdateVoters(updated, `Removed voter ${target?.fullName || ''} from roster.`);
    setDeleteConfirmVoter(null);
  };

  return (
    <div className="space-y-6">
      {/* Printable-Only Official Polling Station Check-in Header */}
      <div className="hidden print:block mb-6 text-black font-sans">
        <div className="border-b-2 border-black pb-3 mb-3">
          <p className="text-xs uppercase font-extrabold tracking-widest text-slate-700">
            {schoolName || 'Electoral Commission of Student Affairs'}
          </p>
          <h1 className="text-2xl font-black uppercase tracking-tight text-black mt-0.5">
            {electionTitle || 'Official Election'} &mdash; Voter Register &amp; Check-In Sheet
          </h1>
          <p className="text-xs font-semibold text-slate-800 mt-1">
            Official register of eligible student voters. Verify Student / Voter ID and 8-digit unique Access PIN / Security Code.
          </p>
        </div>
        <div className="flex justify-between items-center text-xs font-bold text-black mb-3">
          <div>
            Total Registered: <strong>{totalVoters}</strong> &bull; Ballots Cast:{' '}
            <strong>{votedCount}</strong> &bull; Remaining: <strong>{remainingCount}</strong>
          </div>
          <div>
            Printed: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* Top Stats Cards (hidden during print) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 print:hidden">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Total Registered
          </span>
          <span className="text-2xl font-black text-slate-900 dark:text-white mt-1 block">{totalVoters}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <span className="text-2xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
            Ballots Cast
          </span>
          <span className="text-2xl font-black text-emerald-900 dark:text-emerald-300 mt-1 block">{votedCount}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <span className="text-2xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
            Pending Voters
          </span>
          <span className="text-2xl font-black text-amber-900 dark:text-amber-300 mt-1 block">{remainingCount}</span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors">
          <span className="text-2xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block">
            With 8-Digit PINs
          </span>
          <span className="text-2xl font-black text-indigo-900 dark:text-indigo-300 mt-1 block">
            {votersWithPinCount}
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 ml-1">
              / {totalVoters}
            </span>
          </span>
        </div>
      </div>

      {/* Import / Feedback Banner (hidden during print) */}
      {importNotice && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl text-emerald-900 dark:text-emerald-200 text-xs sm:text-sm font-semibold flex items-center justify-between gap-3 animate-in fade-in print:hidden">
          <div className="flex items-center gap-2">
            <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{importNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setImportNotice(null)}
            className="text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Action Bar (hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <span>Voter Register &amp; Credentials</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Student / Voter IDs with assigned 8-digit unique Access PINs / Security Codes. Voted records are permanently locked.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Developer Restriction Notice for non-developer staff */}
          {!isDeveloper && (
            <span
              id="developer-roster-restricted-badge"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
              title="Adding and importing voters and generating 8-digit PINs is restricted strictly to Developer accounts"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Roster Additions &amp; PIN Generation: Developer Only</span>
            </span>
          )}

          {/* Generate 8-Digit Unique PINs for All Voters Button (Developer Only) */}
          {isDeveloper && (
            <button
              id="generate-all-pins-btn"
              type="button"
              onClick={() => setIsBulkGenerateModalOpen(true)}
              title="Generate 8-digit unique Access PIN / Security Code at once for all voters (Developer Only)"
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Generate 8-Digit PINs (All)</span>
            </button>
          )}

          {/* Sync Tokens to Firestore Button */}
          <button
            id="sync-firestore-tokens-btn"
            type="button"
            onClick={handleSyncFirestoreTokens}
            disabled={isSyncingFirestore}
            title="Push and synchronize all voter tokens to Firestore database"
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
          >
            <Database className={`w-3.5 h-3.5 ${isSyncingFirestore ? 'animate-spin' : ''}`} />
            <span>{isSyncingFirestore ? 'Syncing...' : 'Sync to Firestore'}</span>
          </button>

          {/* CSV Upload (Developer Only) */}
          {isDeveloper && (
            <label
              id="import-csv-label"
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer flex items-center gap-1.5 shadow-2xs transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Import CSV</span>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv,text/csv"
                onChange={handleCSVUpload}
                className="hidden"
              />
            </label>
          )}

          {/* Sample CSV Template */}
          <button
            id="download-sample-csv-btn"
            type="button"
            onClick={handleDownloadSampleCSV}
            title="Download CSV Template with Student ID and Access PIN columns"
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden md:inline">CSV Template</span>
          </button>

          {/* Export Roster CSV */}
          <button
            id="export-roster-csv-btn"
            type="button"
            onClick={handleExportRosterCSV}
            title="Export Roster with Student IDs, 8-Digit PINs, and Voted Status"
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span className="hidden md:inline">Export Register</span>
          </button>

          {/* Print Check-in Register */}
          <button
            id="print-roster-sheet-btn"
            type="button"
            onClick={() => window.print()}
            title="Print Official Polling Station Check-In Sheet"
            className="px-3 py-2 rounded-xl bg-white dark:bg-slate-850 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
            <span className="hidden sm:inline">Print Sheet</span>
          </button>

          {/* Print QR Badges / ID Cards */}
          <button
            id="print-qr-cards-btn"
            type="button"
            onClick={() => {
              setSelectedQrVoter(null);
              setIsQrCardsModalOpen(true);
            }}
            title="Generate and print Student ID passes with scannable QR codes"
            className="px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900 border border-indigo-200 dark:border-indigo-800 text-xs font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            <span>Print QR Cards</span>
          </button>

          {/* Manual Add Voter (Developer Only) */}
          {isDeveloper && !isAdding && (
            <button
              id="add-single-voter-btn"
              type="button"
              onClick={handleOpenAddForm}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-amber-500 dark:hover:bg-amber-600 text-white dark:text-slate-950 text-xs font-black flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Voter</span>
            </button>
          )}
        </div>
      </div>

      {/* Manual Add Voter Form (hidden during print, Developer only) */}
      {isDeveloper && isAdding && (
        <form
          onSubmit={handleManualAdd}
          className="p-5 bg-slate-50 dark:bg-slate-850 rounded-2xl border-2 border-indigo-200 dark:border-indigo-800 space-y-3 animate-in fade-in transition-colors print:hidden"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
              <IdCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Add Eligible Student to Register</span>
            </h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {manualError && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
              {manualError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Student Full Name *
              </label>
              <input
                id="manual-voter-name-input"
                type="text"
                required
                autoFocus
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="e.g. Jordan Taylor"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white outline-hidden focus:border-indigo-500 dark:focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Student / Voter ID *
              </label>
              <input
                id="manual-voter-id-input"
                type="text"
                required
                value={manualId}
                onChange={(e) => setManualId(e.target.value.toUpperCase())}
                placeholder="e.g. STU116 or Admission #"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white uppercase outline-hidden focus:border-indigo-500"
              />
              <p className="text-3xs text-slate-400 dark:text-slate-500 mt-0.5">
                School ID, index, or admission number.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-2xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Access PIN / Security Code *
                </label>
                <button
                  type="button"
                  onClick={handleGenerateFreshManualPin}
                  title="Generate a fresh unpredictable 8-digit unique code"
                  className="text-3xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Re-roll</span>
                </button>
              </div>
              <input
                id="manual-voter-pin-input"
                type="text"
                required
                value={manualPin}
                onChange={(e) => setManualPin(e.target.value.toUpperCase())}
                placeholder="e.g. 7K9X2M4P"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-black text-indigo-700 dark:text-indigo-300 uppercase outline-hidden focus:border-indigo-500"
              />
              <p className="text-3xs text-slate-400 dark:text-slate-500 mt-0.5">
                8-digit unpredictable unique security code.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="manual-save-voter-btn"
              type="submit"
              className="px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Student</span>
            </button>
          </div>
        </form>
      )}

      {/* Filter and Search Toolbar (hidden during print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs transition-colors print:hidden">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            id="roster-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student name, Student ID, or 8-digit PIN..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/20 outline-hidden"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setStatusFilter('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            All ({totalVoters})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('NOT_VOTED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'NOT_VOTED'
                ? 'bg-amber-500 text-slate-950 shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Pending ({remainingCount})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('VOTED')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              statusFilter === 'VOTED'
                ? 'bg-emerald-600 text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            Voted ({votedCount})
          </button>
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xs overflow-hidden transition-colors print:border-black print:shadow-none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider print:bg-gray-100 print:text-black print:border-black">
                <th className="py-3 px-4 print:border print:border-black w-12">#</th>
                <th className="py-3 px-4 print:border print:border-black">Student Name</th>
                <th className="py-3 px-4 print:border print:border-black">
                  <span>Student / Voter ID</span>
                </th>
                <th className="py-3 px-4 print:border print:border-black">
                  <span>Access PIN / Security Code</span>
                </th>
                <th className="py-3 px-4 print:border print:border-black">Status</th>
                <th className="py-3 px-4 print:border print:border-black">Voted At</th>
                {/* Print-only check-in signature box */}
                <th className="hidden print:table-cell py-3 px-4 border border-black w-40 text-center">
                  Check-in Signature
                </th>
                {/* Web-only Actions column */}
                <th className="py-3 px-4 text-right print:hidden">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 print:divide-black">
              {filteredVoters.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="py-10 text-center text-slate-400 dark:text-slate-500 font-medium"
                  >
                    No voter records match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredVoters.map((voter, index) => {
                  const isCopied = copiedPin === voter.pin;

                  return (
                    <tr
                      key={voter.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors print:hover:bg-transparent"
                    >
                      <td className="py-3 px-4 text-slate-400 dark:text-slate-500 font-mono print:border print:border-black print:text-black">
                        {index + 1}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-900 dark:text-white print:border print:border-black print:text-black">
                        {voter.fullName}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-800 dark:text-slate-200 print:border print:border-black print:text-black">
                        <span className="tracking-wide">{voter.voterId}</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-indigo-700 dark:text-indigo-400 bg-slate-50/40 dark:bg-slate-850/50 print:border print:border-black print:text-black print:bg-transparent">
                        <div className="inline-flex items-center gap-1.5">
                          <span className="tracking-wider">
                            {voter.pin || <span className="text-slate-300 dark:text-slate-600 font-normal">&mdash;</span>}
                          </span>
                          {/* Copy PIN button (hidden in print) */}
                          {voter.pin && (
                            <button
                              type="button"
                              onClick={() => handleCopyPin(voter.pin!)}
                              title="Copy 8-digit Access PIN to clipboard"
                              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-0.5 rounded-md print:hidden cursor-pointer"
                            >
                              {isCopied ? (
                                <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 print:border print:border-black">
                        {voter.hasVoted ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 print:border-black print:text-black print:bg-gray-200">
                            <Check className="w-3 h-3" />
                            Voted
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-2xs font-extrabold uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 print:border-black print:text-black print:bg-transparent">
                            Registered
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-medium print:border print:border-black print:text-black">
                        {voter.votedAt ? (
                          new Date(voter.votedAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">&mdash;</span>
                        )}
                      </td>

                      {/* Print-only check-in signature column for polling station clerk */}
                      <td className="hidden print:table-cell py-3 px-4 border border-black text-center">
                        {voter.hasVoted ? 'BALLOT CAST' : ''}
                      </td>

                      {/* Web-only Actions column: STRICTLY NO ACTIONS FOR VOTERS WITH 'VOTED' STATUS */}
                      <td className="py-3 px-4 text-right print:hidden">
                        {voter.hasVoted ? (
                          // Rule: Under the voter register, remove any action for voters with "VOTED" status.
                          <span
                            id={`voter-locked-badge-${voter.id}`}
                            title="Ballot cast. This voter record is permanently locked to preserve election integrity."
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-2xs font-bold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 select-none"
                          >
                            <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500 shrink-0" />
                            <span>Locked (Voted)</span>
                          </span>
                        ) : (
                          // Unvoted voters
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedQrVoter(voter);
                                setIsQrCardsModalOpen(true);
                              }}
                              title="View and Print QR ID Card for this student"
                              className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            {/* PIN generation is strictly restricted to Developer account */}
                            {isDeveloper && (
                              <button
                                type="button"
                                onClick={() => handleRegeneratePinSingle(voter)}
                                title="Generate new 8-digit Access PIN for this student (Developer Only)"
                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {isDeveloper && (
                              <button
                                id={`delete-voter-btn-${voter.id}`}
                                type="button"
                                onClick={() => setDeleteConfirmVoter(voter)}
                                title="Remove unvoted student from roster (Developer Only)"
                                className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bulk Generate 8-Digit Unique PINs Confirmation Modal (Developer Only) */}
      {isDeveloper && isBulkGenerateModalOpen && (
        <div
          id="bulk-generate-codes-modal"
          className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-14 pb-8 px-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in slide-in-from-top-4 duration-150">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight">
                  Generate 8-Digit Access PINs (All Voters)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assign unpredictable, untraceable 8-digit unique security codes at once.
                </p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/90 dark:border-indigo-800 mb-5 space-y-2">
              <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200 font-bold text-xs">
                <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Access PIN / Security Code Overview</span>
              </div>
              <p className="text-xs text-indigo-950/90 dark:text-indigo-300/90 leading-relaxed">
                The 8-digit unique code acts as the student&apos;s <strong>Access PIN / Security Code</strong>.
                Each student logs into the voting booth using their <strong>Student / Voter ID</strong> and their assigned 8-digit unique PIN (e.g. <code>7K9X2M4P</code>).
              </p>
            </div>

            {/* Scope Selection */}
            <div className="space-y-3 mb-6">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Select PIN Generation Scope:
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600">
                <input
                  type="radio"
                  name="bulkScope"
                  checked={bulkGenerateScope === 'ALL_VOTERS'}
                  onChange={() => setBulkGenerateScope('ALL_VOTERS')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                    Generate for All {totalVoters} Voters in Register
                  </strong>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">
                    Generates fresh 8-digit unpredictable PINs for every registered student voter.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600">
                <input
                  type="radio"
                  name="bulkScope"
                  checked={bulkGenerateScope === 'UNVOTED'}
                  onChange={() => setBulkGenerateScope('UNVOTED')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                    Only for {remainingCount} Pending / Unvoted Voters
                  </strong>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">
                    Preserves PINs for students who have already cast their ballots.
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3.5 rounded-2xl border-2 cursor-pointer transition-all border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-600">
                <input
                  type="radio"
                  name="bulkScope"
                  checked={bulkGenerateScope === 'MISSING_PIN'}
                  onChange={() => setBulkGenerateScope('MISSING_PIN')}
                  className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <strong className="text-xs font-bold text-slate-900 dark:text-white block">
                    Only for Voters Missing an 8-Digit PIN
                  </strong>
                  <span className="text-2xs text-slate-500 dark:text-slate-400">
                    Leaves existing 8-digit unique PINs unchanged and only assigns codes to voters without one.
                  </span>
                </div>
              </label>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsBulkGenerateModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                id="confirm-generate-all-pins-btn"
                type="button"
                onClick={handleConfirmBulkGenerateCodes}
                className="px-5 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate Unique PINs</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Voter Confirmation (ONLY FOR UNVOTED VOTERS) */}
      <ConfirmModal
        isOpen={!!deleteConfirmVoter}
        title="Remove Student from Roster?"
        message={
          deleteConfirmVoter
            ? `Are you sure you want to delete ${deleteConfirmVoter.fullName} (${deleteConfirmVoter.voterId}) from the registered voters list?`
            : ''
        }
        confirmLabel="Delete from Roster"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteConfirmVoter) {
            handleDeleteSingle(deleteConfirmVoter.id);
          }
        }}
        onCancel={() => setDeleteConfirmVoter(null)}
      />

      {/* Printable Student QR Code Cards Modal */}
      <VoterQrCardsModal
        isOpen={isQrCardsModalOpen}
        onClose={() => {
          setIsQrCardsModalOpen(false);
          setSelectedQrVoter(null);
        }}
        voters={voters}
        schoolName={schoolName}
        electionTitle={electionTitle}
        requirePin={requirePin}
        singleVoter={selectedQrVoter}
      />
    </div>
  );
};
