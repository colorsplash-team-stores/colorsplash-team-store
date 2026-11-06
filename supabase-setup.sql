-- ColorSplash Team Store: database setup (v1)
-- Paste this whole file into Supabase > SQL Editor > New query, then click Run.

create extension if not exists pgcrypto;

-- ---------- Admins ----------
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- Ryan becomes an admin automatically when he first signs in to the store admin.
create or replace function public.handle_new_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if lower(new.email) = 'ryanseybold@gmail.com' then
    insert into public.admins(user_id, email) values (new.id, new.email) on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_admin on auth.users;
create trigger on_auth_user_created_admin after insert on auth.users
  for each row execute function public.handle_new_admin();

insert into public.admins(user_id, email)
  select id, email from auth.users where lower(email) = 'ryanseybold@gmail.com'
  on conflict do nothing;

-- ---------- Stores ----------
create table if not exists public.stores (
  id text primary key default ('s-' || substr(md5(gen_random_uuid()::text), 1, 8)),
  slug text unique not null,
  name text not null,
  season text not null default '',
  color text not null default '#1d3557',
  color2 text not null default '#e8b33a',
  logo_url text,
  wordmark_url text,
  opens date not null,
  closes date not null,
  pay_mode text not null default 'online' check (pay_mode in ('online', 'coach')),
  pay_link text not null default '',
  fundraiser_pct numeric(5,2) not null default 0 check (fundraiser_pct between 0 and 50),
  pickup boolean not null default true,
  pickup_note text not null default 'Pick up at 2403 Santa Fe Drive',
  ship boolean not null default false,
  ship_fee numeric(8,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  check (closes >= opens),
  check (pickup or ship)
);

-- ---------- Products (what parents see) ----------
create table if not exists public.products (
  id text primary key default ('p-' || substr(md5(gen_random_uuid()::text), 1, 8)),
  store_id text not null references public.stores(id) on delete cascade,
  sort int not null default 0,
  name text not null,
  kind text not null default 'tee' check (kind in ('tee', 'jersey', 'hoodie', 'shorts', 'hat')),
  price numeric(8,2) not null check (price >= 0),
  description text not null default '',
  youth boolean not null default true,
  adult boolean not null default true,
  personalize boolean not null default false,
  name_fee numeric(8,2) not null default 0,
  number_fee numeric(8,2) not null default 0,
  garment_color text not null default 'team',
  front_art text not null default 'logo',
  photo_url text,
  check (youth or adult)
);
create index if not exists products_store_idx on public.products(store_id, sort);

-- ---------- Supplier info (admin only: style, color, your cost) ----------
create table if not exists public.product_supply (
  product_id text primary key references public.products(id) on delete cascade,
  supplier text not null default 'sanmar' check (supplier in ('sanmar', 'champro', 'other')),
  supplier_name text not null default '',
  style text not null default '',
  color text not null default '',
  cost numeric(8,2)
);

-- ---------- Orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  store_id text not null references public.stores(id),
  parent text not null,
  email text not null,
  phone text not null default '',
  player text not null,
  fulfillment text not null check (fulfillment in ('pickup', 'ship')),
  address text not null default '',
  subtotal numeric(10,2) not null,
  ship numeric(8,2) not null default 0,
  total numeric(10,2) not null,
  fundraiser numeric(10,2) not null default 0,
  pay_mode text not null,
  paid boolean not null default false,
  payment_ref text,
  status text not null default 'new' check (status in ('new', 'printed', 'ready', 'delivered', 'canceled')),
  created_at timestamptz not null default now()
);
create index if not exists orders_store_idx on public.orders(store_id, created_at desc);

create table if not exists public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id text references public.products(id) on delete set null,
  name text not null,
  size text not null,
  qty int not null check (qty between 1 and 20),
  pname text not null default '',
  pnum text not null default '',
  unit numeric(8,2) not null,
  base numeric(8,2) not null
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ---------- Security: who can see and change what ----------
alter table public.admins enable row level security;
alter table public.stores enable row level security;
alter table public.products enable row level security;
alter table public.product_supply enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

create policy "anyone reads live stores" on public.stores
  for select to anon, authenticated using (not archived or public.is_admin());
