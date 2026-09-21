import React, { useState } from 'react';
import { GraduationCap, Landmark } from 'lucide-react';

interface SchoolLogoProps {
  logoUrl?: string | null;
  schoolName?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  shape?: 'rounded' | 'circle' | 'shield';
  showPlaceholderBadge?: boolean;
  className?: string;
  isPrint?: boolean;
}

/**
 * Extract clean, balanced initials for a school name
 * e.g., "Accra Academy Senior High School" -> "AAS"
 * "Lincoln High School" -> "LHS"
 */
function getSchoolInitials(name?: string): string {
  if (!name || !name.trim()) return 'SCH';
  const clean = name.trim().replace(/[^a-zA-Z0-9\s]/g, '');
  const words = clean.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    return words[0].slice(0, 3).toUpperCase();
  }

  // Pick significant words (skipping minor stop words if length > 3)
  const stopWords = new Set(['of', 'and', 'the', 'for', 'in', 'at']);
  const filtered = words.filter((w) => !stopWords.has(w.toLowerCase()));
  const targetWords = filtered.length > 0 ? filtered : words;

  if (targetWords.length >= 3) {
    return (targetWords[0][0] + targetWords[1][0] + targetWords[2][0]).toUpperCase();
  }
  return targetWords.map((w) => w[0]).join('').slice(0, 3).toUpperCase();
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  logoUrl,
  schoolName = 'Lincoln High School',
  size = 'md',
  shape = 'rounded',
  showPlaceholderBadge = false,
  className = '',
  isPrint = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const initials = getSchoolInitials(schoolName);

  // Optical size definitions ensuring adequate padding and no clipping
  const sizeMap = {
    xs: {
      container: 'w-7 h-7 min-w-7',
      padding: 'p-1',
      iconSize: 'w-3.5 h-3.5',
      initialsSize: 'text-[9px] font-bold tracking-tight',
      badgeText: 'text-[8px]',
    },
    sm: {
      container: 'w-9 h-9 min-w-9',
      padding: 'p-1.5',
      iconSize: 'w-4 h-4',
      initialsSize: 'text-[10px] font-extrabold tracking-tight',
      badgeText: 'text-[9px]',
    },
    md: {
      container: 'w-12 h-12 min-w-12',
      padding: 'p-2',
      iconSize: 'w-5 h-5',
      initialsSize: 'text-xs font-black tracking-wide',
      badgeText: 'text-2xs',
    },
    lg: {
      container: 'w-16 h-16 min-w-16',
      padding: 'p-2.5',
      iconSize: 'w-7 h-7',
      initialsSize: 'text-sm font-black tracking-widest',
      badgeText: 'text-xs',
    },
    xl: {
      container: 'w-24 h-24 min-w-24',
      padding: 'p-3',
      iconSize: 'w-9 h-9',
      initialsSize: 'text-base font-black tracking-widest',
      badgeText: 'text-xs',
    },
  }[size];

  const shapeClass = {
    circle: 'rounded-full',
    rounded: size === 'xl' ? 'rounded-3xl' : size === 'lg' ? 'rounded-2xl' : 'rounded-xl',
    shield: size === 'xl' ? 'rounded-3xl' : size === 'lg' ? 'rounded-2xl' : 'rounded-xl',
  }[shape];

  const hasValidImage = Boolean(logoUrl && logoUrl.trim() && !imageError);

  return (
    <div className={`relative inline-flex flex-col items-center justify-center shrink-0 ${className}`}>
      <div
        id="school-logo-container"
        className={`relative overflow-hidden flex items-center justify-center transition-all ${sizeMap.container} ${shapeClass} ${
          isPrint
            ? 'border-2 border-black bg-white text-black'
            : hasValidImage
            ? 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm'
            : 'border border-amber-300/80 dark:border-amber-600/70 bg-linear-to-b from-amber-50 via-white to-amber-100/40 dark:from-slate-800 dark:via-slate-900 dark:to-amber-950/30 text-amber-900 dark:text-amber-300 shadow-xs'
        }`}
        title={hasValidImage ? `${schoolName} Logo` : `${schoolName} Crest`}
        aria-label={hasValidImage ? `${schoolName} Logo` : `${schoolName} Crest`}
      >
        {hasValidImage ? (
          <div className={`w-full h-full flex items-center justify-center ${sizeMap.padding}`}>
            <img
              src={logoUrl!}
              alt={`${schoolName} Logo`}
              className="max-w-full max-h-full w-auto h-auto object-contain block drop-shadow-2xs"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          </div>
        ) : (
          /* Collegiate / Scholastic Vector Crest Placeholder */
          <div className={`w-full h-full flex flex-col items-center justify-center ${sizeMap.padding} select-none text-center`}>
            {size === 'xl' || size === 'lg' ? (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <div className="p-1 rounded-full bg-amber-100/80 dark:bg-amber-950/60 mb-0.5 text-amber-700 dark:text-amber-400">
                  <GraduationCap className={sizeMap.iconSize} />
                </div>
                <span className={`font-mono font-black ${sizeMap.initialsSize} text-slate-900 dark:text-white leading-tight uppercase`}>
                  {initials}
                </span>
                <span className="text-[8px] uppercase tracking-wider font-bold text-amber-800 dark:text-amber-400 opacity-80">
                  EST.
                </span>
              </div>
            ) : size === 'md' ? (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <GraduationCap className={`${sizeMap.iconSize} text-amber-600 dark:text-amber-400 mb-0.5`} />
                <span className={`font-mono font-black ${sizeMap.initialsSize} text-slate-900 dark:text-white leading-none uppercase`}>
                  {initials}
                </span>
              </div>
            ) : (
              /* Compact xs/sm */
              <span className={`font-mono font-black ${sizeMap.initialsSize} text-slate-900 dark:text-white leading-none uppercase`}>
                {initials}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Optional "Logo Placeholder" badge (only shown when explicitly requested, e.g., in Admin Settings preview) */}
      {showPlaceholderBadge && !hasValidImage && (
        <span
          id="school-logo-placeholder-tag"
          className={`mt-1 font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 ${sizeMap.badgeText} select-none whitespace-nowrap`}
        >
          Crest Placeholder
        </span>
      )}
    </div>
  );
};
