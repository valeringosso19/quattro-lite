-- ============================================================
-- QUATTRO LITE - Supabase Şema
-- Sırayla çalıştır: Supabase Dashboard > SQL Editor > New Query
-- ============================================================

create extension if not exists pgcrypto;

-- 1. MÜŞTERİLER
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  tc_vkn text,
  phone text not null,
  email text,
  city text,
  customer_type text default 'bireysel', -- bireysel | kurumsal
  birth_date date,
  notes text,
  created_at timestamptz default now()
);

-- Zaten var olan bir veritabanını güncellemek için (idempotent):
alter table customers add column if not exists birth_date date;

-- 2. POLİÇELER
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  company_name text,            -- sigorta şirketi (Anadolu, Allianz, vs.)
  branch text,                  -- Kasko, Trafik, DASK, Konut, Sağlık...
  policy_no text,
  plate text,                   -- araç branşlarında plaka
  start_date date,
  end_date date not null,
  gross_premium numeric default 0,
  commission_rate numeric default 0,   -- yüzde
  status text default 'aktif',  -- aktif | iptal | yenilendi | süresi geçti
  created_at timestamptz default now()
);

-- 3. CARİ HAREKETLER
create table if not exists cari_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers(id) on delete cascade,
  policy_id uuid references policies(id) on delete set null,
  type text not null,           -- borc | alacak
  amount numeric not null,
  description text,
  transaction_date date default current_date,
  created_at timestamptz default now()
);

-- 4. TAKSİTLER
create table if not exists installments (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid references policies(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  installment_no int default 1,
  due_date date not null,
  amount numeric not null,
  paid boolean default false,
  paid_date date,
  created_at timestamptz default now()
);

-- ============================================================
-- RLS: Giriş yapmış (authenticated) her kullanıcı tüm kayıtları
-- okuyup yazabilir. Tek acente / tek ekip senaryosu için yeterli.
-- Not: Bu tabloyu dışarıya (anon) KAPALI tutuyoruz — sadece login
-- olmuş kullanıcılar erişebilir. Supabase Auth ile kullanıcı
-- ekleyip ekip üyelerine giriş açman gerekiyor.
-- ============================================================

alter table customers enable row level security;
alter table policies enable row level security;
alter table cari_transactions enable row level security;
alter table installments enable row level security;

create policy "authenticated_all_customers" on customers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_all_policies" on policies
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_all_cari" on cari_transactions
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated_all_installments" on installments
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- Faydalı indexler
-- ============================================================
create index if not exists idx_policies_customer on policies(customer_id);
create index if not exists idx_policies_end_date on policies(end_date);
create index if not exists idx_cari_customer on cari_transactions(customer_id);
create index if not exists idx_installments_customer on installments(customer_id);
create index if not exists idx_installments_due on installments(due_date) where paid = false;
