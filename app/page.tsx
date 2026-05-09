'use client';

import dynamic from 'next/dynamic';

// Disable SSR to prevent the hydration "flash"
const Dashboard = dynamic(() => import('@/components/Dashboard'), { 
  ssr: false,
  loading: () => <div style={{height: '100vh', background: '#f8fafc'}}></div>
});

export default function Home() {
  return (
    <main>
      <Dashboard />
    </main>
  );
}
