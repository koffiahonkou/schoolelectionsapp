import React, { useState } from 'react';
import { ElectionConfig, ElectionData, BackgroundThemeOption, ElectionStatus, UserAccount } from '../../../types';
import {
  Settings,
  Shield,
  ShieldAlert,
  Clock,
  Eye,
  EyeOff,
  KeyRound,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Check,
  CheckCircle2,
  Save,
  RotateCcw,
  Lock,
  RefreshCw,
  Image as ImageIcon,
} from 'lucide-react';
import { ConfirmModal } from '../../Common/ConfirmModal';
import { SchoolLogo } from '../../Common/SchoolLogo';

interface ElectionSettingsTabProps {
  config: ElectionConfig;
  status?: ElectionStatus;
  currentUser?: UserAccount | null;
  onUpdateStatus?: (newStatus: ElectionStatus) => void;
  onSaveConfig: (updated: ElectionConfig) => void;
  onStartNewElection: (clearRoster: boolean, isFullSystemWipe?: boolean) => void | Promise<void>;
  onExportBackupJson: () => void;
  onImportBackupJson?: (data: ElectionData) => void;
  onLoadDefaultDemo: () => void;
}

export const ElectionSettingsTab: React.FC<ElectionSettingsTabProps> = ({
  config,
  status = 'Setup',
  currentUser,
  onUpdateStatus,
  onSaveConfig,
  onStartNewElection,
  onExportBackupJson,
  onImportBackupJson,
  onLoadDefaultDemo,
}) => {
  const [formData, setFormData] = useState<ElectionConfig>({ ...config });
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  // New election confirmation
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isDemoModalOpen, setIsDemoModalOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  // Complete Post-Election System Wipe state
  const [hasExportedBackup, setHasExportedBackup] = useState(false);
  const [isFullWipeModalOpen, setIsFullWipeModalOpen] = useState(false);
  const [wipeConfirmInput, setWipeConfirmInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeSuccess, setPurgeSuccess] = useState(false);

  const handleImportBackupFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!parsed || !parsed.config || !Array.isArray(parsed.positions)) {
          setImportError('Invalid backup file structure. Ensure it is a valid election JSON backup.');
          return;
        }
        if (onImportBackupJson) {
          onImportBackupJson(parsed);
        }
      } catch (err) {
        setImportError('Failed to parse backup JSON file: ' + String(err));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleLogoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, SVG, or WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({ ...prev, logoUrl: base64 }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleBackgroundFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, SVG, or WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData((prev) => ({
        ...prev,
        customBackgroundUrl: base64,
        backgroundTheme: 'default',
      }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveConfig(formData);
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 3000);
  };

  const isDeveloper = currentUser?.role === 'Developer';
  if (!isDeveloper) {
    return (
      <div id="settings-restricted-container" className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-xl mx-auto my-8">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/80 flex items-center justify-center mx-auto text-amber-600 dark:text-amber-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Developer Account Required</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Only the developer account is authorized to view and manage Settings &amp; Clock.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-600" />
          <span>Election Configuration & Security</span>
        </h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Manage general election parameters, privacy rules, and administrator credentials.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Details Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span>Basic Election Details</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Election Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. Student Council General Election"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                School or Organization Name *
              </label>
              <input
                type="text"
                required
                value={formData.schoolName}
                onChange={(e) => setFormData({ ...formData, schoolName: e.target.value })}
                placeholder="e.g. Lincoln High School"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Election Start Date
              </label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Election End Date (Target Cutoff)
              </label>
              <input
                type="date"
                value={formData.endDate || formData.date}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Scheduled Closing Time
              </label>
              <div className="relative">
                <input
                  type="time"
                  value={formData.closingTime || '18:00'}
                  onChange={(e) => setFormData({ ...formData, closingTime: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
                />
              </div>
              <p className="mt-1 text-2xs text-slate-400">
                Determines the precise countdown cutoff for polls.
              </p>
            </div>
          </div>
        </div>

        {/* School Branding & Logo Placeholder Configuration Card */}
        <div id="settings-school-logo-section" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <span>School Logo & Official Crest</span>
            </h4>
            <span
              id="school-logo-status-tag"
              className={`text-3xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                formData.logoUrl
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}
            >
              {formData.logoUrl ? 'Custom School Logo Active' : 'Default Placeholder Active'}
            </span>
          </div>

          <div className="flex flex-col md:flex-row items-start gap-6 p-4 rounded-2xl bg-slate-50 border border-slate-200">
            {/* Live Logo / Placeholder Preview Frame */}
            <div className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl border border-slate-200 shadow-xs shrink-0 self-center md:self-start text-center w-full sm:w-44">
              <SchoolLogo
                logoUrl={formData.logoUrl}
                schoolName={formData.schoolName}
                size="xl"
                shape="rounded"
                showPlaceholderBadge={false}
              />
              <p className="text-3xs font-semibold text-slate-500 mt-2">
                {formData.logoUrl ? 'Live Logo Preview' : 'Official Crest Placeholder'}
              </p>
            </div>

            {/* Logo Settings & Customization Controls */}
            <div className="space-y-3.5 flex-1 min-w-0 w-full">
              <div>
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Logo Image / Crest URL
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.logoUrl || ''}
                    onChange={(e) => setFormData({ ...formData, logoUrl: e.target.value })}
                    placeholder="https://example.edu/crest.png or data:image/..."
                    className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden bg-white"
                  />
                  {formData.logoUrl && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, logoUrl: '' })}
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition-colors cursor-pointer"
                      title="Reset to default placeholder"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <p className="text-2xs text-slate-500 mt-1">
                  When left blank, the application automatically displays an academic crest placeholder featuring your school initials ({formData.schoolName.slice(0, 3).toUpperCase()}).
                </p>
              </div>

              {/* Upload File Option */}
              <div>
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                  Upload School Emblem / Logo
                </span>
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl cursor-pointer transition-colors text-indigo-700 text-xs font-semibold">
                  <Upload className="w-4 h-4 text-indigo-600" />
                  <span>Choose file from device (PNG, SVG, JPG, WebP)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Reset to Placeholder Button */}
              <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
                <button
                  type="button"
                  id="reset-to-logo-placeholder-btn"
                  onClick={() => setFormData({ ...formData, logoUrl: '' })}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Reset to School Logo Placeholder</span>
                </button>
                <span className="text-2xs text-slate-400 italic">
                  Shown in kiosk header, student login, and certified reports
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Voting Booth & Portal Background Appearance Card */}
        <div id="background-settings-card" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <span>Voting Booth & Portal Background Appearance</span>
            </h4>
            <span
              id="background-status-tag"
              className={`text-3xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                formData.customBackgroundUrl
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
              }`}
            >
              {formData.customBackgroundUrl
                ? 'Custom Wallpaper Active'
                : formData.backgroundTheme === 'minimal'
                ? 'Minimalist Mode'
                : formData.backgroundTheme === 'chamber'
                ? 'Boardroom Chamber'
                : formData.backgroundTheme === 'auditorium'
                ? 'Grand Auditorium'
                : 'Architectural Pavilion (Default)'}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Configure the aesthetic backdrop for the student voting booth, admin portal, and live observer screens. You can select an architectural preset or upload a custom school campus or hall photo.
          </p>

          {/* Theme Presets Grid */}
          <div>
            <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-2">
              Background Theme Presets
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                {
                  id: 'warm_pavilion',
                  title: 'Warm Civic Pavilion',
                  desc: 'Modern timber slats, glass pavilion & golden sunlight (Default)',
                },
                {
                  id: 'chamber',
                  title: 'Executive Boardroom',
                  desc: 'Rich mahogany council paneling & classical columns',
                },
                {
                  id: 'auditorium',
                  title: 'Grand Auditorium',
                  desc: 'Civic amphitheater, tiered seating & ceremony spotlight',
                },
                {
                  id: 'minimal',
                  title: 'Minimalist Clean',
                  desc: 'Subtle democratic vector watermarks without photographic wallpaper',
                },
              ].map((themeItem) => {
                const isSelected =
                  !formData.customBackgroundUrl &&
                  (formData.backgroundTheme === themeItem.id ||
                    (!formData.backgroundTheme && themeItem.id === 'warm_pavilion'));
                return (
                  <button
                    key={themeItem.id}
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        customBackgroundUrl: '',
                        backgroundTheme: themeItem.id as BackgroundThemeOption,
                      });
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-500/20 text-indigo-950'
                        : 'border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100/70 text-slate-800'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold">{themeItem.title}</span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600" />
                        )}
                      </div>
                      <p className="text-3xs text-slate-500 line-clamp-2 leading-relaxed">
                        {themeItem.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Background Image URL or Device File Upload */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
            <div>
              <label className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                Or Use Custom Wallpaper Image URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={formData.customBackgroundUrl || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      customBackgroundUrl: e.target.value,
                      backgroundTheme: 'default',
                    })
                  }
                  placeholder="https://example.edu/campus-hall.jpg or data:image/..."
                  className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-sm font-medium text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden bg-white"
                />
                {formData.customBackgroundUrl && (
                  <button
                    type="button"
                    onClick={() =>
                      setFormData({
                        ...formData,
                        customBackgroundUrl: '',
                        backgroundTheme: 'warm_pavilion',
                      })
                    }
                    className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-rose-50 text-rose-600 text-xs font-bold transition-colors cursor-pointer"
                    title="Clear custom wallpaper"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-2xs text-slate-500 mt-1">
                Enter an image URL or upload an image file below to replace the default background across the voting booth and portals.
              </p>
            </div>

            {/* Upload File from Device */}
            <div>
              <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block mb-1">
                Upload Custom Wallpaper File
              </span>
              <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl cursor-pointer transition-colors text-indigo-700 text-xs font-semibold">
                <Upload className="w-4 h-4 text-indigo-600" />
                <span>Choose wallpaper from device (JPG, PNG, WebP)</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Reset to Default Button */}
            <div className="pt-1 flex items-center justify-between gap-2 flex-wrap">
              <button
                type="button"
                id="reset-to-default-background-btn"
                onClick={() =>
                  setFormData({
                    ...formData,
                    customBackgroundUrl: '',
                    backgroundTheme: 'warm_pavilion',
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 text-xs font-bold transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600" />
                <span>Reset to Default Architectural Pavilion</span>
              </button>
              <span className="text-2xs text-slate-400 italic">
                Saved with your election configuration
              </span>
            </div>
          </div>
        </div>

        {/* Election Clock & Countdown Preferences Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            <span>Election Clock & Countdown Display</span>
          </h4>

          <div className="space-y-3">
            {/* Show Clock to Voters Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="pr-4">
                <span className="text-sm font-bold text-slate-900 block">
                  Display Countdown Clock to Voters
                </span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  When enabled, voters will see the live countdown timer on the booth login screen as long as results aren't yet published.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.showClockToVoters}
                  onChange={(e) =>
                    setFormData({ ...formData, showClockToVoters: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Voting Rules & Security Controls */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Shield className="w-4 h-4 text-indigo-600" />
            <span>Voting Rules & Ballot Integrity</span>
          </h4>

          <div className="space-y-3">
            {/* Require PIN Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="pr-4">
                <span className="text-sm font-bold text-slate-900 block">
                  Enforce Student Access PIN / Security Code
                </span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  When enabled, voters must enter both their Student / Voter ID and their assigned 8-digit unique Access PIN to access the ballot.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.requirePin}
                  onChange={(e) => setFormData({ ...formData, requirePin: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Hide Tallies During Voting Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="pr-4">
                <span className="text-sm font-bold text-slate-900 block flex items-center gap-1.5">
                  <span>Hide Candidate Tallies Until Polls Close</span>
                  {formData.hideTalliesDuringVoting ? (
                    <EyeOff className="w-4 h-4 text-amber-600" />
                  ) : (
                    <Eye className="w-4 h-4 text-emerald-600" />
                  )}
                </span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  Turnout participation numbers remain visible in real time, but individual candidate vote counts are withheld until polls are closed.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.hideTalliesDuringVoting}
                  onChange={(e) =>
                    setFormData({ ...formData, hideTalliesDuringVoting: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>

            {/* Allow Practice Ballot Mode Toggle */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200">
              <div className="pr-4">
                <span className="text-sm font-bold text-slate-900 block">
                  Enable Practice Ballot / Demo Mode
                </span>
                <span className="text-xs text-slate-500 block mt-0.5">
                  Allows students and teachers to practice casting a demo ballot with prominent watermarks without counting toward real tallies.
                </span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formData.allowPracticeBallot}
                  onChange={(e) =>
                    setFormData({ ...formData, allowPracticeBallot: e.target.checked })
                  }
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </div>
        </div>

        {/* Electoral Commission Security PIN Card */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-2xs space-y-4">
          <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <span>Administrator Passcode</span>
          </h4>

          <div className="max-w-md">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Admin Access PIN
            </label>
            <input
              type="text"
              required
              value={formData.adminPin}
              onChange={(e) => setFormData({ ...formData, adminPin: e.target.value })}
              placeholder="e.g. admin123"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-900 focus:border-indigo-500 outline-hidden"
            />
            <p className="mt-1.5 text-2xs text-slate-400">
              Used by school teachers and election officers to access this commission portal from the voting booth.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSavedNotice && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                <Check className="w-4 h-4" />
                <span>Settings saved successfully!</span>
              </span>
            )}
          </div>
          <button
            type="submit"
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </form>

      {/* Danger Zone: Reset and New Election */}
      <div className="bg-rose-50/70 p-6 rounded-3xl border-2 border-rose-200/80 space-y-4">
        <div className="flex items-center gap-2.5 text-rose-900">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <h4 className="text-base font-black tracking-tight">
            Election Lifecycle & Data Reset
          </h4>
        </div>
        <p className="text-xs text-rose-800 leading-relaxed max-w-2xl">
          To prevent data leakage from previous school years or test sessions into a live count,
          you can start a completely new election. Be sure to export a backup copy first if you wish
          to preserve past results.
        </p>

        {importError && (
          <div className="p-3 bg-rose-100 border border-rose-300 rounded-xl text-xs font-bold text-rose-900">
            {importError}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Export Backup JSON */}
          <button
            type="button"
            onClick={() => {
              onExportBackupJson();
              setHasExportedBackup(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-white border border-rose-300 hover:bg-rose-100/50 text-rose-900 font-bold text-xs flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-rose-600" />
            <span>Export Backup JSON</span>
          </button>

          {/* Import Backup JSON */}
          {onImportBackupJson && (
            <label className="px-4 py-2.5 rounded-xl bg-white border border-rose-300 hover:bg-rose-100/50 text-rose-900 font-bold text-xs flex items-center gap-2 shadow-2xs transition-colors cursor-pointer">
              <Upload className="w-4 h-4 text-rose-600" />
              <span>Import Backup JSON</span>
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportBackupFile}
                className="hidden"
              />
            </label>
          )}

          {/* Load Sample Demo Election */}
          <button
            type="button"
            onClick={() => setIsDemoModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 font-bold text-xs flex items-center gap-2 shadow-2xs transition-colors cursor-pointer"
          >
            <RotateCcw className="w-4 h-4 text-indigo-600" />
            <span>Load Sample High School SRC Data</span>
          </button>

          {/* Start New Clean Election */}
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
            <span>Start Brand New Election (Reset)</span>
          </button>
        </div>
      </div>

      {/* Post-Election Full System Wipe & Fresh Selection Setup */}
      <div className="bg-slate-900 text-white p-6 sm:p-7 rounded-3xl border border-slate-800 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-base font-black tracking-tight text-white flex items-center gap-2">
                <span>Post-Election Full System Wipe</span>
                <span className="text-3xs font-extrabold uppercase px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Fresh Setup
                </span>
              </h4>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Completely purge all election data (ballots, cast votes, positions, candidates, and voter rosters) across both local storage and cloud database once voting is concluded and an archive backup is downloaded.
              </p>
            </div>
          </div>
        </div>

        {purgeSuccess && (
          <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl flex items-center gap-3 text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="text-xs">
              <p className="font-bold">System Purged Successfully!</p>
              <p className="text-emerald-300/80 mt-0.5">
                All previous election data has been cleared. The system is reset to Setup mode with blank positions and candidates ready for a fresh setup cycle.
              </p>
            </div>
          </div>
        )}

        {/* Prerequisites Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {/* Prerequisite 1: Voting is Closed */}
          {(() => {
            const isClosed = status === 'Closed' || status === 'Results Published';
            return (
              <div
                className={`p-4 rounded-2xl border transition-all ${
                  isClosed
                    ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                    : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                    Prerequisite 1
                  </span>
                  {isClosed ? (
                    <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Ready
                    </span>
                  ) : (
                    <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Required
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white">Voting Must Be Closed</p>
                <p className="text-2xs text-slate-400 mt-1 leading-relaxed">
                  Current Status: <strong className="text-white">{status}</strong>.
                  {!isClosed && ' Voting must be concluded prior to wiping data.'}
                </p>
                {!isClosed && onUpdateStatus && (
                  <button
                    type="button"
                    onClick={() => onUpdateStatus('Closed')}
                    className="mt-3 w-full py-1.5 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Clock className="w-3 h-3" />
                    <span>Close Voting Now</span>
                  </button>
                )}
              </div>
            );
          })()}

          {/* Prerequisite 2: Backup Exported */}
          <div
            className={`p-4 rounded-2xl border transition-all ${
              hasExportedBackup
                ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/20 border-amber-500/40 text-amber-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-3xs font-extrabold uppercase tracking-wider text-slate-400">
                Prerequisite 2
              </span>
              {hasExportedBackup ? (
                <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Exported
                </span>
              ) : (
                <span className="text-3xs font-black uppercase px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Required
                </span>
              )}
            </div>
            <p className="text-xs font-bold text-white">Archive Backup Downloaded</p>
            <p className="text-2xs text-slate-400 mt-1 leading-relaxed">
              {hasExportedBackup
                ? 'Election results and audit log successfully exported.'
                : 'Export an election archive file so past tally records are never lost.'}
            </p>
            <button
              type="button"
              onClick={() => {
                onExportBackupJson();
                setHasExportedBackup(true);
              }}
              className="mt-3 w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-2xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>{hasExportedBackup ? 'Re-export Backup JSON' : 'Export Backup JSON Now'}</span>
            </button>
          </div>
        </div>

        {/* Clear System Action Button */}
        {(() => {
          const isClosed = status === 'Closed' || status === 'Results Published';
          const canWipe = isClosed && hasExportedBackup;
          return (
            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-slate-800">
              <div className="text-xs text-slate-400">
                {!canWipe ? (
                  <span className="flex items-center gap-1.5 text-amber-400/90 font-medium">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    Locked: Please ensure voting is closed and a backup archive is exported first.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    Both safety prerequisites met. System is primed for clean wipe.
                  </span>
                )}
              </div>

              <button
                type="button"
                id="full-system-wipe-btn"
                disabled={!canWipe}
                onClick={() => {
                  setWipeConfirmInput('');
                  setIsFullWipeModalOpen(true);
                }}
                className={`px-5 py-2.5 rounded-2xl font-black text-xs flex items-center gap-2 transition-all cursor-pointer ${
                  canWipe
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30'
                    : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Completely Clear System of All Data</span>
              </button>
            </div>
          );
        })()}
      </div>

      {/* Full System Wipe Confirmation Modal */}
      {isFullWipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 bg-rose-600 text-white flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-6 h-6 text-white" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-black tracking-tight">
                  Completely Clear All System Data?
                </h3>
                <p className="text-xs text-rose-100">
                  This action is permanent and creates a completely blank canvas for a new election cycle.
                </p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 space-y-2">
                <p className="text-xs font-bold text-rose-900 dark:text-rose-200">
                  The following data will be completely deleted:
                </p>
                <ul className="text-2xs text-rose-800 dark:text-rose-300 space-y-1 list-disc list-inside">
                  <li>All ballots and votes cast (locally and in cloud database)</li>
                  <li>All ballot positions and registered candidates</li>
                  <li>All registered student voters and generated 8-digit PINs</li>
                  <li>All live polling statistics and temporary agent sessions</li>
                </ul>
                <p className="text-3xs text-rose-700 dark:text-rose-400 font-semibold pt-1">
                  * Note: Administrator and Developer accounts are preserved so you remain logged in.
                </p>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Type <span className="font-mono text-rose-600 dark:text-rose-400 font-black">CLEAR ALL</span> to confirm:
                </label>
                <input
                  type="text"
                  value={wipeConfirmInput}
                  onChange={(e) => setWipeConfirmInput(e.target.value)}
                  placeholder="CLEAR ALL"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs font-bold focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={isPurging}
                onClick={() => setIsFullWipeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={wipeConfirmInput.trim() !== 'CLEAR ALL' || isPurging}
                onClick={async () => {
                  setIsPurging(true);
                  try {
                    await onStartNewElection(true, true);
                    setPurgeSuccess(true);
                    setIsFullWipeModalOpen(false);
                  } catch (err) {
                    console.error('Error during full system wipe:', err);
                  } finally {
                    setIsPurging(false);
                  }
                }}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  wipeConfirmInput.trim() === 'CLEAR ALL' && !isPurging
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-900/20'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isPurging ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Purging All Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Confirm & Purge Everything</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Start New Election Confirmation Modal */}
      <ConfirmModal
        isOpen={isResetModalOpen}
        title="Start Brand New Election?"
        message="This will completely clear all current ballots, votes cast, and test data so that zero prior data leaks into your next election. You will start with a fresh ballot in Setup mode."
        confirmLabel="Reset & Start New Election"
        confirmVariant="danger"
        onConfirm={() => {
          onStartNewElection(false);
          setIsResetModalOpen(false);
        }}
        onCancel={() => setIsResetModalOpen(false)}
      />

      {/* Load Demo Data Confirmation Modal */}
      <ConfirmModal
        isOpen={isDemoModalOpen}
        title="Load Sample Demo Election?"
        message="This will load the Lincoln High School Student Council election demo with 5 positions, 10 candidates, and 15 sample student IDs."
        confirmLabel="Load Demo Data"
        confirmVariant="primary"
        onConfirm={() => {
          onLoadDefaultDemo();
          setIsDemoModalOpen(false);
        }}
        onCancel={() => setIsDemoModalOpen(false)}
      />
    </div>
  );
};
