import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  getRooms, createRoom, updateRoom, deleteRoom,
  getTenants, createTenant, updateTenant, deleteTenant,
  getTenantStatusSuggestion,
} from '../api/client';
import type { Room, Tenant, TenantStatusSuggestion } from '../types';

// ── Room Form ──────────────────────────────────────────────────────────────────
function RoomForm({ initial, onSave, onCancel }: {
  initial?: Partial<Room>;
  onSave: (data: { name: string; description?: string; monthly_rent?: number }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [desc, setDesc] = useState(initial?.description ?? '');
  const [rent, setRent] = useState(initial?.monthly_rent?.toString() ?? '');

  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-1">
          <label className="text-xs text-slate-400 block mb-1">Room Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Room 1" />
        </div>
        <div className="col-span-1">
          <label className="text-xs text-slate-400 block mb-1">Description</label>
          <input className="input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Ground floor double" />
        </div>
        <div className="col-span-1">
          <label className="text-xs text-slate-400 block mb-1">Monthly Rent (£)</label>
          <input className="input" type="number" value={rent} onChange={e => setRent(e.target.value)} placeholder="650" />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onSave({ name, description: desc || undefined, monthly_rent: rent ? parseFloat(rent) : undefined })} disabled={!name} className="btn-primary text-sm">Save</button>
        <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );
}

// ── Tenant Form ────────────────────────────────────────────────────────────────
function TenantForm({ initial, rooms, onSave, onCancel }: {
  initial?: Partial<Tenant>;
  rooms: Room[];
  onSave: (data: object) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [roomId, setRoomId] = useState(initial?.room_id ?? '');
  const [start, setStart] = useState(initial?.start_date ?? '');
  const [end, setEnd] = useState(initial?.end_date ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'active');
  const [notes, setNotes] = useState(initial?.notes ?? '');

  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-slate-400 block mb-1">Tenant Name *</label>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. John Smith" />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Room</label>
          <select className="input" value={roomId} onChange={e => setRoomId(e.target.value)}>
            <option value="">— no room —</option>
            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Move-in Date</label>
          <input className="input" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Move-out Date</label>
          <input className="input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Status</label>
          <select className="input" value={status} onChange={e => setStatus(e.target.value as 'active' | 'left' | 'unknown')}>
            <option value="active">Active</option>
            <option value="left">Left</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 block mb-1">Notes</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => onSave({ name, room_id: roomId || undefined, start_date: start || undefined, end_date: end || undefined, status, notes: notes || undefined })}
          disabled={!name}
          className="btn-primary text-sm"
        >
          Save
        </button>
        <button onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
      </div>
    </div>
  );
}

