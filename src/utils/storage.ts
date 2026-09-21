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
import { supabase } from '../lib/supabase'; // Adjust this path if your supabase client is elsewhere!
import { ElectionData, ElectionStatus } from '../types';

// ... Keep your existing getDefaultElectionData() and other functions ...

export async function loadElectionData(): Promise<ElectionData> {
  try {
    const { data, error } = await supabase
      .from('elections')
      .select('data')
      .eq('id', 'current')
      .single();

    if (error || !data) {
      console.log("No data in Supabase yet, returning default.");
      return getDefaultElectionData();
    }

    return normalizeElectionData(data.data as ElectionData);
  } catch (error) {
    console.error("Error loading from Supabase:", error);
    return getDefaultElectionData();
  }
}

export async function saveElectionData(electionData: ElectionData): Promise<void> {
  try {
    const { error } = await supabase
      .from('elections')
      .upsert({ 
        id: 'current', 
        data: electionData,
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  } catch (error) {
    console.error("Error saving to Supabase:", error);
  }
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
