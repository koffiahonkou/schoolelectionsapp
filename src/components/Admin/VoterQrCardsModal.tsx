import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { Voter } from '../../types';
import {
  Printer,
  X,
  QrCode,
  IdCard,
  Download,
  Search,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { sounds } from '../../utils/audio';

interface VoterQrCardsModalProps {
  isOpen: boolean;
  onClose: () => void;
  voters: Voter[];
  schoolName?: string;
  electionTitle?: string;
  requirePin?: boolean;
  singleVoter?: Voter | null;
}

export const VoterQrCardsModal: React.FC<VoterQrCardsModalProps> = ({
  isOpen,
  onClose,
  voters,
  schoolName = 'School Election',
  electionTitle = 'Student Council Election',
  requirePin = false,
  singleVoter = null,
}) => {
  const [qrCodeMap, setQrCodeMap] = useState<Record<string, string>>({});
  const [isLoadingQr, setIsLoadingQr] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [includePinInQr, setIncludePinInQr] = useState(true);

  const displayList = singleVoter
    ? [singleVoter]
    : voters.filter(
        (v) =>
          v.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.voterId.toLowerCase().includes(searchTerm.toLowerCase())
      );

  // Generate QR code data URLs for voters
  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoadingQr(true);

    const generateCodes = async () => {
      const map: Record<string, string> = {};
      const targetVoters = singleVoter ? [singleVoter] : voters;

      for (const voter of targetVoters) {
        try {
          // Payload: if PIN required and includePinInQr is enabled, embed JSON with id + pin
          const payload =
            requirePin && voter.pin && includePinInQr
              ? JSON.stringify({ voterId: voter.voterId, pin: voter.pin })
              : voter.voterId;

          const dataUrl = await QRCode.toDataURL(payload, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 160,
            color: {
              dark: '#0f172a',
              light: '#ffffff',
            },
          });
          map[voter.id] = dataUrl;
        } catch (err) {
          console.error('Error generating QR for voter:', voter.voterId, err);
        }
      }

      if (isMounted) {
        setQrCodeMap(map);
        setIsLoadingQr(false);
      }
    };

    generateCodes();

    return () => {
      isMounted = false;
    };
  }, [isOpen, voters, singleVoter, requirePin, includePinInQr]);

  if (!isOpen) return null;

  const handlePrint = () => {
    sounds.playSelect();
    window.print();
  };

  return (
    <div
      id="voter-qr-cards-modal"
      className="fixed inset-0 z-50 flex items-start justify-center pt-6 sm:pt-10 pb-8 px-3 sm:px-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto print:p-0 print:bg-white print:static"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-5xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none animate-in fade-in slide-in-from-top-4 duration-150">
        {/* Header - Hidden in Print */}
        <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-900/50 print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white tracking-tight">
                {singleVoter
                  ? `Student ID Card: ${singleVoter.fullName}`
                  : `Printable Student QR ID Cards (${displayList.length})`}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Official cards with scannable QR codes for fast login at the Voter Booth.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              id="print-qr-cards-confirm-btn"
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Cards</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Filter Controls Bar - Hidden in Print */}
        {!singleVoter && (
          <div className="p-3 sm:px-5 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 print:hidden">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter by student name or ID..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-hidden"
              />
            </div>

            {requirePin && (
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includePinInQr}
                  onChange={(e) => setIncludePinInQr(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Include PIN in QR code for instant 1-tap login</span>
              </label>
            )}
          </div>
        )}

        {/* Cards Grid Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-slate-950/40 print:bg-white print:p-0 print:overflow-visible">
          {isLoadingQr ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400">
              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
              <span className="text-xs font-bold text-slate-500">Generating scannable QR badges...</span>
            </div>
          ) : displayList.length === 0 ? (
            <div className="py-16 text-center text-slate-400 text-xs">
              No voter records match your search query.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print:grid-cols-2 print:gap-4 print:text-black">
              {displayList.map((voter) => {
                const qrUrl = qrCodeMap[voter.id];
                return (
                  <div
                    key={voter.id}
                    className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between relative overflow-hidden print:border-black print:shadow-none print:break-inside-avoid print:bg-white print:rounded-xl"
                  >
                    {/* Header Banner */}
                    <div className="border-b border-slate-100 dark:border-slate-800 pb-2 mb-3 flex items-start justify-between gap-2 print:border-black">
                      <div>
                        <span className="text-3xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block print:text-black">
                          {schoolName}
                        </span>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white truncate print:text-black">
                          {electionTitle}
                        </h4>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold text-3xs uppercase tracking-wider print:border print:border-black print:text-black">
                        Student Pass
                      </span>
                    </div>

                    {/* Body: Student Info & QR Code */}
                    <div className="flex items-center gap-3">
                      {/* Scannable QR Code */}
                      <div className="w-24 h-24 p-1 rounded-xl bg-white border border-slate-200 dark:border-slate-700 shrink-0 flex items-center justify-center print:border-black">
                        {qrUrl ? (
                          <img
                            src={qrUrl}
                            alt={`QR for ${voter.fullName}`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full bg-slate-100 flex items-center justify-center text-3xs text-slate-400">
                            Loading
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="mb-1">
                          <span className="text-3xs text-slate-600 dark:text-slate-400 font-bold uppercase block print:text-black">
                            Student Name
                          </span>
                          <strong className="text-sm font-black text-slate-900 dark:text-white truncate block print:text-black">
                            {voter.fullName}
                          </strong>
                        </div>

                        <div className="mb-1">
                          <span className="text-3xs text-slate-600 dark:text-slate-400 font-bold uppercase block print:text-black">
                            Student / Voter ID
                          </span>
                          <span className="text-xs font-mono font-black text-amber-600 dark:text-amber-400 print:text-black">
                            {voter.voterId}
                          </span>
                        </div>

                        {requirePin && voter.pin && (
                          <div>
                            <span className="text-3xs text-slate-600 dark:text-slate-400 font-bold uppercase block print:text-black">
                              Access PIN
                            </span>
                            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 print:text-black">
                              {voter.pin}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Instructions */}
                    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-3xs text-slate-600 dark:text-slate-400 flex items-center justify-between print:border-black print:text-black">
                      <span>Present at booth &bull; Scan QR for instant login</span>
                      <span className="font-mono text-2xs font-bold text-slate-500 print:text-black">1 Ballot Only</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer - Hidden in Print */}
        <div className="p-4 bg-slate-50 dark:bg-slate-850 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs print:hidden">
          <div className="flex items-center gap-2 text-2xs text-slate-500 dark:text-slate-400">
            <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
            <span>Cards format automatically for standard printer paper (6 cards per sheet).</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
