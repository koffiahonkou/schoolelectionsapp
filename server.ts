import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { Ballot, ElectionData, ElectionStatus, Voter, AuditLogEntry, IpLogEntry, SecurityThreatSummary } from './src/types';
import { getDefaultElectionData, createEmptyElectionData } from './src/utils/defaultData';

const PORT = 3000;
const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'election-data.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory canonical election state
let electionData: ElectionData;
let electionStatus: ElectionStatus = 'Open';

// Load initial state from disk or fallback to default
try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    electionData = parsed.data || parsed;
    electionStatus = parsed.status || 'Open';
    console.log(`[Server] Loaded election data from disk: ${electionData.ballots.length} ballots recorded.`);
  } else {
    electionData = getDefaultElectionData();
    electionStatus = 'Open';
    saveElectionToDisk();
    console.log('[Server] Initialized fresh election dataset.');
  }
} catch (err) {
  console.error('[Server] Failed to read existing data file, initializing defaults:', err);
  electionData = getDefaultElectionData();
  electionStatus = 'Open';
}

const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

function computeAuditHashNode(
  entry: {
    id: string;
    timestamp: string;
    eventType: string;
    details: string;
    category: string;
    actor?: string;
    ipAddress?: string;
  },
  previousHash: string
): string {
  const canonicalString = [
    previousHash,
    entry.id,
    entry.timestamp,
    entry.eventType,
    entry.category,
    entry.actor || 'Unknown',
    entry.ipAddress || '127.0.0.1',
    entry.details.trim(),
  ].join('|');

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

function appendServerAuditLog(entryData: {
  eventType: AuditLogEntry['eventType'];
  details: string;
  category: AuditLogEntry['category'];
  actor?: string;
  actorRole?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
  id?: string;
  timestamp?: string;
}): AuditLogEntry {
  const previousHash =
    electionData.auditLogs.length > 0 &&
    electionData.auditLogs[electionData.auditLogs.length - 1].evidenceHash
      ? electionData.auditLogs[electionData.auditLogs.length - 1].evidenceHash!
      : GENESIS_HASH;

  const id = entryData.id || 'aud-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const timestamp = entryData.timestamp || new Date().toISOString();

  const evidenceHash = computeAuditHashNode(
    {
      id,
      timestamp,
      eventType: entryData.eventType,
      details: entryData.details,
      category: entryData.category,
      actor: entryData.actor,
      ipAddress: entryData.ipAddress,
    },
    previousHash
  );

  const fullEntry: AuditLogEntry = {
    ...entryData,
    id,
    timestamp,
    previousHash,
    evidenceHash,
  };

  electionData.auditLogs.push(fullEntry);
  return fullEntry;
}

// Backfill cryptographic chain for any unhashed legacy logs
let runningPrevHash = GENESIS_HASH;
electionData.auditLogs = electionData.auditLogs.map((log) => {
  const prev = log.previousHash || runningPrevHash;
  const hash =
    log.evidenceHash ||
    computeAuditHashNode(
      {
        id: log.id,
        timestamp: log.timestamp,
        eventType: log.eventType,
        details: log.details,
        category: log.category,
        actor: log.actor,
        ipAddress: log.ipAddress,
      },
      prev
    );
  runningPrevHash = hash;
  return {
    ...log,
    previousHash: prev,
    evidenceHash: hash,
  };
});
saveElectionToDisk();

function saveElectionToDisk() {
  try {
    const payload = JSON.stringify({ data: electionData, status: electionStatus }, null, 2);
    // Write atomically
    const tempFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tempFile, payload, 'utf-8');
    fs.renameSync(tempFile, DATA_FILE);
  } catch (err) {
    console.error('[Server] Failed to persist election data to disk:', err);
  }
}

// Helper: Extract real client IP address
function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    return forwarded[0].trim();
  }
  const rawIp = req.ip || req.socket?.remoteAddress || '127.0.0.1';
  return rawIp.replace(/^::ffff:/, '');
}

// Security: IP Access & Suspicious Activity Log Store
const ipAccessLogs: IpLogEntry[] = [];
const MAX_IP_LOGS = 400;
const blockedIps = new Set<string>();
const failedLoginTracker = new Map<string, { count: number; firstAttempt: number }>();
let totalRequestCounter = 0;
let rateLimitedCounter = 0;

