import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

// Rooms
export const getRooms = () => api.get('/rooms').then(r => r.data);
export const createRoom = (data: { name: string; description?: string; monthly_rent?: number }) =>
  api.post('/rooms', data).then(r => r.data);
export const updateRoom = (id: string, data: { name: string; description?: string; monthly_rent?: number }) =>
  api.put(`/rooms/${id}`, data).then(r => r.data);
export const deleteRoom = (id: string) => api.delete(`/rooms/${id}`).then(r => r.data);

// Tenants
export const getTenants = () => api.get('/tenants').then(r => r.data);
export const createTenant = (data: object) => api.post('/tenants', data).then(r => r.data);
export const updateTenant = (id: string, data: object) => api.put(`/tenants/${id}`, data).then(r => r.data);
export const deleteTenant = (id: string) => api.delete(`/tenants/${id}`).then(r => r.data);
export const getTenantStatusSuggestion = (id: string) =>
  api.get(`/tenants/${id}/status-suggestion`).then(r => r.data);

// Invoices
export const getInvoices = () => api.get('/invoices').then(r => r.data);
export const getInvoice = (id: string) => api.get(`/invoices/${id}`).then(r => r.data);
export const getInvoiceTransactions = (id: string) => api.get(`/invoices/${id}/transactions`).then(r => r.data);
export const completeInvoice = (id: string) => api.post(`/invoices/${id}/complete`).then(r => r.data);
export const deleteInvoice = (id: string) => api.delete(`/invoices/${id}`).then(r => r.data);

export const uploadInvoice = (file: File) => {
  const form = new FormData();
  form.append('pdf', file);
  return api.post('/invoices/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }).then(r => r.data);
};

export const updateTransaction = (txId: string, data: {
  category_id?: string;
  tenant_id?: string;
  room_id?: string;
  user_confirmed?: number;
  reviewed?: number;
}) => api.patch(`/invoices/transactions/${txId}`, data).then(r => r.data);

// Dashboard
export const getDashboardSummary = () => api.get('/dashboard/summary').then(r => r.data);
export const getDashboardFinancials = () => api.get('/dashboard/financials').then(r => r.data);
export const getTimeline = () => api.get('/dashboard/timeline').then(r => r.data);
export const getCategories = () => api.get('/dashboard/categories').then(r => r.data);
