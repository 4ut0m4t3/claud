import { Routes, Route, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Review from './pages/Review';
import Timeline from './pages/Timeline';
import Setup from './pages/Setup';
import Transcribe from './pages/Transcribe';
import { getInvoices } from './api/client';
import type { Invoice } from './types';

const NAV_LINKS = [
  { to: '/', label: 'Dashboard', exact: true },
  { to: '/upload', label: 'Upload' },
  { to: '/timeline', label: 'Timeline' },
  { to: '/setup', label: 'Setup' },
  { to: '/transcribe', label: 'Transcribe' },
];

export default function App() {
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: getInvoices,
    refetchInterval: 5000,
  });

  const reviewCount = invoices?.filter(i => i.status === 'review' && i.needs_review_count > 0).length ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center text-white font-bold text-sm">H</div>
          <span className="font-semibold text-lg tracking-tight">HMO Invoice Tracker</span>
        </div>
        <nav className="flex items-center gap-1 ml-4">
          {NAV_LINKS.map(link => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.exact}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {/* Review link with badge */}
          <NavLink
            to="/review"
            className={({ isActive }) =>
              `relative px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive ? 'bg-brand-600 text-white' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
              }`
            }
          >
            Review
            {reviewCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-bold">
                {reviewCount}
              </span>
            )}
          </NavLink>
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/review" element={<Review />} />
          <Route path="/review/:invoiceId" element={<Review />} />
          <Route path="/timeline" element={<Timeline />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/transcribe" element={<Transcribe />} />
        </Routes>
      </main>
    </div>
  );
}
