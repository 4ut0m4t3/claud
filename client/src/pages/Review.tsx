import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getInvoices,
  getInvoiceTransactions,
  updateTransaction,
  completeInvoice,
  getCategories,
  getTenants,
  getRooms,
} from '../api/client';
import type { Invoice, Transaction, Category, Tenant, Room } from '../types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function ConfidencePill({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const cls = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  return <span className={`text-xs font-medium ${cls}`}>{pct}% confident</span>;
}

interface TxCardProps {
  tx: Transaction;
  categories: Category[];
  tenants: Tenant[];
  rooms: Room[];
  onUpdate: (updates: Partial<Transaction> & { user_confirmed?: number; reviewed?: number }) => void;
}

function TxCard({ tx, categories, tenants, rooms, onUpdate }: TxCardProps) {
  const [catId, setCatId] = useState(tx.category_id ?? '');
  const [tenantId, setTenantId] = useState(tx.tenant_id ?? '');
  const [roomId, setRoomId] = useState(tx.room_id ?? '');
  const isLowConf = tx.confidence < 0.8 && !tx.reviewed;

  function handleConfirm() {
    onUpdate({ category_id: catId || undefined, tenant_id: tenantId || undefined, room_id: roomId || undefined, user_confirmed: 1, reviewed: 1 });
  }

  function handleReject() {
    onUpdate({ user_confirmed: 0, reviewed: 1 });
  }

  return (
    <div className={`card space-y-3 ${isLowConf ? 'border-amber-800/60' : tx.reviewed ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{tx.description}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {tx.date && <span className="text-xs text-slate-500">{tx.date}</span>}
            <span className={`text-sm font-semibold ${tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'}`}>
              {tx.type === 'credit' ? '+' : '-'}£{tx.amount.toFixed(2)}
            </span>
          </div>
        </div>
        <ConfidencePill confidence={tx.confidence} />
      </div>

      {tx.ai_reasoning && (
        <div className="bg-slate-800/50 rounded-lg px-3 py-2 text-xs text-slate-400 italic">
          AI: {tx.ai_reasoning}
        </div>
      )}

      {/* Fields */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-slate-500 block mb-1">Category</label>
          <select
            value={catId}
            onChange={e => setCatId(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="">— unknown —</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Tenant</label>
          <select
            value={tenantId}
            onChange={e => { setTenantId(e.target.value); }}
            className="input text-sm py-1.5"
          >
            <option value="">— none —</option>
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-500 block mb-1">Room</label>
          <select
            value={roomId}
            onChange={e => setRoomId(e.target.value)}
            className="input text-sm py-1.5"
          >
            <option value="">— none —</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Actions */}
      {!tx.reviewed ? (
        <div className="flex gap-2">
          <button onClick={handleConfirm} className="btn-primary text-sm py-1.5 flex-1">
            ✓ Confirm
          </button>
          <button onClick={handleReject} className="btn-secondary text-sm py-1.5 flex-1">
            ✗ Incorrect
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${tx.user_confirmed ? 'text-emerald-400' : 'text-red-400'}`}>
            {tx.user_confirmed ? '✓ Confirmed' : '✗ Flagged'}
          </span>
          <button
            onClick={() => onUpdate({ reviewed: 0, user_confirmed: undefined })}
            className="text-xs text-slate-500 hover:text-slate-300 ml-auto"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

export default function Review() {
  const { invoiceId } = useParams<{ invoiceId?: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: getInvoices,
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  const { data: tenants = [] } = useQuery<Tenant[]>({
    queryKey: ['tenants'],
    queryFn: getTenants,
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ['rooms'],
    queryFn: getRooms,
  });

  // Select current invoice — default to first needing review
  const needsReview = invoices.filter(i => i.status === 'review' && i.needs_review_count > 0);
  const selectedId = invoiceId ?? needsReview[0]?.id;
  const selectedInvoice = invoices.find(i => i.id === selectedId);

  const { data: transactions = [], isLoading } = useQuery<Transaction[]>({
    queryKey: ['transactions', selectedId],
    queryFn: () => getInvoiceTransactions(selectedId!),
    enabled: !!selectedId,
  });

  const { mutate: updateTx } = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof updateTransaction>[1] }) =>
      updateTransaction(id, updates),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['transactions', selectedId] });
      qc.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const { mutate: markComplete } = useMutation({
    mutationFn: () => completeInvoice(selectedId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invoices'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      navigate('/');
    },
  });

  const pendingCount = transactions.filter(t => !t.reviewed && t.confidence < 0.8).length;
  const lowConfTxs = transactions.filter(t => !t.reviewed && t.confidence < 0.8);
  const highConfTxs = transactions.filter(t => t.reviewed || t.confidence >= 0.8);

  if (!selectedId) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <p className="text-xl font-semibold">Nothing to review</p>
        <p className="text-slate-400 mt-2">All uploaded invoices have been reviewed.</p>
        <Link to="/upload" className="btn-primary mt-6 inline-block">Upload an Invoice</Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Review Transactions</h1>
          {selectedInvoice && (
            <p className="text-slate-400 text-sm mt-0.5">
              {selectedInvoice.month && selectedInvoice.year
                ? `${MONTH_NAMES[selectedInvoice.month - 1]} ${selectedInvoice.year}`
                : selectedInvoice.original_name}
              {' · '}{transactions.length} transactions
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {pendingCount === 0 && (
            <button onClick={() => markComplete()} className="btn-primary text-sm">
              Mark Complete ✓
            </button>
          )}
        </div>
      </div>

      {/* Invoice switcher */}
      {needsReview.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {needsReview.map(inv => (
            <button
              key={inv.id}
              onClick={() => navigate(`/review/${inv.id}`)}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${
                inv.id === selectedId ? 'bg-brand-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {inv.month && inv.year ? `${MONTH_NAMES[inv.month - 1]} ${inv.year}` : inv.original_name}
              <span className="ml-1.5 text-xs opacity-70">({inv.needs_review_count})</span>
            </button>
          ))}
        </div>
      )}

      {isLoading && <p className="text-slate-400">Loading transactions…</p>}

      {/* Pending review */}
      {lowConfTxs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-amber-400">Needs Your Input</h2>
            <span className="badge-yellow">{lowConfTxs.length}</span>
          </div>
          {lowConfTxs.map(tx => (
            <TxCard
              key={tx.id}
              tx={tx}
              categories={categories}
              tenants={tenants}
              rooms={rooms}
              onUpdate={updates => updateTx({ id: tx.id, updates })}
            />
          ))}
        </div>
      )}

      {pendingCount === 0 && (
        <div className="card bg-emerald-950/30 border-emerald-800 text-emerald-400 text-sm font-medium text-center py-4">
          All transactions reviewed! Click "Mark Complete" to finalise.
        </div>
      )}

      {/* Auto-categorised */}
      {highConfTxs.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer flex items-center gap-2 font-semibold text-slate-400 hover:text-slate-200 select-none py-2">
            <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
            Auto-categorised ({highConfTxs.length})
          </summary>
          <div className="mt-3 space-y-2">
            {highConfTxs.map(tx => (
              <TxCard
                key={tx.id}
                tx={tx}
                categories={categories}
                tenants={tenants}
                rooms={rooms}
                onUpdate={updates => updateTx({ id: tx.id, updates })}
              />
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
