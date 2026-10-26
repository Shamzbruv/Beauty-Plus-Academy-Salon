begin;
create schema if not exists bp_private;
revoke all on schema bp_private from public;
grant usage on schema bp_private to anon, authenticated;
create table public.bp_admins (email text primary key check(email=lower(email)), created_at timestamptz not null default now());
alter table public.bp_admins enable row level security;
revoke all on public.bp_admins from anon, authenticated;
insert into public.bp_admins(email) values ('forresterpetagay30@gmail.com');
create function bp_private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from auth.users u join public.bp_admins a on a.email=lower(u.email) where u.id=auth.uid() and u.email_confirmed_at is not null);
$$;
revoke all on function bp_private.is_admin() from public;
grant execute on function bp_private.is_admin() to anon,authenticated;
create table public.bp_content (
 id text primary key default gen_random_uuid()::text,
 kind text not null check(kind in ('service','course','gallery','promotion','event','page','settings','testimonial','faq')),
 title text not null check(length(title) between 1 and 500),
 status text not null default 'draft' check(status in ('draft','published','archived')),
 sort_order integer not null default 0,
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<200000),
 version integer not null default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index bp_content_listing on public.bp_content(kind,status,sort_order);
alter table public.bp_content enable row level security;
revoke all on public.bp_content from anon,authenticated;
grant select on public.bp_content to anon;
grant select,insert,update,delete on public.bp_content to authenticated;
create policy bp_read_published on public.bp_content for select to anon,authenticated using(status='published');
create policy bp_manage_content on public.bp_content for all to authenticated using((select bp_private.is_admin())) with check((select bp_private.is_admin()));
create table public.bp_submissions (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('event','booking','enrollment','tuition','inquiry')),
 content_id text references public.bp_content(id) on delete restrict,
 name text not null check(length(trim(name)) between 2 and 200),
 email text not null check(length(email)<255 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
 phone text not null default '' check(length(phone)<60),
 data jsonb not null default '{}' check(jsonb_typeof(data)='object' and octet_length(data::text)<30000),
 form_snapshot jsonb not null default '[]',
 amount numeric(12,2) not null default 0 check(amount>=0),
 payment_method text not null default '',
 payment_status text not null default 'pending' check(payment_status in ('pending','paid','refunded','waived')),
 status text not null default 'new' check(status in ('new','confirmed','waitlisted','attended','completed','cancelled')),
 admin_notes text not null default '' check(length(admin_notes)<10000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index bp_submission_listing on public.bp_submissions(kind,created_at desc);
create index bp_event_attendees on public.bp_submissions(content_id,status);
create index bp_submission_email on public.bp_submissions(lower(email),created_at);
create unique index bp_unique_event_signup on public.bp_submissions(content_id,lower(email)) where kind='event' and status<>'cancelled';
alter table public.bp_submissions enable row level security;
revoke all on public.bp_submissions from anon,authenticated;
grant insert on public.bp_submissions to anon;
grant select,insert,update,delete on public.bp_submissions to authenticated;
create policy bp_submit_request on public.bp_submissions for insert to anon,authenticated with check(payment_status='pending' and admin_notes='' and status in ('new','waitlisted'));
create policy bp_manage_requests on public.bp_submissions for all to authenticated using((select bp_private.is_admin())) with check((select bp_private.is_admin()));
create table public.bp_revisions(id bigint generated always as identity primary key,content_id text not null,actor uuid, action text not null, snapshot jsonb not null, created_at timestamptz not null default now());
alter table public.bp_revisions enable row level security;
revoke all on public.bp_revisions from anon,authenticated;
grant select on public.bp_revisions to authenticated;
create policy bp_read_history on public.bp_revisions for select to authenticated using((select bp_private.is_admin()));
create index bp_revision_listing on public.bp_revisions(content_id,created_at desc);
create function bp_private.content_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='UPDATE' then
  insert into public.bp_revisions(content_id,actor,action,snapshot) values(old.id,auth.uid(),'updated',to_jsonb(old));
  new.updated_at=now();new.version=old.version+1;
 elsif tg_op='DELETE' then
  insert into public.bp_revisions(content_id,actor,action,snapshot) values(old.id,auth.uid(),'deleted',to_jsonb(old));return old;
 end if;
 return new;
end;$$;
revoke all on function bp_private.content_history() from public,anon,authenticated;
create trigger bp_content_history before update or delete on public.bp_content for each row execute function bp_private.content_history();
create function bp_private.validate_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.bp_content; cfg jsonb; field jsonb; answer text; capacity int; attendees int; max_price numeric;
begin
 new.updated_at=now();new.email=lower(trim(new.email));
 if tg_op='UPDATE' then
  if not bp_private.is_admin() then raise exception 'Owner access required';end if;return new;
 end if;
 if not bp_private.is_admin() then
  new.created_at=now();new.payment_status='pending';new.status='new';new.admin_notes='';
  if (select count(*) from public.bp_submissions where lower(email)=new.email and created_at>now()-interval '10 minutes')>=5 then raise exception 'Too many requests. Please wait ten minutes.';end if;
 end if;
 if new.content_id is null and new.kind<>'inquiry' then raise exception 'Please choose an item.';end if;
 if new.content_id is not null then
  select * into item from public.bp_content where id=new.content_id and status='published' for update;
  if not found then raise exception 'This item is no longer available.';end if;
  if (new.kind='event' and item.kind<>'event') or (new.kind='booking' and item.kind<>'service') or (new.kind in ('enrollment','tuition') and item.kind<>'course') then raise exception 'Item type mismatch';end if;
 end if;
 select data into cfg from public.bp_content where id='site-settings';
 if new.payment_method<>'' and not exists(select 1 from jsonb_array_elements(coalesce(cfg->'payments','[]')) p where p->>'id'=new.payment_method and (p->>'enabled')::boolean) then raise exception 'Please choose an available payment method.';end if;
 if new.kind='event' then
  if coalesce((item.data->>'registration_open')::boolean,true)=false or (nullif(item.data->>'registration_deadline','') is not null and (item.data->>'registration_deadline')::timestamptz<now()) or (nullif(item.data->>'starts_at','') is not null and (item.data->>'starts_at')::timestamptz<now()) then raise exception 'Registration has closed.';end if;
  new.amount=coalesce((item.data->>'price')::numeric,0);
  new.form_snapshot=coalesce(item.data->'fields','[]');
  for field in select * from jsonb_array_elements(new.form_snapshot) loop
   answer=trim(coalesce(new.data->'answers'->>(field->>'id'),''));
   if coalesce((field->>'required')::boolean,false) and answer='' then raise exception 'Please complete: %',field->>'label';end if;
   if length(answer)>3000 then raise exception 'An answer is too long.';end if;
   if answer<>'' and field->>'type'='select' and not exists(select 1 from jsonb_array_elements_text(field->'options') v where v=answer) then raise exception 'Please choose a listed option for %',field->>'label';end if;
   if answer<>'' and field->>'type'='email' and answer !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Please enter a valid email.';end if;
   if answer<>'' and field->>'type'='checkbox' and answer<>'true' then raise exception 'Please tick: %',field->>'label';end if;
  end loop;
  capacity=coalesce((item.data->>'capacity')::int,0);
  select count(*) into attendees from public.bp_submissions where content_id=item.id and status not in ('cancelled','waitlisted');
  if capacity>0 and attendees>=capacity then
   if coalesce((item.data->>'waitlist')::boolean,false) then new.status='waitlisted';else raise exception 'This event is full.';end if;
  end if;
 elsif new.kind='booking' then
  if nullif(new.data->>'date','') is null or (new.data->>'date')::date<(now() at time zone 'America/Jamaica')::date then raise exception 'Choose a future appointment date.';end if;
  new.amount=case when nullif(item.data->>'price','') is null then coalesce((cfg->>'variable_deposit')::numeric,1500) else round((item.data->>'price')::numeric * coalesce((cfg->>'deposit_percent')::numeric,50)/100,2) end;
 elsif new.kind='enrollment' then new.amount=coalesce((cfg->>'registration_fee')::numeric,5000);
 elsif new.kind='tuition' then
  max_price=coalesce(nullif(item.data->>'kit_price','')::numeric,(item.data->>'price')::numeric);
  if new.amount<=0 or new.amount>max_price then raise exception 'Enter a tuition amount within the course fee.';end if;
 else new.amount=0;
 end if;
 if new.amount>0 and new.payment_method='' then raise exception 'Choose how you would like to pay.';end if;
 return new;
end;$$;
revoke all on function bp_private.validate_submission() from public,anon,authenticated;
create trigger bp_submission_validate before insert or update on public.bp_submissions for each row execute function bp_private.validate_submission();
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('bp-media','bp-media',true,10485760,array['image/jpeg','image/png','image/webp','image/avif']);
create policy bp_media_read on storage.objects for select to anon,authenticated using(bucket_id='bp-media');
create policy bp_media_insert on storage.objects for insert to authenticated with check(bucket_id='bp-media' and (select bp_private.is_admin()));
create policy bp_media_update on storage.objects for update to authenticated using(bucket_id='bp-media' and (select bp_private.is_admin())) with check(bucket_id='bp-media' and (select bp_private.is_admin()));
create policy bp_media_delete on storage.objects for delete to authenticated using(bucket_id='bp-media' and (select bp_private.is_admin()));
commit;

create function public.bp_is_admin() returns boolean language sql stable security invoker set search_path='' as $$select bp_private.is_admin()$$;
revoke all on function public.bp_is_admin() from public,anon;
grant execute on function public.bp_is_admin() to authenticated;

create function bp_private.validate_content() returns trigger language plpgsql security invoker set search_path='' as $$
declare amount numeric; p jsonb;
begin
 if new.kind in ('service','course','event') then
  amount=nullif(new.data->>'price','')::numeric;
  if amount<0 or (new.kind in ('course','event') and amount is null) then raise exception 'Enter a valid price, or 0 for free.';end if;
 end if;
 if new.kind='event' and (coalesce((new.data->>'capacity')::numeric,0)<0 or coalesce((new.data->>'capacity')::numeric,0)<>trunc(coalesce((new.data->>'capacity')::numeric,0))) then raise exception 'Capacity must be a whole number, 0 or greater.';end if;
 if new.kind='promotion' and nullif(new.data->>'starts_at','') is not null and nullif(new.data->>'ends_at','') is not null and (new.data->>'ends_at')::timestamptz<=(new.data->>'starts_at')::timestamptz then raise exception 'Promotion end must follow its start.';end if;
 if new.kind='settings' then
  if (new.data->>'deposit_percent')::numeric not between 0 and 100 or (new.data->>'registration_fee')::numeric<0 or (new.data->>'variable_deposit')::numeric<0 then raise exception 'Invalid fee or deposit settings';end if;
  for p in select * from jsonb_array_elements(coalesce(new.data->'payments','[]')) loop
   if coalesce(p->>'url','')<>'' and p->>'url' !~ '^https://' then raise exception 'Payment links must use HTTPS.';end if;
  end loop;
 end if;
 return new;
end;$$;
revoke all on function bp_private.validate_content() from public,anon,authenticated;
create trigger bp_validate_content before insert or update on public.bp_content for each row execute function bp_private.validate_content();
