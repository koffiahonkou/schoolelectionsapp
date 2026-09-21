import React, { useState } from 'react';
import { Candidate, Position, UserAccount } from '../../../types';
import {
  Plus,
  ArrowUp,
  ArrowDown,
  Trash2,
  Edit2,
  ListOrdered,
  AlertCircle,
  Users,
  Check,
  X,
  Lock,
} from 'lucide-react';
import { ConfirmModal } from '../../Common/ConfirmModal';

interface PositionsTabProps {
  positions: Position[];
  candidates: Candidate[];
  isLocked: boolean;
  currentUser?: UserAccount | null;
  onUpdatePositions: (positions: Position[]) => void;
  onDeletePosition: (positionId: string) => void;
  onUnlockRequest?: () => void;
}

export const PositionsTab: React.FC<PositionsTabProps> = ({
  positions,
  candidates,
  isLocked,
  currentUser,
  onUpdatePositions,
  onDeletePosition,
  onUnlockRequest,
}) => {
  const isDeveloper = currentUser?.role === 'Developer';
  const canEdit = isDeveloper && !isLocked;

  const [isAdding, setIsAdding] = useState(false);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const [deleteConfirmPos, setDeleteConfirmPos] = useState<Position | null>(null);

  const sortedPositions = [...positions].sort((a, b) => a.order - b.order);

  const handleStartAdd = () => {
    if (!canEdit) return;
    setTitle('');
    setDescription('');
    setEditingPosId(null);
    setIsAdding(true);
  };

  const handleStartEdit = (pos: Position) => {
    if (!canEdit) return;
    setTitle(pos.title);
    setDescription(pos.description);
    setEditingPosId(pos.id);
    setIsAdding(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !title.trim()) return;

    if (editingPosId) {
      // Edit
      const updated = positions.map((p) =>
        p.id === editingPosId ? { ...p, title: title.trim(), description: description.trim() } : p
      );
      onUpdatePositions(updated);
    } else {
      // Add
      const newPos: Position = {
        id: 'pos-' + Date.now(),
        title: title.trim(),
        description: description.trim(),
        maxSelections: 1,
        order: positions.length + 1,
      };
      onUpdatePositions([...positions, newPos]);
    }

    setIsAdding(false);
    setEditingPosId(null);
    setTitle('');
    setDescription('');
  };

  const movePosition = (index: number, direction: 'up' | 'down') => {
    if (!canEdit) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedPositions.length) return;

    const reordered = [...sortedPositions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);

    // Re-assign order numbers
    const updated = reordered.map((p, idx) => ({
      ...p,
      order: idx + 1,
    }));

    onUpdatePositions(updated);
  };

  return (
    <div className="space-y-6">
      {/* Header and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <ListOrdered className="w-5 h-5 text-indigo-600" />
            <span>Election Positions</span>
            <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full">
              {positions.length}
            </span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure positions on the ballot and reorder them as needed.
          </p>
        </div>

        {!isAdding && canEdit && (
          <button
            id="add-position-btn"
            type="button"
            onClick={handleStartAdd}
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-colors self-start sm:self-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Position</span>
          </button>
        )}

        {!isAdding && !isDeveloper && (
          <div
            id="developer-positions-restricted-badge"
            className="px-3.5 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-800 dark:text-amber-300 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
            title="Restricted strictly to Developer account"
          >
            <Lock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Developer Account Only (Read-Only)</span>
          </div>
        )}
      </div>

      {/* Developer Restriction Notice for Non-Developer Accounts */}
      {!isDeveloper && (
        <div
          id="developer-positions-policy-notice"
          className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 text-amber-900 dark:text-amber-200 flex items-start gap-3"
        >
          <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-bold">Positions Setup Restricted</p>
            <p className="mt-0.5 text-amber-800 dark:text-amber-300">
              Only the Developer account is authorized to add, edit, reorder, or delete ballot positions. Other accounts may review configured races in read-only mode.
            </p>
          </div>
        </div>
      )}

      {/* Locked Notice */}
      {isDeveloper && isLocked && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-bold">Ballot Configuration is Locked</p>
              <p className="mt-0.5 text-amber-800">
                Positions and candidates cannot be edited while voting is open or closed to protect ballot integrity.
              </p>
            </div>
          </div>
          {onUnlockRequest && (
            <button
              onClick={onUnlockRequest}
              className="text-xs font-bold text-amber-900 hover:text-amber-950 underline shrink-0 cursor-pointer"
            >
              Unlock Setup
            </button>
          )}
        </div>
      )}

      {/* Add / Edit Form Card */}
      {isAdding && (
        <form
          onSubmit={handleSave}
          className="p-5 sm:p-6 bg-slate-50 rounded-2xl border-2 border-indigo-200 space-y-4 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-slate-900 text-sm">
              {editingPosId ? 'Edit Position' : 'New Ballot Position'}
            </h4>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Position Title *
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. SRC President, Vice President, Class Prefect"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
              Description / Responsibilities (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief explanation shown to students on the ballot..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 outline-hidden"
            />
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
              <span>{editingPosId ? 'Save Changes' : 'Create Position'}</span>
            </button>
          </div>
        </form>
      )}

      {/* Positions List */}
      <div className="space-y-3">
        {sortedPositions.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
            <p className="text-sm font-bold text-slate-600">No positions created yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &ldquo;Add Position&rdquo; to create your first ballot race.
            </p>
          </div>
        ) : (
          sortedPositions.map((pos, index) => {
            const candCount = candidates.filter((c) => c.positionId === pos.id).length;

            return (
              <div
                key={pos.id}
                id={`position-item-${pos.id}`}
                className="p-4 bg-white rounded-2xl border border-slate-200 hover:border-slate-300 shadow-xs flex items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Order number */}
                  <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 border border-slate-200">
                    {index + 1}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{pos.title}</h4>
                      <span className="inline-flex items-center gap-1 text-2xs font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">
                        <Users className="w-3 h-3 text-slate-400" />
                        {candCount} {candCount === 1 ? 'Candidate' : 'Candidates'}
                      </span>
                    </div>
                    {pos.description && (
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                        {pos.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Move Up */}
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => movePosition(index, 'up')}
                      title="Move Up"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </button>
                    {/* Move Down */}
                    <button
                      type="button"
                      disabled={index === sortedPositions.length - 1}
                      onClick={() => movePosition(index, 'down')}
                      title="Move Down"
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </button>
                    {/* Edit */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(pos)}
                      title="Edit Position"
                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors ml-1"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {/* Delete */}
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmPos(pos)}
                      title="Delete Position"
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
        isOpen={!!deleteConfirmPos}
        title="Delete Position?"
        message={
          deleteConfirmPos
            ? `Are you sure you want to delete "${deleteConfirmPos.title}"? Any candidates enrolled in this position will also be removed.`
            : ''
        }
        confirmLabel="Delete Position"
        confirmVariant="danger"
        onConfirm={() => {
          if (deleteConfirmPos) {
            onDeletePosition(deleteConfirmPos.id);
            setDeleteConfirmPos(null);
          }
        }}
        onCancel={() => setDeleteConfirmPos(null)}
      />
    </div>
  );
};
