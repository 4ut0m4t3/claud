import { useQuery } from '@tanstack/react-query';
import { getTimeline } from '../api/client';
import type { TimelineData, PaymentExpectation } from '../types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function monthKey(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

type CellStatus = 'paid' | 'unpaid' | 'partial' | 'vacant' | 'pending' | null;

function Cell({ status, tenantName }: { status: CellStatus; tenantName?: string }) {
  const base = 'h-10 rounded flex items-center justify-center text-[10px] font-medium transition-opacity cursor-default';
  if (status === 'paid')
    return <div className={`${base} bg-emerald-800/70 text-emerald-300 border border-emerald-700/50`} title={`${tenantName} – Paid`}>✓</div>;
  if (status === 'partial')
    return <div className={`${base} bg-amber-800/70 text-amber-300 border border-amber-700/50`} title={`${tenantName} – Partial`}>~</div>;
  if (status === 'unpaid')
    return <div className={`${base} bg-red-900/70 text-red-400 border border-red-800/50`} title={`${tenantName} – Unpaid`}>✗</div>;
  if (status === 'pending')
    return <div className={`${base} bg-slate-800/40 text-slate-600 border border-slate-700/40`} title="Pending">?</div>;
  if (status === 'vacant')
    return <div className={`${base} bg-slate-900/20 text-slate-700 border border-dashed border-slate-800/40`} title="Vacant">—</div>;
  return <div className={`${base} bg-slate-900/10`} />;
}

export default function Timeline() {
  const { data, isLoading } = useQuery<TimelineData>({
    queryKey: ['timeline'],
    queryFn: getTimeline,
    refetchInterval: 15_000,
  });

  if (isLoading) {
    return <div className="text-slate-400 text-center py-20">Loading timeline…</div>;
  }

  if (!data || data.rooms.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-xl font-semibold">No data yet</p>
        <p className="text-slate-400 mt-2">Add rooms, tenants, and upload invoices to see the timeline.</p>
      </div>
    );
  }

  const { rooms, tenants, allExpectations, months } = data;

  if (months.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-xl font-semibold">No invoices processed</p>
        <p className="text-slate-400 mt-2">Upload invoices to populate the timeline.</p>
      </div>
    );
  }

  // Build lookup: roomId -> monthKey -> expectation
  const expMap: Record<string, Record<string, PaymentExpectation>> = {};
  for (const exp of allExpectations) {
    if (!expMap[exp.room_id]) expMap[exp.room_id] = {};
    expMap[exp.room_id][monthKey(exp.expected_year, exp.expected_month)] = exp;
  }

  // Build lookup: roomId -> monthKey -> tenant name
  // (who occupied the room that month)
  function getTenantForRoomMonth(roomId: string, year: number, month: number) {
    const key = monthKey(year, month);
    const exp = expMap[roomId]?.[key];
    if (exp) return exp.tenant_name;

    // Fall back to tenants with active dates
    const occupant = tenants.find(t => {
      if (t.room_id !== roomId) return false;
      const start = t.start_date ? new Date(t.start_date) : null;
      const end = t.end_date ? new Date(t.end_date) : null;
      const mDate = new Date(year, month - 1, 15);
      if (start && mDate < start) return false;
      if (end && mDate > end) return false;
      return true;
    });
    return occupant?.name;
  }

  function getCellStatus(roomId: string, year: number, month: number): CellStatus {
    const key = monthKey(year, month);
    const exp = expMap[roomId]?.[key];
    if (exp) return exp.status as CellStatus;
    const tenantName = getTenantForRoomMonth(roomId, year, month);
    if (tenantName) return 'pending';
    return 'vacant';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Timeline</h1>
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-700 inline-block" /> Paid</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-900 inline-block" /> Unpaid</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-800 inline-block" /> Partial</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded border border-dashed border-slate-700 inline-block" /> Vacant</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-800 inline-block" /> Pending</span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" style={{ minWidth: `${120 + months.length * 56}px` }}>
          <thead>
            <tr>
              <th className="text-left font-medium text-slate-400 pr-4 py-2 w-32">Room</th>
              {months.map(m => (
                <th key={monthKey(m.year, m.month)} className="text-center text-xs font-medium text-slate-500 px-1 py-2 w-12">
                  <div>{MONTH_NAMES[m.month - 1]}</div>
                  <div className="text-slate-600">{String(m.year).slice(2)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rooms.map(room => {
              const activeTenant = tenants.find(t => t.room_id === room.id && t.status === 'active');
              return (
                <tr key={room.id} className="border-t border-slate-800">
                  <td className="pr-4 py-2">
                    <div className="font-medium text-slate-200 truncate">{room.name}</div>
                    {activeTenant && (
                      <div className="text-xs text-slate-500 truncate">{activeTenant.name}</div>
                    )}
                    {room.monthly_rent && (
                      <div className="text-xs text-slate-600">£{room.monthly_rent}/mo</div>
                    )}
                  </td>
                  {months.map(m => {
                    const status = getCellStatus(room.id, m.year, m.month);
                    const tenantName = getTenantForRoomMonth(room.id, m.year, m.month);
                    return (
                      <td key={monthKey(m.year, m.month)} className="px-1 py-1.5">
                        <Cell status={status} tenantName={tenantName} />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Tenant occupancy bars */}
      <div>
        <h2 className="font-semibold mb-3">Tenant Occupancy</h2>
        <div className="card overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${120 + months.length * 56}px` }}>
            <thead>
              <tr>
                <th className="text-left font-medium text-slate-400 pr-4 py-2 w-32">Tenant</th>
                {months.map(m => (
                  <th key={monthKey(m.year, m.month)} className="text-center text-xs font-medium text-slate-500 px-1 py-2 w-12">
                    {MONTH_NAMES[m.month - 1]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tenants.map(tenant => (
                <tr key={tenant.id} className="border-t border-slate-800">
                  <td className="pr-4 py-2">
                    <div className="font-medium text-slate-200 truncate">{tenant.name}</div>
                    {tenant.room_name && (
                      <div className="text-xs text-slate-500">{tenant.room_name}</div>
                    )}
                    <span className={`text-xs ${
                      tenant.status === 'active' ? 'text-emerald-500' : tenant.status === 'left' ? 'text-red-500' : 'text-slate-500'
                    }`}>
                      {tenant.status}
                    </span>
                  </td>
                  {months.map(m => {
                    // Was this tenant in a room this month?
                    const mDate = new Date(m.year, m.month - 1, 15);
                    const start = tenant.start_date ? new Date(tenant.start_date) : null;
                    const end = tenant.end_date ? new Date(tenant.end_date) : null;
                    const inResidence = (!start || mDate >= start) && (!end || mDate <= end);

                    if (!inResidence) {
                      return <td key={monthKey(m.year, m.month)} className="px-1 py-1.5"><div className="h-10 rounded bg-slate-900/10" /></td>;
                    }

                    // Find payment status for this tenant/month
                    const exp = allExpectations.find(e =>
                      e.tenant_id === tenant.id &&
                      e.expected_month === m.month &&
                      e.expected_year === m.year
                    );
                    const status: CellStatus = exp ? (exp.status as CellStatus) : 'pending';
                    return (
                      <td key={monthKey(m.year, m.month)} className="px-1 py-1.5">
                        <Cell status={status} tenantName={tenant.name} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
