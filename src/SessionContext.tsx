import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Session {
  id: string;
  timestamp: string;
  template: string;
  photos: string[];
  amount: number;
  status: string;
}

interface SessionContextType {
  sessions: Session[];
  loading: boolean;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

const DUMMY_SESSIONS: Session[] = [
  {
    id: '#US-8821',
    timestamp: '2026-04-01T10:15:00',
    template: 'Gold Birthday',
    photos: ['https://picsum.photos/seed/8821/200/300'],
    amount: 35000,
    status: 'Success'
  },
  {
    id: '#US-8822',
    timestamp: '2026-04-01T11:20:00',
    template: 'Toy Story Kids',
    photos: ['https://picsum.photos/seed/8822/200/300'],
    amount: 25000,
    status: 'Success'
  },
  {
    id: '#US-8823',
    timestamp: '2026-04-01T13:45:00',
    template: 'Graduation Theme',
    photos: ['https://picsum.photos/seed/8823/200/300'],
    amount: 35000,
    status: 'Failed (Paper Jam)'
  },
  {
    id: '#US-8824',
    timestamp: '2026-04-01T15:10:00',
    template: 'Gold Birthday',
    photos: ['https://picsum.photos/seed/8824/200/300'],
    amount: 35000,
    status: 'Success'
  },
  {
    id: '#US-8825',
    timestamp: '2026-04-01T16:30:00',
    template: 'Toy Story Kids',
    photos: ['https://picsum.photos/seed/8825/200/300'],
    amount: 25000,
    status: 'Success'
  }
];

export const SessionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch Sessions on mount
  useEffect(() => {
    async function fetchSessions() {
      try {
        const res = await fetch("/api/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data);
        }
      } catch (err) {
        console.error("Error fetching sessions:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchSessions();
  }, []);

  return (
    <SessionContext.Provider value={{ sessions, loading }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (context === undefined) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return context;
};
