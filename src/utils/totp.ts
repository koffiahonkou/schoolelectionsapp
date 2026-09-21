/**
 * Two-Factor Authentication (2FA) TOTP and Backup Codes Generator
 */

// Simple deterministic hash to generate 6-digit TOTP from secret and 30-second window
export function generateTotpCode(secret: string, timeStepSec = 30): { code: string; secondsRemaining: number } {
  const nowMs = Date.now();
  const timeStep = Math.floor(nowMs / (timeStepSec * 1000));
  const secondsRemaining = timeStepSec - Math.floor((nowMs / 1000) % timeStepSec);

  // Combine secret and timeStep into numeric hash
  let hash = 0;
  const combined = `${secret}:${timeStep}`;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }

  const positiveHash = Math.abs(hash);
  const code = (positiveHash % 1000000).toString().padStart(6, '0');

  return { code, secondsRemaining };
}

// Validates user input against current or previous time window (allowing 30s clock drift), or backup codes
export function verifyTotpCode(
  inputCode: string,
  secret: string,
  backupCodes: string[] = []
): { valid: boolean; isBackup?: boolean } {
  const clean = inputCode.trim().toUpperCase().replace(/[\s-]/g, '');

  // 1. Check emergency backup codes
  for (const bc of backupCodes) {
    const cleanBc = bc.trim().toUpperCase().replace(/[\s-]/g, '');
    if (clean === cleanBc) {
      return { valid: true, isBackup: true };
    }
  }

  // 2. Check TOTP window (current and previous window to absorb latency)
  const nowMs = Date.now();
  const timeStep = Math.floor(nowMs / 30000);

  for (const step of [timeStep, timeStep - 1, timeStep + 1]) {
    let hash = 0;
    const combined = `${secret}:${step}`;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    const code = (Math.abs(hash) % 1000000).toString().padStart(6, '0');
    if (clean === code) {
      return { valid: true, isBackup: false };
    }
  }

  return { valid: false };
}

export function generateBackupCodes(count = 3): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const num = Math.floor(1000 + Math.random() * 9000);
    codes.push(`BACKUP-${num}`);
  }
  return codes;
}
