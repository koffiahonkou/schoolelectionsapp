// Utility to get consistent avatar initials and color schemes for candidates

const COLOR_PALETTES = [
  { bg: 'bg-amber-100 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-sky-100 text-sky-800 border-sky-300', dot: 'bg-sky-500' },
  { bg: 'bg-indigo-100 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500' },
  { bg: 'bg-rose-100 text-rose-800 border-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-teal-100 text-teal-800 border-teal-300', dot: 'bg-teal-500' },
  { bg: 'bg-violet-100 text-violet-800 border-violet-300', dot: 'bg-violet-500' },
  { bg: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500' },
];

export function getCandidateInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getCandidateColor(name: string): { bg: string; dot: string } {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % COLOR_PALETTES.length;
  return COLOR_PALETTES[index];
}
