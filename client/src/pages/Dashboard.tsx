import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getDashboardSummary, getDashboardFinancials, getInvoices } from '../api/client';
import type { RoomSummary, Invoice } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function HealthBadge({ health }: { health: string }) {
  if (health === 'good') return <span className="badge-green">Paid up</span>;
  if (health === 'warning') return <span className="badge-yellow">1 gap</span>;
  return <span className="badge-red">Behind</span>;
}

function PaymentDot({ status }: { status: string }) {
  const cls = status === 'paid'
    ? 'bg-emerald-500'
    : status === 'partial'
    ? 'bg-amber-500'
    : status === 'unpaid'
    ? 'bg-red-500'
    : 'bg-slate-700';
  return <span className={`w-3 h-3 rounded-full inline-block ${cls}`} title={status} />;
}

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useQuery<RoomSummary[]>({
    queryKey: ['dashboard-summary'],
    queryFn: getDashboardSummary,
    refetchInterval: 10_000,
  });

  const { data: financials } = useQuery<{
    totals: { total_income: number; total_expenses: number; transaction_count: number };
    byCategory: Array<{ name: string; color: string; type: string; total: number; count: number }>;
    byMonth: Array<{ year: number; month: number; income: number; expenses: number }>;
  }>({
    queryKey: ['dashboard-financials'],
    queryFn: getDashboardFinancials,
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: getInvoices,
  });

  if (loadingSummary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading dashboard...</div>
      </div>
    );
  }

  const needsReview = invoices?.filter(i => i.status === 'review' && i.needs_review_count > 0) ?? [];
  const monthlyData = (financials?.byMonth ?? []).map(m => ({
    name: `${MONTH_NAMES[m.month - 1]} ${m.year}`,
    income: m.income,
    expenses: m.expenses,
    net: m.income - m.expenses,
  }));

  const profit = (financials?.totals.total_income ?? 0) - (financials?.totals.total_expenses ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link to="/upload" className="btn-primary text-sm">+ Upload Invoice</Link>
      </div>

      {/* Review alerts */}
      {needsReview.length > 0 && (
        <div className="card border-amber-800 bg-amber-950/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-amber-400">
                {needsReview.length} invoice{needsReview.length > 1 ? 's' : ''} need review
              </p>
              <p className="text-sm text-slate-400 mt-0.5">
                Some transactions couldn't be automatically categorised — your input is needed.
              </p>
            </div>
            <Link to="/review" className="btn-secondary text-sm shrink-0">Review Now</Link>
          </div>
        </div>
      )}

      {/* Financial headline */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card">
          <p className="text-sm text-slate-400">Total Income</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">
            £{(financials?.totals.total_income ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Total Expenses</p>
          <p className="text-2xl font-bold text-red-400 mt-1">
            £{(financials?.totals.total_expenses ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="card">
          <p className="text-sm text-slate-400">Net Profit</p>
          <p className={`text-2xl font-bold mt-1 ${profit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            £{profit.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Monthly chart */}
      {monthlyData.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4">Monthly Overview</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData} barSize={16}>
              <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `£${v}`} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                formatter={(v: number) => [`£${v.toFixed(2)}`]}
              />
              <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Room status grid */}
      <div>
        <h2 className="font-semibold text-lg mb-3">Room Status</h2>
        {(!summary || summary.length === 0) ? (
          <div className="card text-center py-12">
            <p className="text-slate-400">No rooms configured yet.</p>
            <Link to="/setup" className="btn-secondary mt-4 inline-block text-sm">Set up rooms & tenants</Link>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {summary.map(room => (
              <div key={room.room_id} className="card space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">{room.room_name}</h3>
                    {room.tenant_name ? (
                      <p className="text-sm text-slate-400 mt-0.5">{room.tenant_name}</p>
                    ) : (
                      <p className="text-sm text-slate-600 mt-0.5">No active tenant</p>
                    )}
                  </div>
                  <HealthBadge health={room.payment_health} />
                </div>

                {room.monthly_rent && (
                  <p className="text-sm text-slate-400">
                    Rent: <span className="text-slate-200 font-medium">£{room.monthly_rent}/mo</span>
                  </p>
                )}

                {/* Payment history dots (last 6 months) */}
                {room.payment_expectations.length > 0 && (
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Payment history</p>
                    <div className="flex gap-1.5 flex-wrap">
                      {room.payment_expectations.slice(-6).map((pe, i) => (
                        <div key={i} className="flex flex-col items-center gap-0.5">
                          <PaymentDot status={pe.status} />
                          <span className="text-slate-600 text-[10px]">
                            {MONTH_NAMES[(pe.expected_month ?? 1) - 1]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {room.gaps.length > 0 && (
                  <div className="bg-red-950/30 border border-red-900/50 rounded-lg p-2">
                    <p className="text-xs text-red-400 font-medium">
                      {room.gaps.length} unpaid month{room.gaps.length > 1 ? 's' : ''}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {room.gaps.map(g => `${MONTH_NAMES[(g.expected_month ?? 1) - 1]} ${g.expected_year}`).join(', ')}
                    </p>
                  </div>
                )}

                {room.last_paid && (
                  <p className="text-xs text-slate-500">
                    Last paid: {MONTH_NAMES[parseInt(room.last_paid.split('-')[1]) - 1]} {room.last_paid.split('-')[0]}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Spend by category */}
      {financials?.byCategory && financials.byCategory.length > 0 && (
        <div className="card">
          <h2 className="font-semibold mb-4">Spend by Category</h2>
          <div className="space-y-2">
            {financials.byCategory.filter(c => c.type === 'expense').slice(0, 8).map(cat => {
              const max = Math.max(...financials.byCategory.map(c => c.total));
              const pct = (cat.total / max) * 100;
              return (
                <div key={cat.name} className="flex items-center gap-3">
                  <span className="text-sm w-36 shrink-0 truncate text-slate-300">{cat.name}</span>
                  <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: cat.color }}
                    />
                  </div>
                  <span className="text-sm text-slate-400 w-20 text-right shrink-0">
                    £{cat.total.toLocaleString('en-GB', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent invoices */}
      {invoices && invoices.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">Invoices</h2>
            <Link to="/upload" className="text-sm text-brand-400 hover:text-brand-300">+ Upload</Link>
          </div>
          <div className="space-y-1">
            {invoices.slice(0, 8).map(inv => (
              <div key={inv.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <div>
                  <span className="text-sm font-medium">
                    {inv.month && inv.year ? `${MONTH_NAMES[inv.month - 1]} ${inv.year}` : inv.original_name}
                  </span>
                  <span className="text-xs text-slate-500 ml-2">{inv.original_name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500">{inv.transaction_count} transactions</span>
                  {inv.status === 'review' && inv.needs_review_count > 0 ? (
                    <Link to={`/review/${inv.id}`} className="badge-yellow cursor-pointer hover:opacity-80">
                      Review ({inv.needs_review_count})
                    </Link>
                  ) : inv.status === 'processing' ? (
                    <span className="badge-gray">Processing…</span>
                  ) : (
                    <span className="badge-green">Complete</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