function logIpActivity(
  req: express.Request,
  action: string,
  status: number,
  isSuspicious = false,
  threatReason?: string,
  actor?: string
) {
  totalRequestCounter++;
  const ip = getClientIp(req);
  const entry: IpLogEntry = {
    id: 'iplog-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
    ip,
    timestamp: new Date().toISOString(),
    endpoint: req.originalUrl || req.url,
    method: req.method,
    status,
    action,
    actor,
    userAgent: (req.headers['user-agent'] as string) || 'Unknown Client',
    isSuspicious,
    threatReason,
  };

  ipAccessLogs.unshift(entry);
  if (ipAccessLogs.length > MAX_IP_LOGS) {
    ipAccessLogs.pop();
  }
}

// Rate Limiting Store & Middleware
interface RateBucket {
  timestamps: number[];
  blockedUntil?: number;
}
const rateLimitBuckets = new Map<string, Map<string, RateBucket>>();

function checkRateLimit(
  routeKey: string,
  ip: string,
  maxRequests: number,
  windowMs: number,
  cooldownMs = 15000
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  if (!rateLimitBuckets.has(routeKey)) {
    rateLimitBuckets.set(routeKey, new Map());
  }
  const store = rateLimitBuckets.get(routeKey)!;
  let bucket = store.get(ip);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(ip, bucket);
  }

  // If currently on cooldown / blocked
  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil((bucket.blockedUntil - now) / 1000),
    };
  }

  // Clear timestamps older than window
  bucket.timestamps = bucket.timestamps.filter((ts) => now - ts < windowMs);

  if (bucket.timestamps.length >= maxRequests) {
    bucket.blockedUntil = now + cooldownMs;
    rateLimitedCounter++;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.ceil(cooldownMs / 1000),
    };
  }

  bucket.timestamps.push(now);
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - bucket.timestamps.length),
  };
}

