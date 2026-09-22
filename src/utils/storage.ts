import {
  AuditLogEntry,
  ElectionConfig,
  ElectionData,
  ElectionStatus,
} from '../types';
import {
  DEFAULT_USER_ACCOUNTS,
  getDefaultElectionData,
  createEmptyElectionData,
} from './defaultData';

export { DEFAULT_USER_ACCOUNTS, getDefaultElectionData, createEmptyElectionData };

const DB_NAME = 'SchoolElectionsDB_v1';
const STORE_NAME = 'electionStore';
const STORAGE_KEY = 'school_election_current_data';
export const STATUS_STORAGE_KEY = 'school_election_status';

export function saveStoredElectionStatus(status: ElectionStatus): void {
  try {
    localStorage.setItem(STATUS_STORAGE_KEY, status);
  } catch (err) {
    console.warn('Failed to save election status to localStorage:', err);
  }
}

export function loadStoredElectionStatus(): ElectionStatus | null {
  try {
    const saved = localStorage.getItem(STATUS_STORAGE_KEY);
    if (saved === 'Setup' || saved === 'Open' || saved === 'Closed' || saved === 'Results Published') {
      return saved;
    }
  } catch {
    // ignore
  }
  return null;
}

export function normalizeElectionData(raw: ElectionData): ElectionData {
  const defaultData = getDefaultElectionData();
  const config: ElectionConfig = {
    ...defaultData.config,
    ...raw.config,
    logoUrl: raw.config.logoUrl ?? defaultData.config.logoUrl ?? '',
    endDate: raw.config.endDate || raw.config.date || defaultData.config.date,
    closingTime: raw.config.closingTime || '18:00',
    showClockToVoters: raw.config.showClockToVoters !== false,
  };

  // Ensure any standard default accounts (like the accredited Agent Monitor) are present if missing
  let mergedAccounts = raw.accounts && raw.accounts.length > 0 ? [...raw.accounts] : [...DEFAULT_USER_ACCOUNTS];
  for (const defAcc of DEFAULT_USER_ACCOUNTS) {
    if (!mergedAccounts.some((a) => a.id === defAcc.id || a.role === defAcc.role)) {
      mergedAccounts.push(defAcc);
    }
  }

  return {
    ...raw,
    config,
    positions: raw.positions || [],
    candidates: raw.candidates || [],
    voters: raw.voters || [],
    ballots: raw.ballots || [],
    auditLogs: raw.auditLogs || [],
    accounts: mergedAccounts,
  };
}

/**
 * Open IndexedDB database
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Load election data from IndexedDB with localStorage fallback
 */
export async function loadElectionData(): Promise<ElectionData> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(STORAGE_KEY);

      req.onsuccess = () => {
        if (req.result) {
          resolve(normalizeElectionData(req.result as ElectionData));
        } else {
          // Fallback to localStorage
          const local = localStorage.getItem(STORAGE_KEY);
          if (local) {
            try {
              const parsed = JSON.parse(local);
              resolve(normalizeElectionData(parsed));
              return;
            } catch {
              // ignore
            }
          }
          const defaultData = getDefaultElectionData();
          saveElectionData(defaultData);
          resolve(defaultData);
        }
      };

      req.onerror = () => {
        // Fallback to localStorage
        const local = localStorage.getItem(STORAGE_KEY);
        if (local) {
          try {
            resolve(normalizeElectionData(JSON.parse(local)));
            return;
          } catch {
            // ignore
          }
        }
        resolve(getDefaultElectionData());
      };
    });
  } catch (err) {
    console.warn('IndexedDB unavailable, using localStorage fallback', err);
    const local = localStorage.getItem(STORAGE_KEY);
    if (local) {
      try {
        return normalizeElectionData(JSON.parse(local));
      } catch {
        // ignore
      }
    }
    const defaultData = getDefaultElectionData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
    return defaultData;
  }
}

/**
 * Save election data to IndexedDB and localStorage
 */
export async function saveElectionData(data: ElectionData): Promise<void> {
  // Always mirror in localStorage for immediate sync
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.warn('Failed to mirror election data in localStorage', err);
  }

  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(data, STORAGE_KEY);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('IndexedDB save failed, relying on localStorage', err);
  }
}

/**
 * Trigger browser download of CSV string
 */
export function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Trigger browser download of JSON string
 */
export function downloadJSON(filename: string, jsonContent: string) {
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
