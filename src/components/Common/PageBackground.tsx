import React from 'react';
import boothImg from '../../assets/images/booth_hall_warm_1789507341352.jpg';
import adminImg from '../../assets/images/admin_chamber_bg_1789507354896.jpg';
import auditoriumImg from '../../assets/images/civic_auditorium_bg_1789507366375.jpg';

import { BackgroundThemeOption } from '../../types';

export type PageTheme = 'booth' | 'admin' | 'agents' | 'results';

interface PageBackgroundProps {
  children: React.ReactNode;
  theme?: PageTheme;
  subvariant?: 'login' | 'ballot' | 'confirmation';
  customImageUrl?: string;
  customTheme?: BackgroundThemeOption;
}

export const PageBackground: React.FC<PageBackgroundProps> = ({
  children,
  theme = 'booth',
  subvariant = 'login',
  customImageUrl,
  customTheme = 'default',
}) => {
  // Determine image and alt description based on theme and custom overrides
  const getThemeConfig = () => {
    // 1. If an explicit custom background image is provided
    if (customImageUrl && customImageUrl.trim()) {
      return {
        image: customImageUrl.trim(),
        alt: 'Custom Election Background Wallpaper',
        imgClass:
          'opacity-50 dark:opacity-35 object-cover object-center contrast-105',
        radialGlow:
          'from-amber-400/15 via-slate-900/5 to-transparent dark:from-amber-400/10 dark:via-transparent dark:to-slate-950/90',
        showImage: true,
      };
    }

    // 2. If a custom theme preset override is chosen
    if (customTheme === 'minimal') {
      return {
        image: '',
        alt: 'Minimalist Civic Slate',
        imgClass: 'hidden',
        radialGlow:
          'from-slate-200/40 via-transparent to-slate-100/50 dark:from-slate-900/40 dark:via-transparent dark:to-slate-950',
        showImage: false,
      };
    }

    if (customTheme === 'warm_pavilion') {
      return {
        image: boothImg,
        alt: 'Civic Voting Station Pavilion',
        imgClass:
          'opacity-50 dark:opacity-35 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
        radialGlow:
          'from-amber-400/15 via-indigo-900/5 to-transparent dark:from-amber-400/10 dark:via-transparent dark:to-slate-950/90',
        showImage: true,
      };
    }

    if (customTheme === 'chamber') {
      return {
        image: adminImg,
        alt: 'Electoral Commission Executive Chamber',
        imgClass:
          'opacity-45 dark:opacity-30 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
        radialGlow:
          'from-indigo-500/10 via-slate-900/5 to-transparent dark:from-indigo-600/15 dark:via-transparent dark:to-slate-950/90',
        showImage: true,
      };
    }

    if (customTheme === 'auditorium') {
      return {
        image: auditoriumImg,
        alt: 'Democratic Assembly Results Hall',
        imgClass:
          'opacity-50 dark:opacity-35 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
        radialGlow:
          'from-amber-400/20 via-yellow-500/5 to-transparent dark:from-amber-500/15 dark:via-transparent dark:to-slate-950/90',
        showImage: true,
      };
    }

    // 3. Default contextual theme
    switch (theme) {
      case 'admin':
        return {
          image: adminImg,
          alt: 'Electoral Commission Executive Chamber',
          imgClass:
            'opacity-45 dark:opacity-30 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
          radialGlow:
            'from-indigo-500/10 via-slate-900/5 to-transparent dark:from-indigo-600/15 dark:via-transparent dark:to-slate-950/90',
          showImage: true,
        };
      case 'agents':
        return {
          image: auditoriumImg,
          alt: 'Aspirant Agent Scrutineering Amphitheater',
          imgClass:
            'opacity-40 dark:opacity-30 mix-blend-multiply dark:mix-blend-luminosity contrast-105',
          radialGlow:
            'from-amber-500/15 via-indigo-950/5 to-transparent dark:from-amber-400/10 dark:via-transparent dark:to-slate-950/90',
          showImage: true,
        };
      case 'results':
        return {
          image: auditoriumImg,
          alt: 'Democratic Assembly Results Hall',
          imgClass:
            'opacity-50 dark:opacity-35 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
          radialGlow:
            'from-amber-400/20 via-yellow-500/5 to-transparent dark:from-amber-500/15 dark:via-transparent dark:to-slate-950/90',
          showImage: true,
        };
      case 'booth':
      default:
        return {
          image: boothImg,
          alt: 'Civic Voting Station Pavilion',
          imgClass:
            'opacity-50 dark:opacity-35 mix-blend-multiply dark:mix-blend-luminosity contrast-110',
          radialGlow:
            subvariant === 'confirmation'
              ? 'from-emerald-500/20 via-emerald-950/5 to-transparent dark:from-emerald-500/15 dark:via-transparent dark:to-slate-950/90'
              : 'from-amber-400/15 via-indigo-900/5 to-transparent dark:from-amber-400/10 dark:via-transparent dark:to-slate-950/90',
          showImage: true,
        };
    }
  };

  const config = getThemeConfig();

  return (
    <div className="relative min-h-[calc(100vh-5rem)] overflow-hidden bg-slate-50/95 dark:bg-slate-950 transition-colors duration-300">
      {/* 1. VISIBLE REAL PHOTOGRAPHIC ARCHITECTURAL BACKGROUND */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
        {config.showImage && (
          <img
            src={config.image}
            alt={config.alt}
            referrerPolicy="no-referrer"
            className={`w-full h-full object-cover object-center scale-100 transform-gpu transition-all duration-700 ease-out filter blur-[0.75px] ${config.imgClass}`}
          />
        )}

        {/* Dynamic Vignette & Lighting Contrast Overlays */}
        <div
          className={`absolute inset-0 bg-radial ${config.radialGlow} transition-colors duration-500`}
        />
        <div className="absolute inset-0 bg-linear-to-b from-slate-900/10 via-transparent to-slate-900/25 dark:from-slate-950/60 dark:via-slate-950/40 dark:to-slate-950/90" />
      </div>

      {/* 2. THEMATIC CIVIC & ARCHITECTURAL SVG WATERMARKS */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden select-none">
        {/* === A. BOOTH THEME WATERMARKS: Classical Pillars & Guilloche Rosette === */}
        {theme === 'booth' && (
          <>
            {/* Left Fluted Classical Pillar */}
            <div className="hidden md:block absolute -left-2 top-0 bottom-0 w-24 opacity-35 dark:opacity-25 text-amber-800 dark:text-amber-400">
              <svg
                viewBox="0 0 100 1000"
                preserveAspectRatio="none"
                className="w-full h-full fill-none stroke-current"
                strokeWidth="1.2"
              >
                {/* Capital Header */}
                <rect x="10" y="20" width="80" height="15" rx="3" strokeWidth="2" fill="currentColor" fillOpacity="0.05" />
                <path d="M 10 35 Q 50 45 90 35" strokeWidth="2" />
                {/* Fluted Column Shaft Lines */}
                <line x1="20" y1="40" x2="20" y2="950" strokeDasharray="6 3" />
                <line x1="35" y1="40" x2="35" y2="950" />
                <line x1="50" y1="40" x2="50" y2="950" strokeWidth="2" />
                <line x1="65" y1="40" x2="65" y2="950" />
                <line x1="80" y1="40" x2="80" y2="950" strokeDasharray="6 3" />
                {/* Column Base */}
                <rect x="10" y="950" width="80" height="25" rx="3" strokeWidth="2" fill="currentColor" fillOpacity="0.05" />
              </svg>
            </div>

            {/* Right Fluted Classical Pillar */}
            <div className="hidden md:block absolute -right-2 top-0 bottom-0 w-24 opacity-35 dark:opacity-25 text-amber-800 dark:text-amber-400">
              <svg
                viewBox="0 0 100 1000"
                preserveAspectRatio="none"
                className="w-full h-full fill-none stroke-current"
                strokeWidth="1.2"
              >
                <rect x="10" y="20" width="80" height="15" rx="3" strokeWidth="2" fill="currentColor" fillOpacity="0.05" />
                <path d="M 10 35 Q 50 45 90 35" strokeWidth="2" />
                <line x1="20" y1="40" x2="20" y2="950" strokeDasharray="6 3" />
                <line x1="35" y1="40" x2="35" y2="950" />
                <line x1="50" y1="40" x2="50" y2="950" strokeWidth="2" />
                <line x1="65" y1="40" x2="65" y2="950" />
                <line x1="80" y1="40" x2="80" y2="950" strokeDasharray="6 3" />
                <rect x="10" y="950" width="80" height="25" rx="3" strokeWidth="2" fill="currentColor" fillOpacity="0.05" />
              </svg>
            </div>

            {/* Large Center Guilloche Democratic Rosette */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] opacity-25 dark:opacity-20 text-indigo-700 dark:text-amber-400">
              <svg viewBox="0 0 400 400" className="w-full h-full stroke-current fill-none" strokeWidth="1">
                <circle cx="200" cy="200" r="185" strokeDasharray="4 4" strokeWidth="1.5" />
                <circle cx="200" cy="200" r="160" strokeWidth="1.2" />
                <circle cx="200" cy="200" r="135" strokeDasharray="2 6" />
                <circle cx="200" cy="200" r="105" strokeWidth="1" />
                {/* 12-Point Democratic Star Rosette */}
                {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                  <ellipse
                    key={deg}
                    cx="200"
                    cy="200"
                    rx="140"
                    ry="45"
                    transform={`rotate(${deg} 200 200)`}
                    strokeOpacity="0.5"
                    strokeWidth="0.8"
                  />
                ))}
              </svg>
            </div>
          </>
        )}

        {/* === B. ADMIN THEME WATERMARKS: Electoral Commission Seal & Cryptographic Node Grid === */}
        {theme === 'admin' && (
          <>
            {/* Top Center Commission Shield Watermark */}
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[540px] h-[400px] opacity-25 dark:opacity-15 text-indigo-700 dark:text-indigo-400">
              <svg viewBox="0 0 500 400" className="w-full h-full fill-none stroke-current" strokeWidth="1.2">
                {/* Classical Arch */}
                <path d="M 50 380 L 50 180 C 50 60, 450 60, 450 180 L 450 380" strokeWidth="2" />
                <path d="M 70 380 L 70 190 C 70 85, 430 85, 430 190 L 430 380" strokeDasharray="4 4" />
                {/* Commission Star Medallion */}
                <circle cx="250" cy="180" r="65" strokeWidth="2" />
                <circle cx="250" cy="180" r="50" strokeDasharray="3 3" />
                {/* Scales of Electoral Justice */}
                <line x1="250" y1="140" x2="250" y2="220" strokeWidth="2.5" />
                <line x1="210" y1="160" x2="290" y2="160" strokeWidth="2.5" />
                <path d="M 210 160 L 195 195 L 225 195 Z" fill="currentColor" fillOpacity="0.1" />
                <path d="M 290 160 L 275 195 L 305 195 Z" fill="currentColor" fillOpacity="0.1" />
              </svg>
            </div>

            {/* Cryptographic Ledger Grid Lattice */}
            <div className="absolute inset-0 opacity-15 dark:opacity-10 text-slate-700 dark:text-slate-300">
              <svg width="100%" height="100%">
                <defs>
                  <pattern id="admin-security-grid" width="80" height="80" patternUnits="userSpaceOnUse">
                    <rect width="80" height="80" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4 4" />
                    <circle cx="40" cy="40" r="2.5" fill="currentColor" opacity="0.6" />
                    <path d="M 0 40 L 80 40 M 40 0 L 40 80" stroke="currentColor" strokeWidth="0.4" strokeOpacity="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#admin-security-grid)" />
              </svg>
            </div>
          </>
        )}

        {/* === C. AGENTS THEME WATERMARKS: Scrutineering Radar Rings & Telemetry Nodes === */}
        {theme === 'agents' && (
          <>
            {/* Live Observation Sonar Rings */}
            <div className="absolute top-10 right-10 w-[600px] h-[600px] opacity-25 dark:opacity-20 text-amber-600 dark:text-amber-400">
              <svg viewBox="0 0 500 500" className="w-full h-full fill-none stroke-current">
                <circle cx="250" cy="250" r="230" strokeWidth="1" strokeDasharray="4 8" />
                <circle cx="250" cy="250" r="180" strokeWidth="1.2" />
                <circle cx="250" cy="250" r="130" strokeWidth="1" strokeDasharray="6 4" />
                <circle cx="250" cy="250" r="80" strokeWidth="1.5" />
                <circle cx="250" cy="250" r="30" strokeWidth="2" fill="currentColor" fillOpacity="0.05" />
                {/* 4 Cardinal Crosshairs */}
                <line x1="20" y1="250" x2="480" y2="250" strokeWidth="1" strokeDasharray="2 4" />
                <line x1="250" y1="20" x2="250" y2="480" strokeWidth="1" strokeDasharray="2 4" />
                {/* Radar Sweep Arc */}
                <path d="M 250 250 L 450 140 A 230 230 0 0 0 380 70 Z" fill="currentColor" fillOpacity="0.06" stroke="none" />
              </svg>
            </div>

            {/* Technical Accreditation Framing Corners */}
            <div className="absolute inset-4 sm:inset-8 border border-amber-600/20 dark:border-amber-400/20 rounded-3xl pointer-events-none">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-amber-500 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-amber-500 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-amber-500 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-amber-500 rounded-br-xl" />
            </div>
          </>
        )}

        {/* === D. RESULTS THEME WATERMARKS: Civic Victory Laurel Crest & Grand Medallion === */}
        {theme === 'results' && (
          <>
            {/* Grand Laurel Wreath & Victory Crest */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[640px] h-[640px] opacity-25 dark:opacity-20 text-amber-600 dark:text-amber-400">
              <svg viewBox="0 0 400 400" className="w-full h-full fill-none stroke-current" strokeWidth="1.2">
                {/* Outer Concentric Certified Seal */}
                <circle cx="200" cy="200" r="185" strokeWidth="2" />
                <circle cx="200" cy="200" r="172" strokeDasharray="4 4" />
                <circle cx="200" cy="200" r="145" strokeWidth="1" />
                {/* Laurel Leaves Arch Left */}
                <path
                  d="M 120 280 C 80 230, 80 150, 140 100 C 135 120, 145 130, 160 135 C 130 160, 130 200, 150 240 Z"
                  fill="currentColor"
                  fillOpacity="0.08"
                  strokeWidth="1.5"
                />
                {/* Laurel Leaves Arch Right */}
                <path
                  d="M 280 280 C 320 230, 320 150, 260 100 C 265 120, 255 130, 240 135 C 270 160, 270 200, 250 240 Z"
                  fill="currentColor"
                  fillOpacity="0.08"
                  strokeWidth="1.5"
                />
                {/* 5-Point Civic Star at Top */}
                <polygon
                  points="200,60 208,80 230,80 212,94 218,115 200,102 182,115 188,94 170,80 192,80"
                  fill="currentColor"
                  fillOpacity="0.2"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
          </>
        )}

        {/* Micro Security Dots & Guilloche Border Pattern (All Themes) */}
        <div className="absolute top-0 left-0 right-0 h-2 opacity-30 dark:opacity-20 text-amber-700 dark:text-amber-300">
          <svg width="100%" height="100%">
            <pattern id="civic-top-border" width="16" height="8" patternUnits="userSpaceOnUse">
              <polygon points="8,0 16,4 8,8 0,4" fill="currentColor" />
            </pattern>
            <rect width="100%" height="100%" fill="url(#civic-top-border)" />
          </svg>
        </div>
      </div>

      {/* 3. FOREGROUND INTERACTIVE CONTENT */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