create policy "admins manage stores" on public.stores
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "anyone reads live products" on public.products
  for select to anon, authenticated using (
    exists (select 1 from public.stores s where s.id = store_id and (not s.archived or public.is_admin())));
create policy "admins manage products" on public.products
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage supply" on public.product_supply
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "admins manage orders" on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admins manage order items" on public.order_items
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated;
grant select on public.stores, public.products to anon;
grant select, insert, update, delete on public.stores, public.products, public.product_supply,
  public.orders, public.order_items to authenticated;
grant select on public.admins to authenticated;
revoke all on public.product_supply, public.orders, public.order_items, public.admins from anon;

-- ---------- Placing an order (prices are always worked out here, never trusted from the browser) ----------
create or replace function public.place_order(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st public.stores;
  pr public.products;
  it jsonb;
  v_order uuid;
  v_code text;
  v_sub numeric := 0;
  v_fund numeric := 0;
  v_ship numeric := 0;
  v_qty int;
  v_size text;
  v_pname text;
  v_pnum text;
  v_unit numeric;
  v_ful text := coalesce(p->>'fulfillment', 'pickup');
  v_today date := (now() at time zone 'America/Denver')::date;
  v_youth text[] := array['YXS','YS','YM','YL','YXL'];
  v_adult text[] := array['AS','AM','AL','AXL','A2XL','A3XL'];
  v_lines jsonb := '[]'::jsonb;
begin
  select * into st from public.stores where id = p->>'store_id' and not archived;
  if not found then raise exception 'store_not_found'; end if;
  if v_today < st.opens or v_today > st.closes then raise exception 'store_closed'; end if;
  if coalesce(trim(p->>'parent'), '') = '' or coalesce(trim(p->>'player'), '') = '' then
    raise exception 'missing_name';
  end if;
  if coalesce(p->>'email', '') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'bad_email';
  end if;
  if v_ful not in ('pickup', 'ship') or (v_ful = 'pickup' and not st.pickup) or (v_ful = 'ship' and not st.ship) then
    raise exception 'bad_fulfillment';
  end if;
  if v_ful = 'ship' and coalesce(trim(p->>'address'), '') = '' then raise exception 'missing_address'; end if;
  if jsonb_typeof(p->'items') is distinct from 'array' or jsonb_array_length(p->'items') not between 1 and 50 then
    raise exception 'bad_items';
  end if;

  for it in select * from jsonb_array_elements(p->'items') loop
    select * into pr from public.products where id = it->>'product_id' and store_id = st.id;
    if not found then raise exception 'bad_product'; end if;
    v_qty := coalesce((it->>'qty')::int, 0);
    if v_qty not between 1 and 20 then raise exception 'bad_qty'; end if;
    v_size := it->>'size';
    if not ((pr.youth and v_size = any(v_youth)) or (pr.adult and v_size = any(v_adult))) then
      raise exception 'bad_size';
    end if;
    v_pname := case when pr.personalize then upper(left(trim(coalesce(it->>'pname', '')), 14)) else '' end;
    v_pnum := case when pr.personalize then left(regexp_replace(coalesce(it->>'pnum', ''), '[^0-9]', '', 'g'), 2) else '' end;
    v_unit := round(pr.price * (1 + st.fundraiser_pct / 100), 2)
      + case when v_pname <> '' then pr.name_fee else 0 end
      + case when v_pnum <> '' then pr.number_fee else 0 end;
    v_sub := v_sub + v_unit * v_qty;
    v_fund := v_fund + pr.price * st.fundraiser_pct / 100 * v_qty;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_id', pr.id, 'name', pr.name, 'size', v_size, 'qty', v_qty,
      'pname', v_pname, 'pnum', v_pnum, 'unit', v_unit, 'base', pr.price));
  end loop;

  if v_ful = 'ship' then v_ship := st.ship_fee; end if;
  v_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));

  insert into public.orders(code, store_id, parent, email, phone, player, fulfillment, address,
                            subtotal, ship, total, fundraiser, pay_mode)
  values (v_code, st.id, left(trim(p->>'parent'), 100), lower(left(trim(p->>'email'), 200)),
          left(trim(coalesce(p->>'phone', '')), 40), left(trim(p->>'player'), 100), v_ful,
          case when v_ful = 'ship' then left(trim(p->>'address'), 400) else '' end,
          v_sub, v_ship, v_sub + v_ship, round(v_fund, 2), st.pay_mode)
  returning id into v_order;

  insert into public.order_items(order_id, product_id, name, size, qty, pname, pnum, unit, base)
  select v_order, l->>'product_id', l->>'name', l->>'size', (l->>'qty')::int,
         l->>'pname', l->>'pnum', (l->>'unit')::numeric, (l->>'base')::numeric
  from jsonb_array_elements(v_lines) l;

  return jsonb_build_object('code', v_code, 'total', v_sub + v_ship, 'pay_mode', st.pay_mode,
                            'pay_link', st.pay_link, 'closes', st.closes);
