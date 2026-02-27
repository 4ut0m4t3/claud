# HMO Invoice Tracker

An intelligent tool for tracking HMO (House in Multiple Occupation) property finances. Upload monthly bank statements as PDFs — Claude AI extracts, categorises, and links transactions to tenants and rooms automatically.

## Features

- **PDF Upload** — drop in a bank statement or invoice PDF
- **AI Extraction** — Claude reads and parses all transactions
- **Smart Categorisation** — rent payments, utilities, maintenance, insurance etc.
- **Review Mode** — ambiguous items flagged for quick yes/no approval
- **Payment Dashboard** — per-room payment health (paid / behind / gaps)
- **Timeline View** — visual grid of occupancy and payment status across months
- **Tenant Status AI** — Claude suggests whether a non-paying tenant is "behind" or has left
- **Oldest-first processing** — invoices sorted chronologically

## Quick Start

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com)

### Setup

```bash
# Install all dependencies
npm run install:all

# Configure the server
cp server/.env.example server/.env
# Edit server/.env and add your ANTHROPIC_API_KEY

# Run in development (starts both server on :3001 and client on :5173)
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### First Steps

1. Go to **Setup** → add your rooms (Room 1, Room 2, etc.) with monthly rent
2. Add your tenants, assigning them to rooms with move-in dates
3. Go to **Upload** → drag in a PDF bank statement
4. Watch Claude process it — green tick means auto-categorised, amber means needs review
5. Visit **Review** to confirm any ambiguous transactions
6. Check the **Dashboard** for payment health and the **Timeline** for history

## Architecture

```
/
├── server/          Node.js + Express + SQLite
│   └── src/
│       ├── db/      SQLite schema (rooms, tenants, transactions, invoices)
│       ├── routes/  REST API (rooms, tenants, invoices, dashboard)
│       └── services/ PDF extraction + Claude AI parsing
└── client/          React + TypeScript + Vite + Tailwind
    └── src/
        ├── pages/   Dashboard, Upload, Review, Timeline, Setup
        ├── api/     Axios API client
        └── types/   Shared TypeScript types
```

## Environment Variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key (required) |
| `PORT` | Server port (default: 3001) |
| `CLIENT_URL` | Client URL for CORS (default: http://localhost:5173) |
