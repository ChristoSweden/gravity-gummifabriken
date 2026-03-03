export interface Profile {
    id: string;
    full_name: string;
    interests: string[];
    avatar_url?: string;
    headline?: string;
    company?: string;
}

export interface Connection {
    id: string;
    requester_id: string;
    recipient_id: string;
    status: 'pending' | 'accepted';
    created_at: string;
}

export interface Message {
    id: string;
    sender_id: string;
    recipient_id: string;
    content: string;
    created_at: string;
}

export const MOCK_USERS: Profile[] = [
    {
        id: 'user-1',
        full_name: 'Dr. Evelyn Reed',
        interests: ['AI / Machine Learning', 'Health Tech', 'Sustainability', 'SaaS'],
        headline: 'AI Architect',
        company: 'Design Studio',
    },
    {
        id: 'user-2',
        full_name: 'Marcus Chen',
        interests: ['AI / Machine Learning', 'Cybersecurity', 'SaaS', 'Fintech'],
        headline: 'Data Scientist',
        company: 'TechCorp',
    },
    {
        id: 'user-3',
        full_name: 'Anya Petrova',
        interests: ['UX Design', 'Creative Arts', 'E-commerce', 'Sustainability'],
        headline: 'Product Manager',
        company: 'Flow.ai',
    },
    {
        id: 'user-4',
        full_name: 'Julian Wright',
        interests: ['Fintech', 'SaaS', 'Clean Energy', 'AI / Machine Learning'],
        headline: 'Venture Capitalist',
        company: 'Seed Fund',
    },
    {
        id: 'user-5',
        full_name: 'Lars Svensson',
        interests: ['Manufacturing', 'Robotics', 'Supply Chain', 'IoT'],
        headline: 'Operations Manager',
        company: 'Gummifabriken',
    },
];

export const MOCK_ME: Profile = {
    id: 'me-demo',
    full_name: 'Demo User',
    interests: [],
    headline: '',
    company: '',
};

// Mutable state for demo mode
let _demoInterests: string[] = [];
let _demoConnections: Connection[] = [];
let _demoMessages: Message[] = [];
let _demoName = 'Demo User';
let _demoHeadline = '';
let _demoCompany = '';

export function getDemoProfile(): Profile {
    return {
        ...MOCK_ME,
        full_name: _demoName,
        interests: [..._demoInterests],
        headline: _demoHeadline,
        company: _demoCompany,
    };
}

export function setDemoProfile(name: string, headline: string, company: string) {
    _demoName = name;
    _demoHeadline = headline;
    _demoCompany = company;
}

export function getDemoInterests(): string[] {
    return [..._demoInterests];
}

export function setDemoInterests(interests: string[]) {
    _demoInterests = [...interests];
}

export function getDemoConnections(): Connection[] {
    return [..._demoConnections];
}

export function addDemoConnection(recipientId: string): Connection {
    const conn: Connection = {
        id: `conn-${Date.now()}`,
        requester_id: MOCK_ME.id,
        recipient_id: recipientId,
        status: 'pending',
        created_at: new Date().toISOString(),
    };
    _demoConnections.push(conn);
    return conn;
}

export function acceptDemoConnection(connectionId: string) {
    const conn = _demoConnections.find(c => c.id === connectionId);
    if (conn) conn.status = 'accepted';
}

export function declineDemoConnection(connectionId: string) {
    _demoConnections = _demoConnections.filter(c => c.id !== connectionId);
}

export function getDemoMessages(userId: string): Message[] {
    return _demoMessages.filter(m =>
        (m.sender_id === MOCK_ME.id && m.recipient_id === userId) ||
        (m.sender_id === userId && m.recipient_id === MOCK_ME.id)
    );
}

export function addDemoMessage(recipientId: string, content: string): Message {
    const msg: Message = {
        id: `msg-${Date.now()}`,
        sender_id: MOCK_ME.id,
        recipient_id: recipientId,
        content,
        created_at: new Date().toISOString(),
    };
    _demoMessages.push(msg);
    return msg;
}

export function isConnectedInDemo(userId: string): 'none' | 'pending_sent' | 'pending_received' | 'accepted' {
    const conn = _demoConnections.find(c =>
        (c.requester_id === MOCK_ME.id && c.recipient_id === userId) ||
        (c.requester_id === userId && c.recipient_id === MOCK_ME.id)
    );
    if (!conn) return 'none';
    if (conn.status === 'accepted') return 'accepted';
    if (conn.requester_id === MOCK_ME.id) return 'pending_sent';
    return 'pending_received';
}

// Seed some initial data to make the demo feel alive
export function seedDemoData() {
    // Add a pending request FROM user-1 to demo user
    _demoConnections = [
        {
            id: 'conn-seed-1',
            requester_id: 'user-1',
            recipient_id: MOCK_ME.id,
            status: 'pending',
            created_at: new Date(Date.now() - 300000).toISOString(),
        },
    ];
    _demoMessages = [];
}