// ── AI Suggestion Modal ────────────────────────────────────────────────────────
function StatusSuggestionModal({ tenantId, onClose, onApply }: {
  tenantId: string;
  onClose: () => void;
  onApply: (status: 'active' | 'left' | 'unknown') => void;
}) {
  const { data, isLoading } = useQuery<TenantStatusSuggestion>({
    queryKey: ['status-suggestion', tenantId],
    queryFn: () => getTenantStatusSuggestion(tenantId),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="card max-w-md w-full space-y-4">
        <h3 className="font-semibold text-lg">AI Status Suggestion</h3>
        {isLoading ? (
          <p className="text-slate-400">Analysing payment history…</p>
        ) : data ? (
          <>
            <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{data.tenant_name}</span>
                <span className={`badge-${data.suggestion === 'behind' ? 'yellow' : data.suggestion === 'left' ? 'red' : 'gray'}`}>
                  {data.suggestion === 'behind' ? 'Likely behind' : data.suggestion === 'left' ? 'Likely left' : 'Unknown'}
                </span>
                <span className="text-xs text-slate-500 ml-auto">{Math.round(data.confidence * 100)}% conf</span>
              </div>
              <p className="text-sm text-slate-300">{data.reasoning}</p>
              {data.missing_months.length > 0 && (
                <p className="text-xs text-slate-500">Missing: {data.missing_months.join(', ')}</p>
              )}
            </div>
            <div className="flex gap-2">
              {data.suggestion !== 'unknown' && (
                <button
                  onClick={() => {
                    onApply(data.suggestion === 'behind' ? 'active' : 'left');
                    onClose();
                  }}
                  className="btn-primary text-sm"
                >
                  Yes, mark as {data.suggestion === 'behind' ? 'active (behind)' : 'left'}
                </button>
              )}
              <button onClick={onClose} className="btn-secondary text-sm">Dismiss</button>
            </div>
          </>
        ) : (
          <p className="text-red-400">Could not load suggestion</p>
        )}
      </div>
    </div>
  );
}

// ── Main Setup Page ────────────────────────────────────────────────────────────
export default function Setup() {
  const qc = useQueryClient();
  const [addingRoom, setAddingRoom] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [addingTenant, setAddingTenant] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [suggestionFor, setSuggestionFor] = useState<string | null>(null);

  const { data: rooms = [] } = useQuery<Room[]>({ queryKey: ['rooms'], queryFn: getRooms });
  const { data: tenants = [] } = useQuery<Tenant[]>({ queryKey: ['tenants'], queryFn: getTenants });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['rooms'] });
    qc.invalidateQueries({ queryKey: ['tenants'] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
  };

  const { mutate: saveRoom } = useMutation({
    mutationFn: (data: { id?: string; name: string; description?: string; monthly_rent?: number }) =>
      data.id ? updateRoom(data.id, data) : createRoom(data),
    onSuccess: () => { invalidate(); setAddingRoom(false); setEditingRoom(null); },
  });

  const { mutate: removeRoom } = useMutation({
    mutationFn: deleteRoom,
    onSuccess: invalidate,
  });

  const { mutate: saveTenant } = useMutation({
    mutationFn: (data: Partial<Tenant> & { id?: string }) =>
      data.id ? updateTenant(data.id, data) : createTenant(data),
    onSuccess: () => { invalidate(); setAddingTenant(false); setEditingTenant(null); },
  });

  const { mutate: removeTenant } = useMutation({
    mutationFn: deleteTenant,
    onSuccess: invalidate,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold">Setup</h1>

      {/* Rooms */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rooms</h2>
          <button onClick={() => setAddingRoom(true)} className="btn-secondary text-sm">+ Add Room</button>
        </div>

        {addingRoom && (
          <RoomForm
            onSave={data => saveRoom(data)}
            onCancel={() => setAddingRoom(false)}
          />
        )}

        {rooms.length === 0 && !addingRoom && (
          <p className="text-slate-500 text-sm">No rooms yet. Add your HMO rooms to get started.</p>
        )}

        <div className="space-y-2">
          {rooms.map(room => (
            editingRoom?.id === room.id ? (
              <RoomForm
                key={room.id}
                initial={room}
                onSave={data => saveRoom({ ...data, id: room.id })}
                onCancel={() => setEditingRoom(null)}
              />
            ) : (
              <div key={room.id} className="card flex items-center justify-between gap-4">
                <div>
                  <span className="font-medium">{room.name}</span>
                  {room.description && <span className="text-slate-500 text-sm ml-2">{room.description}</span>}
                  {room.monthly_rent && <span className="text-slate-400 text-sm ml-2">£{room.monthly_rent}/mo</span>}
                  {room.current_tenant_name && (
                    <span className="text-emerald-500 text-xs ml-2">↳ {room.current_tenant_name}</span>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setEditingRoom(room)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1">Edit</button>
                  <button onClick={() => removeRoom(room.id)} className="text-xs text-red-500 hover:text-red-400 px-2 py-1">Delete</button>
                </div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* Tenants */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tenants</h2>
          <button onClick={() => setAddingTenant(true)} className="btn-secondary text-sm">+ Add Tenant</button>
        </div>

        {addingTenant && (
          <TenantForm
            rooms={rooms}
            onSave={data => saveTenant(data)}
            onCancel={() => setAddingTenant(false)}
          />
        )}

        {tenants.length === 0 && !addingTenant && (
          <p className="text-slate-500 text-sm">No tenants yet.</p>
        )}

        <div className="space-y-2">
          {tenants.map(tenant => (
            editingTenant?.id === tenant.id ? (
              <TenantForm
                key={tenant.id}
                initial={tenant}
                rooms={rooms}
                onSave={data => saveTenant({ ...data, id: tenant.id })}
                onCancel={() => setEditingTenant(null)}
              />
            ) : (
              <div key={tenant.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{tenant.name}</span>
                    <span className={`text-xs ${
                      tenant.status === 'active' ? 'text-emerald-400' :
                      tenant.status === 'left' ? 'text-red-400' : 'text-slate-500'
                    }`}>{tenant.status}</span>
                    {tenant.room_name && <span className="text-slate-500 text-xs">→ {tenant.room_name}</span>}
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    {tenant.start_date && <span className="text-xs text-slate-500">From: {tenant.start_date}</span>}
                    {tenant.end_date && <span className="text-xs text-slate-500">To: {tenant.end_date}</span>}
                    {tenant.notes && <span className="text-xs text-slate-600 italic truncate">{tenant.notes}</span>}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => setSuggestionFor(tenant.id)}
                    className="text-xs text-brand-400 hover:text-brand-300 px-2 py-1"
                    title="Get AI status suggestion"
                  >
                    AI Status
                  </button>
                  <button onClick={() => setEditingTenant(tenant)} className="text-xs text-slate-400 hover:text-slate-200 px-2 py-1">Edit</button>
                  <button onClick={() => removeTenant(tenant.id)} className="text-xs text-red-500 hover:text-red-400 px-2 py-1">Delete</button>
                </div>
              </div>
            )
          ))}
        </div>
      </section>

      {/* AI suggestion modal */}
      {suggestionFor && (
        <StatusSuggestionModal
          tenantId={suggestionFor}
          onClose={() => setSuggestionFor(null)}
          onApply={(status) => {
            saveTenant({ id: suggestionFor, status, name: tenants.find(t => t.id === suggestionFor)?.name ?? '' });
            setSuggestionFor(null);
          }}
        />
      )}
    </div>
  );
}
