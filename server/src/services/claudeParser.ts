import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface ParsedTransaction {
  date: string | null;
  description: string;
  amount: number;
  type: 'credit' | 'debit';
  suggested_category: string;
  suggested_tenant_name: string | null;
  suggested_room_name: string | null;
  confidence: number;
  ai_reasoning: string;
  is_rent_payment: boolean;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  detected_month: number | null;
  detected_year: number | null;
  summary: string;
}

interface KnownTenant { name: string; room: string }
interface KnownRoom { name: string }

export async function parseInvoiceWithClaude(
  rawText: string,
  knownTenants: KnownTenant[],
  knownRooms: KnownRoom[]
): Promise<ParseResult> {
  const tenantContext = knownTenants.length > 0
    ? `Known tenants: ${knownTenants.map(t => `${t.name} (${t.room})`).join(', ')}`
    : 'No tenants configured yet.';

  const roomContext = knownRooms.length > 0
    ? `Known rooms: ${knownRooms.map(r => r.name).join(', ')}`
    : 'No rooms configured yet.';

  const prompt = `You are an expert at parsing HMO (House in Multiple Occupation) property bank statements and invoices.

${tenantContext}
${roomContext}

Analyse the following bank statement / invoice text and extract ALL transactions. For each transaction:
1. Identify if it is a RENT PAYMENT (credit from a tenant) or a PROPERTY EXPENSE (debit)
2. For rent payments: try to match the payer to a known tenant. If unknown, flag it.
3. For expenses: categorise into one of: Rent Payment, Utilities, Maintenance & Repairs, Insurance, Mortgage, Council Tax, Cleaning, Agent Fees, Deposit, Transfer, Other
4. Give a confidence score (0.0-1.0): 1.0 = certain, <0.7 = needs user review
5. Explain your reasoning briefly

Categories for expenses:
- Utilities: gas, electric, water, internet, TV licence
- Maintenance & Repairs: plumber, electrician, repairs, fixtures
- Insurance: building insurance, landlord insurance
- Mortgage: mortgage payment, loan
- Council Tax: council tax
- Cleaning: cleaning service
- Agent Fees: management fees, letting agent
- Deposit: tenant deposit in/out
- Transfer: internal bank transfer
- Other: anything that doesn't fit

Return a JSON object with this exact structure:
{
  "transactions": [
    {
      "date": "YYYY-MM-DD or null",
      "description": "original description from statement",
      "amount": 123.45,
      "type": "credit" or "debit",
      "suggested_category": "category name",
      "suggested_tenant_name": "tenant name or null",
      "suggested_room_name": "room name or null",
      "confidence": 0.95,
      "ai_reasoning": "brief explanation",
      "is_rent_payment": true or false
    }
  ],
  "detected_month": 1-12 or null,
  "detected_year": 2024 or null,
  "summary": "brief summary of statement period and key figures"
}

STATEMENT TEXT:
---
${rawText}
---

Return ONLY the JSON object, no other text.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  // Strip markdown code blocks if present
  let jsonText = content.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonText) as ParseResult;
}

export interface TenantStatusSuggestion {
  tenant_name: string;
  room_name: string;
  missing_months: string[];
  suggestion: 'behind' | 'left' | 'unknown';
  reasoning: string;
  confidence: number;
}

export async function suggestTenantStatus(
  tenantName: string,
  roomName: string,
  paymentHistory: { month: number; year: number; paid: boolean; amount?: number }[]
): Promise<TenantStatusSuggestion> {
  const history = paymentHistory
    .map(p => `${p.year}-${String(p.month).padStart(2, '0')}: ${p.paid ? `PAID £${p.amount}` : 'NOT PAID'}`)
    .join('\n');

  const prompt = `A tenant named "${tenantName}" in room "${roomName}" has the following payment history:

${history}

Based on this pattern, what is the most likely situation?
Options:
- "behind": tenant is still there but hasn't paid (needs chasing)
- "left": tenant has likely vacated the room
- "unknown": not enough information

Return JSON only:
{
  "tenant_name": "${tenantName}",
  "room_name": "${roomName}",
  "missing_months": ["YYYY-MM", ...],
  "suggestion": "behind" or "left" or "unknown",
  "reasoning": "brief explanation",
  "confidence": 0.0-1.0
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type');

  let jsonText = content.text.trim();
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
  }

  return JSON.parse(jsonText) as TenantStatusSuggestion;
}
