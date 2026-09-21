import React, { useState } from 'react';
import { Candidate, Position, UserAccount } from '../../../types';
import { getCandidateColor, getCandidateInitials } from '../../../utils/avatar';
import {
  Plus,
  Users,
  Edit2,
  Trash2,
  Upload,
  X,
  Check,
  Filter,
  Image as ImageIcon,
  Lock,
} from 'lucide-react';
import { ConfirmModal } from '../../Common/ConfirmModal';

interface CandidatesTabProps {
  candidates: Candidate[];
  positions: Position[];
  isLocked: boolean;
  currentUser?: UserAccount | null;
  onAddCandidate: (candidate: Candidate) => void;
  onUpdateCandidate: (candidate: Candidate) => void;
  onDeleteCandidate: (candidateId: string) => void;
  onUnlockRequest?: () => void;
}

export const CandidatesTab: React.FC<CandidatesTabProps> = ({
  candidates,
  positions,
  isLocked,
  currentUser,
  onAddCandidate,
  onUpdateCandidate,
  onDeleteCandidate,
  onUnlockRequest,
}) => {
  const isDeveloper = currentUser?.role === 'Developer';
  const canEdit = isDeveloper && !isLocked;

  const [selectedPosFilter, setSelectedPosFilter] = useState<string>('ALL');
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form states
  const [positionId, setPositionId] = useState(positions[0]?.id || '');
  const [name, setName] = useState('');
  const [slogan, setSlogan] = useState('');
  const [manifesto, setManifesto] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  const [deleteConfirmCand, setDeleteConfirmCand] = useState<Candidate | null>(null);

  const filteredCandidates =
    selectedPosFilter === 'ALL'
      ? candidates
      : candidates.filter((c) => c.positionId === selectedPosFilter);

  const handleStartAdd = () => {
    if (!canEdit) return;
    setName('');
    setSlogan('');
    setManifesto('');
    setPhotoUrl('');
    setPositionId(positions[0]?.id || '');
    setEditingId(null);
    setIsAdding(true);
  };

  const handleStartEdit = (cand: Candidate) => {
    if (!canEdit) return;
    setName(cand.name);
    setSlogan(cand.slogan || '');
    setManifesto(cand.manifesto || '');
    setPhotoUrl(cand.photoUrl || '');
    setPositionId(cand.positionId);
    setEditingId(cand.id);
    setIsAdding(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return;
    const file = e.target.files?.[0];
    if (!file) return;

    // Read and compress image client side
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 320;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height *= MAX_SIZE / width;
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width *= MAX_SIZE / height;
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoUrl(dataUrl);
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !name.trim() || !positionId) return;

    if (editingId) {
      onUpdateCandidate({
        id: editingId,
        positionId,
        name: name.trim(),
        slogan: slogan.trim(),
        manifesto: manifesto.trim(),
        photoUrl,
      });
    } else {
      onAddCandidate({
        id: 'cand-' + Date.now(),
        positionId,
        name: name.trim(),
        slogan: slogan.trim(),
        manifesto: manifesto.trim(),
        photoUrl,
      });
    }

    setIsAdding(false);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-600" />
            <span>Candidate Registry</span>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
              {candidates.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Register students running for each position, slogans, and campaign manifestos.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Position filter dropdown */}
          <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={selectedPosFilter}
              onChange={(e) => setSelectedPosFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-700 outline-hidden cursor-pointer"
            >
              <option value="ALL">All Positions ({candidates.length})</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({candidates.filter((c) => c.positionId === p.id).length})
                </option>
              ))}
            </select>
          </div>

          {!isAdding && canEdit && positions.length > 0 && (
            <button
              id="add-candidate-btn"
              type="button"
              onClick={handleStartAdd}
              className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Candidate</span>
            </button>
          )}

          {!isAdding && !isDeveloper && (
            <div
              id="developer-candidates-restricted-badge"
              className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5"
              title="Restricted strictly to Developer account"
            >
              <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Developer Account Only (Read-Only)</span>
            </div>
          )}
        </div>
      </div>

      {/* Developer Restriction Notice for Non-Developer Accounts */}
      {!isDeveloper && (
        <div
          id="developer-candidates-policy-notice"
          className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 flex items-start gap-3"
        >
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Candidates Setup Restricted</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              Only the Developer account is authorized to add, edit profile details, upload candidate photos, or delete candidates. Other accounts may review registered aspirants in read-only mode.
            </p>
          </div>
        </div>
      )}

      {positions.length === 0 && (
        <div className="p-6 text-center bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 text-sm">
          Please add at least one position in the <strong>Positions</strong> tab before registering candidates.
        </div>
      )}

      {/* Add / Edit Candidate Form */}
      {isAdding && (
        <form
          onSubmit={handleSave}
          className="p-6 bg-slate-50 rounded-3xl border-2 border-indigo-200 space-y-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">
              {editingId ? 'Edit Candidate Profile' : 'Register New Candidate'}
            </h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Candidate Full Name *
              </label>
              <input
                type="text"
                required
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Maya Lin"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Running For Position *
              </label>
              <select
                required
                value={positionId}
                onChange={(e) => setPositionId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden cursor-pointer"
              >
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Campaign Slogan / Motto
            </label>
            <input
              type="text"
              value={slogan}
              onChange={(e) => setSlogan(e.target.value)}
              placeholder="e.g. Action, Accountability, and All Voices Heard"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Candidate Manifesto / Vision
            </label>
            <textarea
              rows={3}
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              placeholder="Full campaign promises and student goals (viewable in ballot info modal)..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
            />
          </div>

          {/* Photo Upload with client preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Candidate Photo (Optional)
            </label>
            <div className="flex items-center gap-4">
              {photoUrl ? (
                <div className="relative">
                  <img
                    src={photoUrl}
                    alt="Preview"
                    className="w-16 h-16 rounded-2xl object-cover border-2 border-indigo-200"
                  />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl('')}
                    className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full hover:bg-rose-600 shadow-sm"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-200 border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                  <ImageIcon className="w-6 h-6" />
                </div>
              )}

              <label className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer flex items-center gap-2 transition-colors">
                <Upload className="w-3.5 h-3.5 text-indigo-600" />
                <span>Choose Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              <span className="text-2xs text-slate-400">
                Square JPG/PNG supported. Leave blank to use colorful avatar.
              </span>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-xs flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              <span>{editingId ? 'Update Candidate' : 'Save Candidate'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Candidates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredCandidates.length === 0 ? (
          <div className="col-span-full p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
            <p className="text-sm font-bold text-slate-600">No candidates found</p>
            <p className="text-xs text-slate-400 mt-1">
              {selectedPosFilter === 'ALL'
                ? 'Click "Add Candidate" to register candidate profiles.'
                : 'No candidates enrolled in this position yet.'}
            </p>
          </div>
        ) : (
          filteredCandidates.map((cand) => {
            const pos = positions.find((p) => p.id === cand.positionId);
            const color = getCandidateColor(cand.name);

            return (
              <div
                key={cand.id}
                id={`candidate-admin-card-${cand.id}`}
                className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs flex items-start justify-between gap-4 transition-all"
              >
                <div className="flex items-start gap-3.5 min-w-0">
                  {cand.photoUrl ? (
                    <img
                      src={cand.photoUrl}
                      alt={cand.name}
                      className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm border shrink-0 ${color.bg}`}
                    >
                      {getCandidateInitials(cand.name)}
                    </div>
                  )}

                  <div className="min-w-0">
                    <span className="text-2xs font-extrabold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md inline-block mb-1">
                      {pos?.title || 'Unassigned'}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 truncate">{cand.name}</h4>
                    {cand.slogan && (
                      <p className="text-xs text-slate-500 italic mt-0.5 line-clamp-1">
                        &ldquo;{cand.slogan}&rdquo;
                      </p>
                    )}
                    {cand.manifesto && (
                      <p className="text-2xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                        {cand.manifesto}
                      </p>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(cand)}
                      title="Edit Candidate"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmCand(cand)}
                      title="Delete Candidate"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmCand}
        title="Delete Candidate?"
        message={
          deleteConfirmCand
            ? `Are you sure you want to remove ${deleteConfirmCand.name} from the ballot?`
            : ''
        }
        confirmLabel="Delete Candidate"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteConfirmCand) {
            onDeleteCandidate(deleteConfirmCand.id);
            setDeleteConfirmCand(null);
          }
        }}
        onCancel={() => setDeleteConfirmCand(null)}
      />
    </div>
  );
};
