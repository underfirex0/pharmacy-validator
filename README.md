# Pharmacy Geo Validator

A web app to validate and correct pharmacy coordinates using Google Places API.

## Stack
- **Frontend**: React
- **Database + Auth**: Supabase (Postgres + Auth)
- **Hosting**: Vercel
- **API**: Google Places API (New)

---

## Setup

### 1. Supabase

1. Create project at supabase.com
2. Run this SQL in the SQL Editor:

```sql
create table pharmacies (
  id uuid default gen_random_uuid() primary key,
  code_firme text not null,
  raison_sociale text,
  ville text,
  telephone text,
  old_x float,
  old_y float,
  new_x float,
  new_y float,
  gap_km float,
  maps_phone text,
  phone_diff boolean,
  maps_name text,
  maps_address text,
  status text default 'pending',
  score int,
  notes text,
  imported_at timestamptz default now(),
  validated_at timestamptz,
  created_by uuid references auth.users(id),
  unique(code_firme, created_by)
);

alter table pharmacies enable row level security;

create policy "Users manage own pharmacies"
on pharmacies for all
using (auth.uid() = created_by)
with check (auth.uid() = created_by);
```

3. Go to Project Settings → API → copy URL and anon key

### 2. Local development

```bash
cp .env.example .env
# Fill in your Supabase URL and anon key in .env
npm install
# Start CORS proxy in separate terminal:
node cors-proxy/server.js
# Start app:
npm start
```

### 3. Deploy to Vercel

1. Push to GitHub
2. Import repo at vercel.com
3. Add environment variables:
   - `REACT_APP_SUPABASE_URL`
   - `REACT_APP_SUPABASE_ANON_KEY`
4. Deploy — done!

No CORS proxy needed in production (uses `/api/places` serverless function).

---

## Features
- Email/password authentication
- Import CSV (French Excel semicolons and UTF-8 both supported)
- Validate coordinates via Google Places API
- Scoring: phone match (50pts) + name similarity (30pts) + proximity (20pts)
- Export filtered results as CSV or Excel (.xlsx)
- Per-user data isolation via Supabase RLS
