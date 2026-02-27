import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadInvoice, getInvoices, deleteInvoice } from '../api/client';
import type { Invoice } from '../types';

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function StatusBadge({ status, needs_review_count }: { status: string; needs_review_count: number }) {
  if (status === 'processing') return <span className="badge-gray">Processing…</span>;
  if (status === 'review' && needs_review_count > 0)
    return <span className="badge-yellow">Needs Review ({needs_review_count})</span>;
  return <span className="badge-green">Complete</span>;
}

export default function Upload() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ['invoices'],
    queryFn: getInvoices,
    refetchInterval: 3000,
  });

  async function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.');
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await uploadInvoice(file);
      await qc.invalidateQueries({ queryKey: ['invoices'] });
    } catch (err) {
      setUploadError('Upload failed. Check the server is running.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  async function handleDelete(id: string) {
    await deleteInvoice(id);
    qc.invalidateQueries({ queryKey: ['invoices'] });
    qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Upload Invoice</h1>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-brand-500 bg-brand-900/20'
            : 'border-slate-700 hover:border-slate-500 hover:bg-slate-900/50'
        }`}
      >
        <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
        <div className="text-4xl mb-3">📄</div>
        <p className="font-medium text-slate-200">
          {uploading ? 'Uploading and processing…' : 'Drop a PDF here or click to browse'}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Bank statements, HMO invoices — Claude will extract and categorise everything
        </p>
        {uploading && (
          <div className="mt-4 flex justify-center">
            <div className="w-48 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 rounded-full animate-pulse w-3/4" />
            </div>
          </div>
        )}
      </div>

      {uploadError && (
        <div className="card border-red-900 bg-red-950/30 text-red-400 text-sm">{uploadError}</div>
      )}

      <div className="card bg-slate-900/50 text-sm text-slate-400 space-y-1.5">
        <p className="font-medium text-slate-300">How it works</p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Upload your monthly bank statement or invoice as a PDF</li>
          <li>Claude AI reads and extracts all transactions automatically</li>
          <li>High-confidence items are categorised straight away</li>
          <li>Ambiguous transactions are flagged for your quick yes/no review</li>
          <li>Dashboard and timeline update with payment status per room</li>
        </ol>
      </div>

      {/* Invoice list — oldest to newest */}
      {invoices.length > 0 && (
        <div>
          <h2 className="font-semibold text-lg mb-3">All Invoices <span className="text-slate-500 text-sm font-normal">(oldest first)</span></h2>
          <div className="space-y-2">
            {invoices.map(inv => (
              <div key={inv.id} className="card flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">
                    {inv.month && inv.year
                      ? `${MONTH_NAMES[inv.month - 1]} ${inv.year}`
                      : 'Unknown period'}
                  </p>
                  <p className="text-sm text-slate-500 truncate">{inv.original_name}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm text-slate-500">{inv.transaction_count} txns</span>
                  <StatusBadge status={inv.status} needs_review_count={inv.needs_review_count} />
                  {inv.status === 'review' && inv.needs_review_count > 0 && (
                    <button
                      onClick={() => navigate(`/review/${inv.id}`)}
                      className="btn-secondary text-xs py-1 px-2"
                    >
                      Review
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(inv.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors text-sm px-1"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
