import {
  Candidate,
  ElectionConfig,
  ElectionData,
  Position,
  UserAccount,
  Voter,
} from '../types';

export const DEFAULT_USER_ACCOUNTS: UserAccount[] = [
  {
    id: 'user-commissioner',
    username: 'commissioner',
    fullName: 'Hon. Kwesi Mensah',
    role: 'Electoral Commissioner',
    passwordPin: 'admin123',
    email: 'commissioner@school-elections.edu',
    createdAt: '2026-09-01T08:00:00.000Z',
    isActive: true,
    twoFactorEnabled: true,
    twoFactorSecret: 'COMM-2FA-9941',
    twoFactorBackupCodes: ['BACKUP-8841', 'BACKUP-9923', 'EMERGENCY-2026'],
  },
  {
    id: 'user-president',
    username: 'president',
    fullName: 'Jessica Taylor (Council President)',
    role: 'Association President',
    passwordPin: 'pres123',
    email: 'president@student-association.org',
    createdAt: '2026-09-01T08:00:00.000Z',
    isActive: true,
    twoFactorEnabled: true,
    twoFactorSecret: 'PRES-2FA-4122',
    twoFactorBackupCodes: ['BACKUP-4122', 'BACKUP-7719', 'EMERGENCY-2026'],
  },
  {
    id: 'user-alumni',
    username: 'alumni',
    fullName: 'Eng. David Osei (Alumni Council)',
    role: 'Alumni Rep',
    passwordPin: 'alumni123',
    email: 'alumni.observer@school-foundation.org',
    createdAt: '2026-09-01T08:00:00.000Z',
    isActive: true,
    twoFactorEnabled: true,
    twoFactorSecret: 'ALUM-2FA-6531',
    twoFactorBackupCodes: ['BACKUP-6531', 'BACKUP-1290', 'EMERGENCY-2026'],
  },
  {
    id: 'user-developer',
    username: 'developer',
    fullName: 'Alex Vance (Lead Systems Engineer)',
    role: 'Developer',
    passwordPin: 'dev123',
    email: 'dev@school-systems.internal',
    createdAt: '2026-09-01T08:00:00.000Z',
    isActive: true,
    twoFactorEnabled: true,
    twoFactorSecret: 'DEVL-2FA-7814',
    twoFactorBackupCodes: ['BACKUP-7814', 'BACKUP-5561', 'EMERGENCY-2026'],
  },
  {
    id: 'user-agent-monitor',
    username: 'agentmonitor',
    fullName: 'Accredited Agent Monitor (Observer)',
    role: 'Agent Monitor',
    passwordPin: 'agent123',
    email: 'agent-observer@election-monitor.internal',
    createdAt: '2026-09-01T08:00:00.000Z',
    isActive: true,
    twoFactorEnabled: false,
  },
];