end $$;

revoke all on function public.place_order(jsonb) from public;
grant execute on function public.place_order(jsonb) to anon, authenticated;

-- A parent can look up their own order with the order code and their email.
create or replace function public.find_order(p_code text, p_email text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'code', o.code, 'store', s.name, 'player', o.player, 'total', o.total,
    'paid', o.paid, 'status', o.status, 'fulfillment', o.fulfillment,
    'items', (select coalesce(jsonb_agg(jsonb_build_object('name', i.name, 'size', i.size, 'qty', i.qty,
                                                           'pname', i.pname, 'pnum', i.pnum)), '[]'::jsonb)
              from public.order_items i where i.order_id = o.id))
  from public.orders o join public.stores s on s.id = o.store_id
  where o.code = upper(trim(p_code)) and o.email = lower(trim(p_email));
$$;
revoke all on function public.find_order(text, text) from public;
grant execute on function public.find_order(text, text) to anon, authenticated;

-- ---------- Storage for team logos and sample photos ----------
insert into storage.buckets (id, name, public) values ('store-assets', 'store-assets', true)
  on conflict (id) do nothing;
create policy "admins upload store assets" on storage.objects
  for insert to authenticated with check (bucket_id = 'store-assets' and public.is_admin());
create policy "admins change store assets" on storage.objects
  for update to authenticated using (bucket_id = 'store-assets' and public.is_admin());
create policy "admins remove store assets" on storage.objects
  for delete to authenticated using (bucket_id = 'store-assets' and public.is_admin());

-- ---------- First team: All American Softball ----------
insert into public.stores (id, slug, name, season, color, color2, logo_url, wordmark_url, opens, closes,
                           pay_mode, fundraiser_pct, pickup, pickup_note, ship, ship_fee)
values ('s-all-american', 'all-american-softball', 'All American Softball', '2027 Season', '#1f3a5a', '#c8102e',
        '/teams/all-american/logo.png', '/teams/all-american/wordmark.png', '2026-11-04', '2026-11-18',
        'online', 0, true, 'Pick up at 2403 Santa Fe Drive', true, 8)
on conflict (id) do nothing;

insert into public.products (id, store_id, sort, name, kind, price, description, youth, adult, personalize,
                             name_fee, number_fee, garment_color, front_art)
values
  ('p-aa-jersey', 's-all-american', 1, 'Game jersey', 'jersey', 35, 'Sublimated, All American wordmark', true, true, true, 5, 5, 'white', 'wordmark'),
  ('p-aa-tee',    's-all-american', 2, 'Practice tee', 'tee', 16, 'AA logo on the chest', true, true, false, 0, 0, 'team', 'logo'),
  ('p-aa-hoodie', 's-all-american', 3, 'Team hoodie', 'hoodie', 38, 'For players and fans', true, true, true, 6, 0, 'gray', 'logo'),
  ('p-aa-hat',    's-all-american', 4, 'Visor / cap', 'hat', 20, 'Embroidered AA logo', true, true, false, 0, 0, 'team', 'logo')
on conflict (id) do nothing;

insert into public.product_supply (product_id, supplier)
select id, 'sanmar' from public.products where store_id = 's-all-american'
on conflict (product_id) do nothing;

-- Done. You should see "Success. No rows returned."