// Factory for rate limiting middleware
function createRateLimiter(options: {
  routeKey: string;
  maxRequests: number;
  windowMs: number;
  cooldownMs?: number;
  actionName: string;
}) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);

    // If IP is explicitly blocked by Commission Admin
    if (blockedIps.has(ip)) {
      logIpActivity(req, `${options.actionName} (Blocked IP Access)`, 403, true, 'Access blocked by commission administrator.');
      return res.status(403).json({
        success: false,
        error: 'Access from this IP address has been blocked by the Electoral Commission for security reasons.',
      });
    }

    const { allowed, remaining, retryAfter } = checkRateLimit(
      options.routeKey,
      ip,
      options.maxRequests,
      options.windowMs,
      options.cooldownMs
    );

    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', remaining);

    if (!allowed) {
      res.setHeader('Retry-After', retryAfter || 15);
      const threatMsg = `Rate limit exceeded (${options.maxRequests} req / ${options.windowMs / 1000}s) - possible DoS burst.`;
      logIpActivity(req, `${options.actionName} (Rate Limit Exceeded)`, 429, true, threatMsg);

      // Also record in system audit log
      const auditEntry: AuditLogEntry = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        eventType: 'rate_limit_exceeded',
        category: 'security',
        details: `DoS prevention triggered on ${options.routeKey} from IP ${ip}. Requests temporarily throttled for ${retryAfter}s.`,
        ipAddress: ip,
        actor: 'DoS Protection Firewall',
        actorRole: 'Security System',
      };
      electionData.auditLogs.push(auditEntry);
      saveElectionToDisk();

      return res.status(429).json({
        success: false,
        error: `Too many requests from this IP address. Rate limit of ${options.maxRequests} requests per ${Math.round(
          options.windowMs / 1000
        )}s reached to prevent Denial of Service (DoS) attacks. Please wait ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    next();
  };
}

// High-Concurrency Mutex to serialize concurrent vote submissions
class AsyncLock {
  private promise: Promise<void> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T> | T): Promise<T> {
    let release: () => void;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.promise;
    this.promise = wait;
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }
}

const voteQueueLock = new AsyncLock();

async function startServer() {
  const app = express();

  app.use(express.json({ limit: '10mb' }));

  // Rate limiters
  const voteRateLimiter = createRateLimiter({
    routeKey: 'POST /api/vote',
    maxRequests: 20,
    windowMs: 60000,
    cooldownMs: 20000,
    actionName: 'Ballot Submission',
  });

  const adminRateLimiter = createRateLimiter({
    routeKey: 'POST /api/election/update',
    maxRequests: 45,
    windowMs: 60000,
    cooldownMs: 15000,
    actionName: 'Election Administration',
  });

  // Client IP inquiry endpoint
  app.get('/api/ip', (req, res) => {
    const ip = getClientIp(req);
    logIpActivity(req, 'Station IP Query', 200);
    res.json({ success: true, ip });
  });

  // Security: IP Logs and Threat Assessment Monitor
  app.get('/api/security/ip-logs', (req, res) => {
    const uniqueIps = new Set(ipAccessLogs.map((l) => l.ip)).size;
    const suspiciousEvents = ipAccessLogs.filter((l) => l.isSuspicious).length;
    const summary: SecurityThreatSummary = {
      totalRequests: totalRequestCounter,
      uniqueIps,
      suspiciousEvents,
      rateLimitedEvents: rateLimitedCounter,
      activeBlockedIps: Array.from(blockedIps),
      recentThreats: ipAccessLogs.filter((l) => l.isSuspicious).slice(0, 20),
    };

    res.json({
      success: true,
      logs: ipAccessLogs.slice(0, 150),
      summary,
    });
  });

  // Security: Flag or Block Suspicious IP
  app.post('/api/security/flag-ip', (req, res) => {
    const { ip, block, reason, actor } = req.body;
    if (!ip) {
      return res.status(400).json({ success: false, error: 'Target IP address is required.' });
    }

    const clientIp = getClientIp(req);
    if (block) {
      blockedIps.add(ip);
      const auditEntry: AuditLogEntry = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        eventType: 'security_alert',
        category: 'security',
        details: `IP ${ip} was blocked by administrator for suspicious activity: ${reason || 'Manual security block'}.`,
        ipAddress: clientIp,
        actor: actor || 'Commission Admin',
        actorRole: 'Security Administrator',
      };
      electionData.auditLogs.push(auditEntry);
      saveElectionToDisk();
      logIpActivity(req, `Admin Blocked IP ${ip}`, 200, true, reason, actor);
    } else {
      blockedIps.delete(ip);
      const auditEntry: AuditLogEntry = {
        id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        timestamp: new Date().toISOString(),
        eventType: 'security_alert',
        category: 'security',
        details: `IP ${ip} was unblocked by administrator.`,
        ipAddress: clientIp,
        actor: actor || 'Commission Admin',
        actorRole: 'Security Administrator',
      };
      electionData.auditLogs.push(auditEntry);
      saveElectionToDisk();
      logIpActivity(req, `Admin Unblocked IP ${ip}`, 200, false, undefined, actor);
    }

    res.json({
      success: true,
      ip,
      blocked: blockedIps.has(ip),
      activeBlockedIps: Array.from(blockedIps),
    });
  });

  // Dedicated Audit Log append endpoint (records server IP automatically and calculates SHA-256 chain)
  app.post('/api/audit/log', (req, res) => {
    const { eventType, details, category, actor, actorRole, metadata } = req.body;
    const clientIp = getClientIp(req);
    const userAgent = (req.headers['user-agent'] as string) || 'Browser Client';

    const auditEntry = appendServerAuditLog({
      eventType: eventType || 'security_alert',
      details: details || 'Administrative event recorded.',
      category: category || 'admin',
      actor: actor || 'Commission Officer',
      actorRole: actorRole || 'Staff',
      ipAddress: clientIp,
      userAgent,
      metadata,
    });

    saveElectionToDisk();

    const isSuspicious =
      eventType === 'admin_auth_failed' ||
      eventType === 'security_alert' ||
      eventType === 'rate_limit_exceeded' ||
      eventType === 'voter_login_failed';

    logIpActivity(
      req,
      `Audit: ${eventType}`,
      200,
      isSuspicious,
      isSuspicious ? details : undefined,
      actor
    );

    res.json({ success: true, entry: auditEntry });
  });

  // Verify Audit Trail Cryptographic Chain of Custody
  app.get('/api/audit/verify', (req, res) => {
    const logs = electionData.auditLogs || [];
    let expectedPrev = GENESIS_HASH;
    let isValid = true;
    let brokenAtIndex = -1;
    let tamperReason = '';

    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i];
      const prev = entry.previousHash || expectedPrev;
      const expectedHash = computeAuditHashNode(
        {
          id: entry.id,
          timestamp: entry.timestamp,
          eventType: entry.eventType,
          details: entry.details,
          category: entry.category,
          actor: entry.actor,
          ipAddress: entry.ipAddress,
        },
        prev
      );

      if (entry.previousHash && entry.previousHash !== expectedPrev) {
        isValid = false;
        brokenAtIndex = i;
        tamperReason = `Chain broken at entry index ${i} (ID: ${entry.id}). Previous hash mismatch.`;
        break;
      }

      if (entry.evidenceHash && entry.evidenceHash !== expectedHash) {
        isValid = false;
        brokenAtIndex = i;
        tamperReason = `Signature hash mismatch at entry index ${i} (ID: ${entry.id}). Content or timestamp was modified.`;
        break;
      }

      expectedPrev = entry.evidenceHash || expectedHash;
    }

    res.json({
      success: true,
      verification: {
        isValid,
        totalEntries: logs.length,
        brokenAtIndex: brokenAtIndex >= 0 ? brokenAtIndex : null,
        tamperReason: tamperReason || null,
        genesisHash: GENESIS_HASH,
        headHash: logs.length > 0 ? logs[logs.length - 1].evidenceHash || expectedPrev : GENESIS_HASH,
        verifiedCount: brokenAtIndex >= 0 ? brokenAtIndex : logs.length,
      },
    });
  });

  // Export certified Legal Evidence Dossier
  app.get('/api/audit/legal-dossier', (req, res) => {
    const totalVotesCast = electionData.ballots.filter((b) => !b.isPractice).length;
    const demoVotesCast = electionData.ballots.filter((b) => b.isPractice).length;
    const registeredVoters = electionData.voters.length;
    const verifiedVotedRosterCount = electionData.voters.filter((v) => v.hasVoted).length;

    const dossier = {
      documentTitle: 'OFFICIAL ELECTION AUDIT DOSSIER & CHAIN OF CUSTODY EVIDENCE',
      classification: 'LEGAL EVIDENCE - OFFICIAL EXHIBIT',
      generationTimestamp: new Date().toISOString(),
      schoolName: electionData.config.schoolName || 'Lincoln High School',
      electionTitle: electionData.config.title || 'Student Council General Election',
      electionStatus,
      evidentiarySummary: {
        totalAuditEntries: electionData.auditLogs.length,
        hashAlgorithm: 'NIST FIPS 180-4 SHA-256 (Merkle Chained)',
        genesisHash: GENESIS_HASH,
        terminalHeadHash:
          electionData.auditLogs.length > 0
            ? electionData.auditLogs[electionData.auditLogs.length - 1].evidenceHash || 'None'
            : GENESIS_HASH,
      },
      ballotReconciliation: {
        registeredVotersRoll: registeredVoters,
        officialBallotsDeposited: totalVotesCast,
        votersMarkedAsVotedInRoster: verifiedVotedRosterCount,
        reconciliationDiscrepancy: totalVotesCast - verifiedVotedRosterCount,
        turnoutPercentage:
          registeredVoters > 0
            ? ((totalVotesCast / registeredVoters) * 100).toFixed(2) + '%'
            : '0.00%',
        demoPracticeBallotsIsolated: demoVotesCast,
      },
      auditLedger: electionData.auditLogs,
    };

    res.json({ success: true, dossier });
  });

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      ballotsCount: electionData.ballots.length,
      electionStatus,
      clientIp: getClientIp(req),
    });
  });

  // GET current election state
  app.get('/api/election', (req, res) => {
    logIpActivity(req, 'Fetch Election State', 200);
    res.json({
      success: true,
      data: electionData,
      status: electionStatus,
    });
  });

  // POST concurrent-safe vote submission with Rate Limiting and Captcha Protection
  app.post('/api/vote', voteRateLimiter, async (req, res) => {
    const { voterId, passcode, choices, isPractice, captchaVerified } = req.body;
    const clientIp = getClientIp(req);

    if (!choices || typeof choices !== 'object') {
      logIpActivity(req, 'Vote Rejected (Invalid Choices Payload)', 400, true, 'Malformed ballot choices payload.');
      return res.status(400).json({ success: false, error: 'Invalid ballot choices payload.' });
    }

    // Check anti-bot captcha verification
    if (electionData.config.enableCaptcha && !isPractice && captchaVerified !== true) {
      appendServerAuditLog({
        eventType: 'security_alert',
        category: 'security',
        details: 'Vote deposit blocked: Anti-bot CAPTCHA verification failed or bypassed.',
        actor: 'Client Voter',
        actorRole: 'Voter',
        ipAddress: clientIp,
        metadata: { reason: 'CAPTCHA verification failure' },
      });
      saveElectionToDisk();
      logIpActivity(req, 'Vote Rejected (Missing Captcha Verification)', 403, true, 'Bot check failed or bypassed.');
      return res.status(403).json({
        success: false,
        error: 'Anti-bot CAPTCHA verification required to cast an official ballot.',
      });
    }

    // Atomic execution inside mutex lock to handle simultaneous online votes
    try {
      const result = await voteQueueLock.acquire(async () => {
        // 1. Check if polls are open
        if (electionStatus !== 'Open' && !isPractice) {
          appendServerAuditLog({
            eventType: 'security_alert',
            category: 'security',
            details: `Vote rejected: Polls are currently ${electionStatus.toLowerCase()}.`,
            actor: 'Client Voter',
            actorRole: 'Voter',
            ipAddress: clientIp,
          });
          saveElectionToDisk();
          logIpActivity(req, 'Vote Rejected (Polls Closed)', 403, false);
          return {
            status: 403,
            body: { success: false, error: `Polls are currently ${electionStatus.toLowerCase()}. Voting is not permitted.` },
          };
        }

        let targetVoter: Voter | undefined;

        // 2. Strict One-Person-One-Vote verification for official votes
        if (!isPractice) {
          if (!voterId || typeof voterId !== 'string') {
            logIpActivity(req, 'Vote Rejected (Missing Student ID)', 400, true, 'No voter ID provided');
            return {
              status: 400,
              body: { success: false, error: 'Student Voter ID is required for official voting.' },
            };
          }

          const normalizedId = voterId.trim().toUpperCase();
          targetVoter = electionData.voters.find(
            (v) => v.voterId.trim().toUpperCase() === normalizedId
          );

          if (!targetVoter && electionData.voters.length > 0) {
            appendServerAuditLog({
              eventType: 'voter_login_failed',
              category: 'security',
              details: `Ballot submission rejected: Student ID "${normalizedId}" was not found on the registered voter roll.`,
              actor: `Unlisted ID: ${normalizedId}`,
              actorRole: 'Voter',
              ipAddress: clientIp,
              metadata: { attemptedId: normalizedId },
            });
            saveElectionToDisk();
            logIpActivity(
              req,
              `Vote Rejected (Unregistered ID "${normalizedId}")`,
              404,
              true,
              `Attempted vote with unlisted voter ID: ${normalizedId}`
            );
            return {
              status: 404,
              body: { success: false, error: `Voter ID "${normalizedId}" was not found on the registered student roll.` },
            };
          }

          if (targetVoter && targetVoter.hasVoted) {
            appendServerAuditLog({
              eventType: 'security_alert',
              category: 'security',
              details: `EVIDENTIARY DOUBLE-VOTING ALERT: Student ID "${normalizedId}" (${targetVoter.fullName}) attempted to cast a duplicate ballot. Attempt blocked.`,
              actor: `Student Voter (${normalizedId})`,
              actorRole: 'Voter',
              ipAddress: clientIp,
              metadata: { studentId: normalizedId, originalVotedAt: targetVoter.votedAt },
            });
            saveElectionToDisk();
            logIpActivity(
              req,
              `Vote Rejected (Duplicate Attempt for "${normalizedId}")`,
              409,
              true,
              `Duplicate vote attempt for student ${normalizedId}`
            );
            return {
              status: 409,
              body: {
                success: false,
                error: `This Student ID (${normalizedId}) has already cast an official ballot in this election.`,
              },
            };
          }

          // Check PIN if required by config
          if (electionData.config.requirePin && targetVoter && targetVoter.pin) {
            if (passcode && passcode.trim() !== targetVoter.pin.trim()) {
              appendServerAuditLog({
                eventType: 'voter_login_failed',
                category: 'security',
                details: `Voter authentication failed: Incorrect access PIN entered for Student ID "${normalizedId}".`,
                actor: `Student Voter (${normalizedId})`,
                actorRole: 'Voter',
                ipAddress: clientIp,
                metadata: { studentId: normalizedId },
              });
              saveElectionToDisk();
              logIpActivity(
                req,
                `Vote Rejected (Invalid PIN for "${normalizedId}")`,
                401,
                true,
                `Wrong PIN entered for student ${normalizedId}`
              );
              return {
                status: 401,
                body: { success: false, error: 'Incorrect access PIN provided.' },
              };
            }
          }
        }

        // 3. Construct Secret Anonymous Ballot
        // CRITICAL: NEVER attach student voter ID, name, or IP to ballot choices!
        const newBallot: Ballot = {
          id: 'bal-' + Date.now() + '-' + Math.random().toString(36).substring(2, 8),
          submittedAt: new Date().toISOString(),
          isPractice: Boolean(isPractice),
          choices: { ...choices },
        };

        // 4. Update election data atomically
        if (!isPractice && targetVoter) {
          targetVoter.hasVoted = true;
          targetVoter.votedAt = newBallot.submittedAt;
        }

        electionData.ballots.push(newBallot);

        // 5. Append tamper-evident chained audit log
        const officialCount = electionData.ballots.filter((b) => !b.isPractice).length;
        const totalVoters = electionData.voters.length;
        const auditEntry = appendServerAuditLog({
          eventType: 'ballot_submitted',
          category: 'ballot',
          details: isPractice
            ? 'Demo practice ballot cast and verified.'
            : `Official anonymous ballot deposited online. Live turnout: ${officialCount}/${totalVoters} (${
                totalVoters > 0 ? Math.round((officialCount / totalVoters) * 100) : 0
              }%). Verifiable secret ballot receipt issued.`,
          actor: isPractice ? 'Demo Voter' : 'Verified Student Voter',
          actorRole: 'Voter',
          ipAddress: clientIp,
          userAgent: (req.headers['user-agent'] as string) || 'Browser Client',
          metadata: {
            ballotId: newBallot.id,
            isPractice: Boolean(isPractice),
            turnoutCount: officialCount,
            totalRegistered: totalVoters,
            submittedAt: newBallot.submittedAt,
          },
        });

        // Record successful IP activity
        logIpActivity(
          req,
          isPractice ? 'Demo Ballot Cast' : 'Official Ballot Deposited',
          200,
          false,
          undefined,
          isPractice ? 'Demo Voter' : 'Verified Student Voter'
        );

        // 6. Save immediately to disk
        saveElectionToDisk();

        return {
          status: 200,
          body: {
            success: true,
            ballotId: newBallot.id,
            timestamp: newBallot.submittedAt,
            data: electionData,
            status: electionStatus,
          },
        };
      });

      return res.status(result.status).json(result.body);
    } catch (err: any) {
      console.error('[Server] Error processing concurrent vote:', err);
      logIpActivity(req, 'Server Error on Ballot Submission', 500, false, err?.message);
      return res.status(500).json({ success: false, error: 'Internal server error while depositing ballot.' });
    }
  });

  // POST update election state (admin changes) with Rate Limiter
  app.post('/api/election/update', adminRateLimiter, (req, res) => {
    const { data: updatedData, status: updatedStatus, actor, actorRole, actionDescription } = req.body;
    const clientIp = getClientIp(req);

    if (updatedData) {
      electionData = updatedData;
    }
    if (updatedStatus) {
      electionStatus = updatedStatus;
    }

    // Log admin action activity
    logIpActivity(
      req,
      actionDescription || 'Admin State Update',
      200,
      false,
      undefined,
      actor ? `${actor} (${actorRole || 'Admin'})` : undefined
    );

    saveElectionToDisk();
    res.json({
      success: true,
      data: electionData,
      status: electionStatus,
      clientIp,
    });
  });

  // POST reset election
  app.post('/api/election/reset', (req, res) => {
    const { title = 'Classroom Election', school = 'Our School', actor } = req.body;
    const clientIp = getClientIp(req);

    electionData = createEmptyElectionData(title, school);
    electionStatus = 'Setup';

    // Record reset in audit log with IP and Actor
    electionData.auditLogs[0].ipAddress = clientIp;
    if (actor) {
      electionData.auditLogs[0].actor = actor;
    }

    logIpActivity(req, `Election Reset: "${title}"`, 200, false, undefined, actor);
    saveElectionToDisk();

    res.json({
      success: true,
      data: electionData,
      status: electionStatus,
      clientIp,
    });
  });

  // Mount Vite or static file serving
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Online election service running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