export function getDefaultElectionData(): ElectionData {
  const positions: Position[] = [
    {
      id: 'pos-1',
      title: 'SRC President',
      description: 'Head of the Student Representative Council and chief student liaison to school leadership.',
      maxSelections: 1,
      order: 1,
    },
    {
      id: 'pos-2',
      title: 'Vice President',
      description: 'Assists the President, leads student committee projects, and presides in the President’s absence.',
      maxSelections: 1,
      order: 2,
    },
    {
      id: 'pos-3',
      title: 'General Secretary',
      description: 'Maintains official meeting records, coordinates agendas, and manages student council communications.',
      maxSelections: 1,
      order: 3,
    },
    {
      id: 'pos-4',
      title: 'Treasurer',
      description: 'Oversees student activity funds, club budgets, and publishes transparent financial reports.',
      maxSelections: 1,
      order: 4,
    },
    {
      id: 'pos-5',
      title: 'Public Relations Officer (P.R.O.)',
      description: 'Manages announcements, bulletin boards, social campaigns, and school spirit initiatives.',
      maxSelections: 1,
      order: 5,
    },
  ];

  const candidates: Candidate[] = [
    // President
    {
      id: 'cand-1',
      positionId: 'pos-1',
      name: 'Maya Lin',
      slogan: 'Action, Accountability, and All Voices Heard.',
      photoUrl: '',
      manifesto:
        'As your SRC President, I will advocate for improved study hall spaces, transparent communication between students and administration, and an open forum every month where any student can submit ideas directly to the council.',
    },
    {
      id: 'cand-2',
      positionId: 'pos-1',
      name: 'Marcus Adebayo',
      slogan: 'Uniting Our Campus for a Stronger Future.',
      photoUrl: '',
      manifesto:
        'My goal is to expand student club funding, revitalize inter-class sports tournaments, and partner with the cafeteria to introduce healthier, student-voted snack options throughout the semester.',
    },
    // Vice President
    {
      id: 'cand-3',
      positionId: 'pos-2',
      name: 'Elena Rostova',
      slogan: 'Dedicated to Teamwork and Inclusive Programs.',
      photoUrl: '',
      manifesto:
        'I plan to launch a peer mentorship program connecting incoming junior students with senior study buddies, and organize school-wide wellness weeks during midterms.',
    },
    {
      id: 'cand-4',
      positionId: 'pos-2',
      name: 'Tariq Hassan',
      slogan: 'Practical Solutions for Real Student Needs.',
      photoUrl: '',
      manifesto:
        'I will establish a streamlined digital suggestion box, ensure school lockers and equipment are promptly serviced, and support student-led community outreach drives.',
    },
    // Secretary
    {
      id: 'cand-5',
      positionId: 'pos-3',
      name: 'Chloe Bennett',
      slogan: 'Organized, Dependable, and Always Informed.',
      photoUrl: '',
      manifesto:
        'Minutes will be published within 24 hours of every SRC meeting on our school notice board. Every student will always know what decisions are being made on their behalf.',
    },
    {
      id: 'cand-6',
      positionId: 'pos-3',
      name: 'Daniel Chen',
      slogan: 'Clear Notes, Clear Vision.',
      photoUrl: '',
      manifesto:
        'I will build a shared digital newsletter and calendar so no student ever misses a club signup, spirit day theme, or leadership deadline.',
    },
    // Treasurer
    {
      id: 'cand-7',
      positionId: 'pos-4',
      name: 'Sofia Al-Mansoor',
      slogan: 'Every Cent Accounted For, Every Club Supported.',
      photoUrl: '',
      manifesto:
        'I bring two years of club bookkeeping experience. I will ensure fair and equitable budget allocations across arts, STEM, athletics, and cultural societies.',
    },
    {
      id: 'cand-8',
      positionId: 'pos-4',
      name: 'Liam O’Connor',
      slogan: 'Transparency and Smart Resource Allocation.',
      photoUrl: '',
      manifesto:
        'I pledge to publish quarterly visual budget graphs so the entire student body can see exactly how council dues and fundraiser proceeds are utilized.',
    },
    // P.R.O.
    {
      id: 'cand-9',
      positionId: 'pos-5',
      name: 'Amara Okafor',
      slogan: 'Bringing Energy, Spirit, and Creativity.',
      photoUrl: '',
      manifesto:
        'From high-energy pep rallies to vibrant graphic flyers for campus events, I will make sure our school spirit is higher than ever before!',
    },
    {
      id: 'cand-10',
      positionId: 'pos-5',
      name: 'Lucas Vance',
      slogan: 'Your Stories, Your Voice, Front and Center.',
      photoUrl: '',
      manifesto:
        'I will highlight student achievements, showcase classroom projects, and run student spotlight interviews on the main hallway video displays.',
    },
  ];

  // Sample registered voters with Student IDs and unpredictable 8-digit unique Access PINs
  const voters: Voter[] = [
    { id: 'v-1', fullName: 'Jordan Taylor', voterId: 'STU101', pin: '7K9X2M4P', hasVoted: false, votedAt: null },
    { id: 'v-2', fullName: 'Samantha Reed', voterId: 'STU102', pin: '3H8N5W2R', hasVoted: false, votedAt: null },
    { id: 'v-3', fullName: 'Alex Rivera', voterId: 'STU103', pin: '9B4T7Q1Y', hasVoted: false, votedAt: null },
    { id: 'v-4', fullName: 'Kwame Asante', voterId: 'STU104', pin: '6V2P8M3K', hasVoted: false, votedAt: null },
    { id: 'v-5', fullName: 'Fatima Zahra', voterId: 'STU105', pin: '4N9D2X7L', hasVoted: false, votedAt: null },
    { id: 'v-6', fullName: 'Brandon Lee', voterId: 'STU106', pin: '8J3C6Y9T', hasVoted: false, votedAt: null },
    { id: 'v-7', fullName: 'Priya Sharma', voterId: 'STU107', pin: '2W7K5M8A', hasVoted: false, votedAt: null },
    { id: 'v-8', fullName: 'Noah Williams', voterId: 'STU108', pin: '5F9H3Q6Z', hasVoted: false, votedAt: null },
    { id: 'v-9', fullName: 'Zoe Martinez', voterId: 'STU109', pin: '9X4L7P2E', hasVoted: false, votedAt: null },
    { id: 'v-10', fullName: 'David Kim', voterId: 'STU110', pin: '3M8B5T9C', hasVoted: false, votedAt: null },
    { id: 'v-11', fullName: 'Aisha Bello', voterId: 'STU111', pin: '7R2K9V4N', hasVoted: false, votedAt: null },
    { id: 'v-12', fullName: 'Ethan Murphy', voterId: 'STU112', pin: '4T6M8J3W', hasVoted: false, votedAt: null },
    { id: 'v-13', fullName: 'Grace Osei', voterId: 'STU113', pin: '8Q3X7P9Y', hasVoted: false, votedAt: null },
    { id: 'v-14', fullName: 'Mateo Gomez', voterId: 'STU114', pin: '2L9N4C7F', hasVoted: false, votedAt: null },
    { id: 'v-15', fullName: 'Hanna Lindstrom', voterId: 'STU115', pin: '6K2W8M5V', hasVoted: false, votedAt: null },
  ];

  // Current date for default config
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const config: ElectionConfig = {
    id: 'config-1',
    title: '2026 Student Representative Council Elections',
    schoolName: 'Accra Academy Senior High School',
    logoUrl: '',
    date: dateStr,
    requirePin: true,
    adminPin: 'admin123',
    hideTalliesDuringVoting: true,
    allowPracticeBallot: true,
    endDate: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    showClockToVoters: true,
    enableCaptcha: true,
  };

  return {
    config,
    positions,
    candidates,
    voters,
    ballots: [],
    auditLogs: [
      {
        id: 'log-init-1',
        timestamp: new Date().toISOString(),
        eventType: 'settings_updated',
        details: 'Initial election configuration and ballot rules created.',
        category: 'security',
        actor: 'Hon. Kwesi Mensah (Electoral Commissioner)',
        actorRole: 'Electoral Commissioner',
        ipAddress: '127.0.0.1 (Local Commission Station)',
      },
    ],
    accounts: DEFAULT_USER_ACCOUNTS,
  };
}

export function createEmptyElectionData(title: string, schoolName: string): ElectionData {
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    config: {
      id: 'config-' + Date.now(),
      title,
      schoolName,
      logoUrl: '',
      date: dateStr,
      requirePin: true,
      adminPin: 'admin123',
      hideTalliesDuringVoting: true,
      allowPracticeBallot: true,
      showClockToVoters: true,
      enableCaptcha: true,
    },
    positions: [],
    candidates: [],
    voters: [],
    ballots: [],
    auditLogs: [
      {
        id: 'log-' + Date.now(),
        timestamp: new Date().toISOString(),
        eventType: 'settings_updated',
        details: `Clean election cycle initialized: "${title}".`,
        category: 'security',
      },
    ],
    accounts: DEFAULT_USER_ACCOUNTS,
  };
}
