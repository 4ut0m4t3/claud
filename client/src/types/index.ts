export interface Room {
  id: string;
  name: string;
  description?: string;
  monthly_rent?: number;
  active_tenants: number;
  current_tenant_name?: string;
  current_tenant_id?: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  name: string;
  room_id?: string;
  room_name?: string;
  monthly_rent?: number;
  start_date?: string;
  end_date?: string;
  status: 'active' | 'left' | 'unknown';
  notes?: string;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  type: 'income' | 'expense' | 'transfer';
}

export interface Invoice {
  id: string;
  filename: string;
  original_name: string;
  month?: number;
  year?: number;
  status: 'processing' | 'review' | 'complete';
  transaction_count: number;
  needs_review_count: number;
  uploaded_at: string;
}

export interface Transaction {
  id: string;
  invoice_id: string;
  date?: string;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  category_id?: string;
  category_name?: string;
  category_color?: string;
  tenant_id?: string;
  tenant_name?: string;
  room_id?: string;
  room_name?: string;
  confidence: number;
  ai_reasoning?: string;
  reviewed: number;
  user_confirmed?: number;
  created_at: string;
}

export interface PaymentExpectation {
  id: string;
  tenant_id: string;
  tenant_name: string;
  room_id: string;
  expected_month: number;
  expected_year: number;
  transaction_id?: string;
  status: 'paid' | 'unpaid' | 'partial' | 'pending';
  notes?: string;
}

export interface RoomSummary {
  room_id: string;
  room_name: string;
  monthly_rent?: number;
  tenant_id?: string;
  tenant_name?: string;
  tenant_status?: string;
  payment_expectations: PaymentExpectation[];
  gaps: PaymentExpectation[];
  last_paid?: string;
  payment_health: 'good' | 'warning' | 'critical';
}

export interface TimelineData {
  rooms: Room[];
  tenants: Tenant[];
  allExpectations: PaymentExpectation[];
  months: { year: number; month: number }[];
}

export interface TenantStatusSuggestion {
  tenant_name: string;
  room_name: string;
  missing_months: string[];
  suggestion: 'behind' | 'left' | 'unknown';
  reasoning: string;
  confidence: number;
}
