-- Close internal-only actions, require schedulable new bookings, and avoid duplicate POS email receipts.
begin;
create or replace function bp_private.command(p_action text,p jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;prod public.bp_products;del public.bp_deliveries;i public.bp_invoices;o public.bp_orders;sh public.bp_shifts;s public.bp_submissions;item public.bp_order_items;entry jsonb;sid uuid;iid uuid;qty int;amount numeric;delta int;total numeric;expected numeric;fromdate date;todate date;
begin
 if p_action='order' then return bp_private.create_order(p,true);end if;
 if p_action='document' then return bp_private.invoice_document((p->>'token')::uuid);end if;
 if p_action='receipt' then
  select * into s from public.bp_submissions where id=(p->>'id')::uuid and client_token=(p->>'token')::uuid;
  if not found then raise exception 'Receipt not found.';end if;
  i=bp_private.invoice_for(s.id);return jsonb_build_object('invoice_id',i.id,'access_token',i.access_token,'total',i.total,'amount',least(s.amount,greatest(0,i.total-i.paid)),'status',s.status,'payment_status',i.status);
 end if;
 if p_action='slots' then
  fromdate=(p->>'date')::date;if fromdate<(now() at time zone 'America/Jamaica')::date or fromdate>(now() at time zone 'America/Jamaica')::date+180 then return '[]';end if;
  select data into result from public.bp_content where id='shop-settings';
  if not result->'booking_days' @> to_jsonb(extract(isodow from fromdate)::int) or result->'blackout_dates' ? fromdate::text then return '[]';end if;
  qty=bp_private.booking_duration(p->>'service_id');if qty is null then return '[]';end if;
  select coalesce(jsonb_agg(to_char(t.slot at time zone 'America/Jamaica','HH24:MI') order by t.slot),'[]') into result from generate_series((fromdate+(result->>'booking_open')::time) at time zone 'America/Jamaica',((fromdate+(result->>'booking_close')::time) at time zone 'America/Jamaica')-make_interval(mins=>qty),make_interval(mins=>greatest(15,coalesce((result->>'booking_interval')::int,30)))) t(slot)
  where t.slot>now() and (select count(*) from public.bp_submissions where kind='booking' and status not in('cancelled','completed') and appointment_start<t.slot+make_interval(mins=>qty) and appointment_end>t.slot)<greatest(1,coalesce((result->>'booking_capacity')::int,1));
  return result;
 end if;
 if not bp_private.operator() then raise exception 'An active studio account is required.';end if;
 if p_action='sale' then return bp_private.create_order(p,false);end if;
 if p_action='invoice_for' then
  if p ? 'request_id' then
   select * into s from public.bp_submissions where id=(p->>'request_id')::uuid;
   if not bp_private.is_admin() and (s.kind<>'booking' or not bp_private.operator('booking')) then raise exception 'Owner access required';end if;
   i=bp_private.invoice_for(s.id);
  else
   select * into i from public.bp_invoices where id=(p->>'invoice_id')::uuid;
   if not bp_private.is_admin() and (i.source_kind<>'store' or not bp_private.operator('pos')) then raise exception 'Owner access required';end if;
  end if;
  result=bp_private.invoice_document(i.access_token);return result||jsonb_build_object('access_token',i.access_token);
 end if;
 if p_action='order_detail' then
  if not bp_private.operator('pos') then raise exception 'POS access required';end if;
  select * into o from public.bp_orders where id=(p->>'id')::uuid;
  select * into i from public.bp_invoices where order_id=o.id;
  return jsonb_build_object('order',to_jsonb(o),'invoice',to_jsonb(i),'items',(select jsonb_agg(to_jsonb(x)-'unit_cost') from public.bp_order_items x where order_id=o.id));
 end if;
 if p_action='shift_open' then
  if not bp_private.operator('pos') then raise exception 'POS access required';end if;
  insert into public.bp_shifts(operator_id,opening_cash,notes) values(auth.uid(),coalesce((p->>'opening_cash')::numeric,0),left(coalesce(p->>'notes',''),1000)) returning * into sh;return to_jsonb(sh);
 end if;
 if p_action='shift_close' then
  if not bp_private.operator('pos') then raise exception 'POS access required';end if;
  select * into sh from public.bp_shifts where id=(p->>'id')::uuid and operator_id=auth.uid() and closed_at is null for update;if not found then raise exception 'Open till not found.';end if;
  select sh.opening_cash+coalesce(sum(case when pay.kind='payment' then pay.amount else -pay.amount end),0) into expected from public.bp_payments pay where pay.shift_id=sh.id and pay.method='cash';
  if (p->>'counted_cash')::numeric<0 then raise exception 'Cash count cannot be negative';end if;
  update public.bp_shifts set closed_at=now(),counted_cash=(p->>'counted_cash')::numeric,expected_cash=expected,notes=left(coalesce(p->>'notes',''),2000) where id=sh.id returning * into sh;
  insert into public.bp_audit(actor,action,entity_id,detail) values(auth.uid(),'shift_closed',sh.id,jsonb_build_object('expected',expected,'counted',sh.counted_cash));return to_jsonb(sh);
 end if;
 if p_action='hold_cart' then
  if not bp_private.operator('pos') then raise exception 'POS access required';end if;
  insert into public.bp_held_carts(label,cart,operator_id) values(left(coalesce(p->>'label','Held sale'),100),p->'cart',auth.uid()) returning id into sid;return jsonb_build_object('id',sid);
 end if;
 if p_action='resume_cart' then
  if not bp_private.operator('pos') then raise exception 'POS access required';end if;
  delete from public.bp_held_carts where id=(p->>'id')::uuid returning cart into result;return result;
 end if;
 if p_action='booking_create' then
  if not bp_private.operator('booking') then raise exception 'Booking access required';end if;
  select * into s from public.bp_submissions where id=nullif(p->>'key','')::uuid and kind='booking';
  if found then i=bp_private.invoice_for(s.id);return jsonb_build_object('id',s.id,'invoice_id',i.id,'access_token',i.access_token,'duplicate',true);end if;
  insert into public.bp_submissions(id,kind,content_id,name,email,phone,data,payment_method,client_token,assigned_employee)
  values(coalesce((p->>'key')::uuid,gen_random_uuid()),'booking',p->>'service_id',p->>'name',p->>'email',p->>'phone',jsonb_build_object('date',p->>'date','time',p->>'time','notes',p->>'notes','item',(select title from public.bp_content where id=p->>'service_id')),p->>'payment_method',gen_random_uuid(),nullif(p->>'assigned_employee','')::uuid) returning * into s;
  i=bp_private.invoice_for(s.id);return jsonb_build_object('id',s.id,'invoice_id',i.id,'access_token',i.access_token);
 end if;
 if p_action='request_update' then
  select * into s from public.bp_submissions where id=(p->>'id')::uuid for update;
  if not bp_private.is_admin() and (s.kind<>'booking' or not bp_private.operator('booking')) then raise exception 'Owner access required';end if;
  if coalesce(p->>'payment_status',s.payment_status)<>s.payment_status and not bp_private.is_admin() then raise exception 'Only the owner can verify request payments.';end if;
  i=bp_private.invoice_for(s.id);
  if p->>'payment_status'='paid' and s.payment_status<>'paid' then
   amount=least(s.amount,greatest(i.total-i.paid,0));if amount>0 then perform bp_private.post_payment(i.id,amount,case when s.payment_method in('cash','bank','wipay','fygaro','ncb') then s.payment_method else 'other' end,coalesce(s.data->>'payment_reference',''),'request-paid-'||s.id);end if;
  elsif p->>'payment_status'='refunded' and s.payment_status<>'refunded' then raise exception 'Use the invoice refund action to record a refund with a reason.';
  elsif s.payment_status='paid' and p->>'payment_status'='pending' then raise exception 'A recorded payment cannot be undone by changing a flag. Use a refund.';end if;
  perform set_config('bp.payment_update','yes',true);
  update public.bp_submissions set status=coalesce(p->>'status',status),admin_notes=coalesce(p->>'notes',admin_notes),payment_status=coalesce(p->>'payment_status',payment_status),assigned_employee=case when p ? 'assigned_employee' then nullif(p->>'assigned_employee','')::uuid else assigned_employee end where id=s.id;
  perform bp_private.enqueue(i.id,'update','request-update-'||s.id||'-'||gen_random_uuid());return jsonb_build_object('id',s.id);
 end if;
 if p_action='payment' then
  select id into sid from public.bp_shifts where operator_id=auth.uid() and closed_at is null;
  iid=bp_private.post_payment((p->>'invoice_id')::uuid,(p->>'amount')::numeric,p->>'method',p->>'reference',p->>'key','payment','',sid);return jsonb_build_object('id',iid);
 end if;
 -- Remaining commands are owner-only, checked before touching private rows.
 if not bp_private.is_admin() then raise exception 'Owner access required.';end if;
 if p_action='save_product' then
  sid=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());select * into prod from public.bp_products where id=sid for update;
  if found and prod.updated_at::text<>(p->>'expected_updated_at')::timestamptz::text then raise exception 'This product changed in another session. Refresh before saving.';end if;
  delta=coalesce((p->>'stock_qty')::int,0)-coalesce(prod.stock_qty,0);
  insert into public.bp_products(id,name,sku,description,category,price,tax_rate,image,status,track_stock,stock_qty,low_stock,barcode,sort_order)
  values(sid,left(p->>'name',250),upper(trim(p->>'sku')),left(coalesce(p->>'description',''),10000),left(coalesce(p->>'category','Beauty essentials'),100),(p->>'price')::numeric,coalesce((p->>'tax_rate')::numeric,0),coalesce(p->>'image',''),coalesce(p->>'status','draft'),coalesce((p->>'track_stock')::boolean,true),coalesce((p->>'stock_qty')::int,0),coalesce((p->>'low_stock')::int,5),left(coalesce(p->>'barcode',''),100),coalesce((p->>'sort_order')::int,0))
  on conflict(id) do update set name=excluded.name,sku=excluded.sku,description=excluded.description,category=excluded.category,price=excluded.price,tax_rate=excluded.tax_rate,image=excluded.image,status=excluded.status,track_stock=excluded.track_stock,stock_qty=excluded.stock_qty,low_stock=excluded.low_stock,barcode=excluded.barcode,sort_order=excluded.sort_order,updated_at=now();
  insert into bp_private.product_costs(product_id,unit_cost) values(sid,coalesce((p->>'unit_cost')::numeric,0)) on conflict(product_id) do update set unit_cost=excluded.unit_cost;
  if delta<>0 then insert into public.bp_stock_movements(product_id,delta,reason,actor) values(sid,delta,left(coalesce(p->>'stock_reason','Owner stock adjustment'),500),auth.uid());end if;
  insert into public.bp_notifications(kind,title,body,entity_id) values('stock','Product catalog updated','Prices and stock have been updated.',sid);
  insert into public.bp_audit(actor,action,entity_id,detail) values(auth.uid(),'product_saved',sid,jsonb_build_object('stock_delta',delta));return jsonb_build_object('id',sid);
 end if;
 if p_action='product_costs' then select coalesce(jsonb_object_agg(product_id,unit_cost),'{}') into result from bp_private.product_costs;return result;end if;
 if p_action='save_delivery' then
  sid=coalesce(nullif(p->>'id','')::uuid,gen_random_uuid());
  insert into public.bp_deliveries(id,name,type,fee,free_over,areas,instructions,estimate,active) values(sid,left(p->>'name',200),p->>'type',(p->>'fee')::numeric,nullif(p->>'free_over','')::numeric,array(select jsonb_array_elements_text(coalesce(p->'areas','[]'))),left(coalesce(p->>'instructions',''),3000),left(coalesce(p->>'estimate',''),300),coalesce((p->>'active')::boolean,true))
  on conflict(id) do update set name=excluded.name,type=excluded.type,fee=excluded.fee,free_over=excluded.free_over,areas=excluded.areas,instructions=excluded.instructions,estimate=excluded.estimate,active=excluded.active,updated_at=now();return jsonb_build_object('id',sid);
 end if;
 if p_action='order_status' then
  select * into o from public.bp_orders where id=(p->>'id')::uuid for update;select * into i from public.bp_invoices where order_id=o.id;
  if p->>'status'='cancelled' and o.status<>'cancelled' then
   if i.paid>0 then raise exception 'Refund the paid order before cancelling.';end if;
   for item in select * from public.bp_order_items where order_id=o.id order by product_id loop
    update public.bp_products set stock_qty=stock_qty+item.quantity,updated_at=now() where id=item.product_id and track_stock;
    if found then insert into public.bp_stock_movements(product_id,delta,reason,order_id,actor) values(item.product_id,item.quantity,'cancelled order',o.id,auth.uid());end if;
   end loop;update public.bp_invoices set status='void' where id=i.id;
  elsif o.status in('cancelled','refunded') and p->>'status'<>o.status then raise exception 'Closed orders cannot be reopened. Create a new order.';end if;
  update public.bp_orders set status=p->>'status',updated_at=now() where id=o.id;
  perform bp_private.enqueue(i.id,'update','order-status-'||o.id||'-'||(p->>'status'));return jsonb_build_object('id',o.id);
 end if;
 if p_action='refund_order' then
  if exists(select 1 from public.bp_payments where idempotency_key=p->>'key') then return jsonb_build_object('duplicate',true);end if;
  select id into sid from public.bp_shifts where operator_id=auth.uid() and closed_at is null for update;
  select * into o from public.bp_orders where id=(p->>'id')::uuid for update;select * into i from public.bp_invoices where order_id=o.id for update;
  if exists(select 1 from public.bp_payments where idempotency_key=p->>'key') then return jsonb_build_object('duplicate',true);end if;
  total=0;
  for entry in select * from jsonb_array_elements(coalesce(p->'items','[]')) loop
   select * into item from public.bp_order_items where id=(entry->>'id')::uuid and order_id=o.id for update;qty=(entry->>'qty')::int;
   if not found or qty<=0 or qty>item.quantity-item.returned_qty then raise exception 'Check return quantities.';end if;
   amount=round(item.unit_price*qty*(1+item.tax_rate/100)*(1-case when o.subtotal+o.tax>0 then o.discount/(o.subtotal+o.tax) else 0 end),2);total=total+amount;
   update public.bp_order_items set returned_qty=returned_qty+qty where id=item.id;
   if coalesce((p->>'restock')::boolean,true) then
    update public.bp_products set stock_qty=stock_qty+qty,updated_at=now() where id=item.product_id and track_stock;
    if found then insert into public.bp_stock_movements(product_id,delta,reason,order_id,actor) values(item.product_id,qty,'customer return',o.id,auth.uid());end if;
   end if;
  end loop;
  if coalesce((p->>'refund_delivery')::boolean,false) and not exists(select 1 from public.bp_order_items where order_id=o.id and returned_qty<quantity) then total=total+o.delivery_fee;end if;
  sid=bp_private.post_payment(i.id,total,p->>'method',p->>'reference',p->>'key','refund',p->>'reason',sid);
  if not exists(select 1 from public.bp_order_items where order_id=o.id and returned_qty<quantity) then update public.bp_orders set status='refunded',updated_at=now() where id=o.id;end if;
  return jsonb_build_object('id',sid,'refunded',total);
 end if;
 if p_action='refund_invoice' then sid=bp_private.post_payment((p->>'invoice_id')::uuid,(p->>'amount')::numeric,p->>'method',p->>'reference',p->>'key','refund',p->>'reason');return jsonb_build_object('id',sid);end if;
 if p_action='retry_email' then
  insert into public.bp_email_outbox(invoice_id,template_id,recipient,event_key) select invoice_id,template_id,recipient,'resend-'||gen_random_uuid() from public.bp_email_outbox where id=(p->>'id')::uuid;return '{"ok":true}';
 end if;
 if p_action='finance' then
  fromdate=coalesce(nullif(p->>'from','')::date,(now() at time zone 'America/Jamaica')::date-29);todate=coalesce(nullif(p->>'to','')::date,(now() at time zone 'America/Jamaica')::date);
  if todate<fromdate or todate-fromdate>3660 then raise exception 'Choose a valid reporting period of up to ten years.';end if;
  with tx as(select pay.*,iv.source_kind from public.bp_payments pay join public.bp_invoices iv on iv.id=pay.invoice_id where pay.created_at>=fromdate::timestamp at time zone 'America/Jamaica' and pay.created_at<(todate+1)::timestamp at time zone 'America/Jamaica'),
  daily as(select d::date as "day",coalesce(sum(case when tx.kind='payment' then tx.amount else -tx.amount end),0) as amount from generate_series(fromdate,todate,'1 day')d left join tx on (tx.created_at at time zone 'America/Jamaica')::date=d::date group by d),
  category as(select tx.source_kind,coalesce(sum(case when tx.kind='payment' then tx.amount else -tx.amount end),0) as amount from tx group by tx.source_kind),
  methods as(select tx.method,coalesce(sum(case when tx.kind='payment' then tx.amount else -tx.amount end),0) as amount from tx group by tx.method)
  select jsonb_build_object('from',fromdate,'to',todate,
   'gross_received',(select coalesce(sum(tx.amount) filter(where tx.kind='payment'),0) from tx),
   'refunds',(select coalesce(sum(tx.amount) filter(where tx.kind='refund'),0) from tx),
   'net_received',(select coalesce(sum(case when tx.kind='payment' then tx.amount else -tx.amount end),0) from tx),
   'daily',(select jsonb_agg(to_jsonb(daily) order by daily."day") from daily),
   'categories',(select coalesce(jsonb_agg(to_jsonb(category)),'[]') from category),
   'methods',(select coalesce(jsonb_agg(to_jsonb(methods)),'[]') from methods),
   'outstanding',(select coalesce(sum(greatest(iv2.total-iv2.paid,0)),0) from public.bp_invoices iv2 where iv2.status not in('void','refunded')),
   'invoices_issued',(select count(*) from public.bp_invoices iv3 where iv3.created_at>=fromdate::timestamp at time zone 'America/Jamaica' and iv3.created_at<(todate+1)::timestamp at time zone 'America/Jamaica'),
   'transactions',(select coalesce(jsonb_agg(to_jsonb(tx) order by tx.created_at desc),'[]') from tx),
   'top_products',(select coalesce(jsonb_agg(to_jsonb(top)),'[]') from(select x.name,sum(x.quantity-x.returned_qty) as units,sum((x.quantity-x.returned_qty)*x.unit_price) as sales,sum((x.quantity-x.returned_qty)*(x.unit_price-x.unit_cost)) as margin_before_discounts from public.bp_order_items x join public.bp_orders ord on ord.id=x.order_id join public.bp_invoices iv4 on iv4.order_id=ord.id where iv4.paid>=iv4.total and ord.status<>'cancelled' and ord.created_at>=fromdate::timestamp at time zone 'America/Jamaica' and ord.created_at<(todate+1)::timestamp at time zone 'America/Jamaica' group by x.name order by sales desc limit 10)top),
   'staff_sales',(select coalesce(jsonb_agg(to_jsonb(staffsale)),'[]') from(select coalesce(emp.name,'Owner') as name,count(*) as sales,sum(ord2.total) as total from public.bp_orders ord2 left join public.bp_staff emp on emp.user_id=ord2.operator_id where ord2.channel='pos' and ord2.status<>'refunded' and ord2.created_at>=fromdate::timestamp at time zone 'America/Jamaica' and ord2.created_at<(todate+1)::timestamp at time zone 'America/Jamaica' group by emp.name)staffsale)) into result;
  return result;
 end if;
 raise exception 'Unknown studio action.';
end;$$;

create or replace function bp_private.request_schedule() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg jsonb;starts timestamptz;ends timestamptz;minutes int;capacity int;conflicts int;localday date;clocktime time;
begin
 if new.kind='tuition' and tg_op='INSERT' and not bp_private.is_admin() then
  select e.id into new.enrollment_id from public.bp_submissions e join public.bp_invoices i on i.submission_id=e.id
  where e.kind='enrollment' and e.content_id=new.content_id and lower(e.email)=lower(new.email) and e.status<>'cancelled' and i.access_token=nullif(new.data->>'enrollment_token','')::uuid;
  if new.enrollment_id is null then raise exception 'Please enter the private enrollment invoice link supplied when you registered, or contact the salon for help.';end if;
 elsif new.kind='tuition' and new.enrollment_id is null then
  select id into new.enrollment_id from public.bp_submissions where kind='enrollment' and content_id=new.content_id and lower(email)=lower(new.email) and status<>'cancelled' order by created_at desc limit 1;
 end if;
 if new.enrollment_id is not null and not exists(select 1 from public.bp_submissions where id=new.enrollment_id and kind='enrollment' and lower(email)=lower(new.email) and content_id=new.content_id) then raise exception 'Enrollment reference does not match this course and email.';end if;
 if new.kind<>'booking' or new.status='cancelled' then return new;end if;
 select data into cfg from public.bp_content where id='shop-settings';
 if new.data->>'time' ~ '^\d{2}:\d{2}$' then
  starts=((new.data->>'date')::date+(new.data->>'time')::time) at time zone 'America/Jamaica';
 elsif new.appointment_start is not null then starts=new.appointment_start;
 elsif tg_op='UPDATE' and old.appointment_start is null then return new;
 else raise exception 'Please choose an available appointment time.';end if;
 if tg_op='UPDATE' and starts is not distinct from old.appointment_start and new.assigned_employee is not distinct from old.assigned_employee and (new.status=old.status or new.status in('completed','cancelled')) then return new;end if;
 minutes=bp_private.booking_duration(new.content_id);if minutes is null or minutes<15 then minutes=60;end if;
 ends=starts+make_interval(mins=>minutes);localday=(starts at time zone 'America/Jamaica')::date;clocktime=(starts at time zone 'America/Jamaica')::time;
 if starts<now() then raise exception 'Choose a future appointment time.';end if;
 if not coalesce(cfg->'booking_days','[1,2,3,4,5,6]'::jsonb) @> to_jsonb(extract(isodow from localday)::int) then raise exception 'The salon is closed on this day.';end if;
 if coalesce(cfg->'blackout_dates','[]'::jsonb) ? localday::text then raise exception 'The salon is not accepting appointments on this date.';end if;
 if clocktime<coalesce(cfg->>'booking_open','09:00')::time or (ends at time zone 'America/Jamaica')::time>coalesce(cfg->>'booking_close','19:00')::time or (ends at time zone 'America/Jamaica')::date<>localday then raise exception 'Choose a time within the salon opening hours.';end if;
 -- Date-wide lock also protects requests for different services competing for the same capacity.
 perform pg_advisory_xact_lock(hashtext('bp-booking-'||localday::text));
 capacity=greatest(1,coalesce((cfg->>'booking_capacity')::int,1));
 select count(*) into conflicts from public.bp_submissions where kind='booking' and id<>new.id and status not in('cancelled','completed') and appointment_start<ends and appointment_end>starts;
 if conflicts>=capacity then raise exception 'This appointment time has just filled. Please choose another.';end if;
 if new.assigned_employee is not null then
  if not exists(select 1 from public.bp_staff where id=new.assigned_employee and active and can_book) then raise exception 'Choose an active booking employee.';end if;
  if exists(select 1 from public.bp_submissions where kind='booking' and id<>new.id and status not in('cancelled','completed') and assigned_employee=new.assigned_employee and appointment_start<ends and appointment_end>starts) then raise exception 'This employee already has an appointment at that time.';end if;
 end if;
 new.appointment_start=starts;new.appointment_end=ends;return new;
end;$$;

create or replace function bp_private.ensure_invoice(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.bp_submissions;i public.bp_invoices;c public.bp_content;cfg jsonb;amount numeric;label text;
begin
 select * into s from public.bp_submissions where id=p_id;
 select * into i from public.bp_invoices where submission_id=coalesce(s.enrollment_id,s.id);
 if found then
  if s.kind='tuition' then update public.bp_invoices set due_now=least(s.amount,greatest(total-paid,0)),updated_at=now() where id=i.id;end if;
  return i.id;end if;
 select * into c from public.bp_content where id=s.content_id;
 select data into cfg from public.bp_content where id='site-settings';
 amount=s.amount;label=coalesce(c.title,s.data->>'item',initcap(s.kind));
 if s.kind='booking' then amount=coalesce(nullif(c.data->>'price','')::numeric,s.amount);
 elsif s.kind='enrollment' then amount=coalesce(case when s.data->>'kit'='true' then nullif(c.data->>'kit_price','')::numeric else null end,(c.data->>'price')::numeric,0)+coalesce((cfg->>'registration_fee')::numeric,5000);end if;
 insert into public.bp_invoices(source_kind,submission_id,customer_name,customer_email,customer_phone,items,subtotal,total,due_now)
 values(case when s.kind in('enrollment','tuition') then 'course' else s.kind end,s.id,s.name,s.email,s.phone,jsonb_build_array(jsonb_build_object('name',label,'quantity',1,'unit_price',amount,'line_total',amount)),amount,amount,least(amount,s.amount)) returning id into i.id;
 return i.id;
end;$$;

create or replace function bp_private.post_payment(p_invoice uuid,p_amount numeric,p_method text,p_ref text,p_key text,p_kind text default 'payment',p_reason text default '',p_shift uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.bp_invoices;pid uuid;v_paid numeric;v_refunded numeric;
begin
 if not bp_private.operator('pos') then raise exception 'Payment access required';end if;
 if p_kind='refund' and not bp_private.is_admin() then raise exception 'Only the owner can issue refunds.';end if;
 select id into pid from public.bp_payments where idempotency_key=p_key;if found then return pid;end if;
 if p_shift is null and p_kind='refund' and p_method='cash' then select id into p_shift from public.bp_shifts where operator_id=auth.uid() and closed_at is null;end if;
 if p_shift is not null then perform 1 from public.bp_shifts where id=p_shift and operator_id=auth.uid() and closed_at is null for update;if not found then raise exception 'This till is closed. Refresh and try again.';end if;end if;
 select * into i from public.bp_invoices where id=p_invoice for update;if not found then raise exception 'Invoice not found';end if;
 select id into pid from public.bp_payments where idempotency_key=p_key;if found then return pid;end if;
 if not bp_private.is_admin() and (p_shift is null or (i.source_kind<>'store' and not(i.source_kind='booking' and bp_private.operator('booking')))) then raise exception 'This payment needs owner access or an open till.';end if;
 p_amount=round(p_amount,2);if p_amount is null or p_amount<=0 then raise exception 'Enter a positive payment amount.';end if;
 if p_kind='payment' and (i.status in('void','refunded') or p_amount>i.total-i.paid) then raise exception 'Payment exceeds the outstanding balance or this invoice is closed.';end if;
 if p_kind='refund' and (p_amount>i.paid-i.refunded or length(trim(p_reason))<3) then raise exception 'Check the refund amount and add a reason.';end if;
 if p_method not in('cash','card','bank','wipay','fygaro','ncb','other') then raise exception 'Choose a valid payment method.';end if;
 insert into public.bp_payments(invoice_id,kind,amount,method,reference,reason,actor,shift_id,idempotency_key) values(i.id,p_kind,p_amount,p_method,left(coalesce(p_ref,''),300),left(coalesce(p_reason,''),1000),auth.uid(),p_shift,p_key) returning id into pid;
 select coalesce(sum(amount) filter(where kind='payment'),0),coalesce(sum(amount) filter(where kind='refund'),0) into v_paid,v_refunded from public.bp_payments where invoice_id=i.id;
 update public.bp_invoices set paid=v_paid,refunded=v_refunded,status=case when v_refunded>=v_paid and v_refunded>0 then 'refunded' when v_paid>=total then 'paid' when v_paid>0 then 'partial' else 'unpaid' end,updated_at=now() where id=i.id;
 perform set_config('bp.payment_update','yes',true);
 update public.bp_submissions set payment_status=case when v_paid-v_refunded>=amount then 'paid' when v_refunded>=v_paid and v_refunded>0 then 'refunded' else 'pending' end where id=i.submission_id and kind in('booking','enrollment');
 insert into public.bp_audit(actor,action,entity_id,detail) values(auth.uid(),p_kind,i.id,jsonb_build_object('amount',p_amount,'method',p_method,'reason',p_reason));
 if coalesce(current_setting('bp.pos_checkout',true),'')<>'yes' then perform bp_private.enqueue(i.id,case when p_kind='refund' then 'refund' else 'receipt' end,'payment-'||pid);end if;return pid;
end;$$;
create or replace function bp_private.invoice_document(p_token uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('invoice',to_jsonb(i)-'access_token','business',(select data from public.bp_content where id='site-settings'),'branding',(select data from public.bp_content where id='shop-settings'),'request',(select jsonb_build_object('kind',s.kind,'content_id',s.content_id,'date',s.data->>'date','time',s.data->>'time','status',s.status,'appointment_start',s.appointment_start) from public.bp_submissions s where s.id=i.submission_id),'order',(select jsonb_build_object('number',o.number,'status',o.status,'delivery',o.delivery_snapshot,'address',o.address) from public.bp_orders o where o.id=i.order_id)) from public.bp_invoices i where i.access_token=p_token;
$$;
create or replace function bp_private.validate_submission() returns trigger language plpgsql security definer set search_path='' as $$
declare item public.bp_content; cfg jsonb; field jsonb; answer text; capacity int; attendees int; max_price numeric;
begin
 new.updated_at=now();new.email=lower(trim(new.email));
 if tg_op='UPDATE' then
  if new.payment_status is distinct from old.payment_status and coalesce(current_setting('bp.payment_update',true),'')<>'yes' then raise exception 'Record payments through the linked invoice.';end if;
  if not bp_private.is_admin() and (old.kind<>'booking' or not bp_private.operator('booking')) then raise exception 'Booking or owner access required';end if;return new;
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
  if nullif(new.data->>'enrollment_token','') is not null then select greatest(total-paid,0) into max_price from public.bp_invoices where access_token=(new.data->>'enrollment_token')::uuid;end if;
  if new.amount<=0 or new.amount>max_price then raise exception 'Enter a tuition amount within the course fee.';end if;
 else new.amount=0;
 end if;
 if new.amount>0 and new.payment_method='' then raise exception 'Choose how you would like to pay.';end if;
 return new;
end;$$;
insert into public.bp_email_templates(id,name,subject,heading,body,footer) values('refund','Refund confirmation','Refund recorded · {{invoice_number}}','Your refund has been recorded.','Hi {{customer_name}},\n\nWe have recorded a refund against your invoice. The attached invoice shows the current payment and refund totals. Please allow your payment provider time to complete the return.','Contact the salon if you have any questions.') on conflict(id) do nothing;
create or replace function bp_private.create_order(p jsonb,p_online boolean) returns jsonb language plpgsql security definer set search_path='' as $$
<<order_input>>
declare o public.bp_orders;i public.bp_invoices;prod public.bp_products;del public.bp_deliveries;item jsonb;payment jsonb;qty int;subtotal numeric=0;tax numeric=0;discount numeric=0;shipping numeric=0;amount numeric;received numeric;paytotal numeric=0;cost numeric;items jsonb='[]';key uuid;shift uuid;customer_email text;customer_name text;method text;
begin
 if not p_online and not bp_private.operator('pos') then raise exception 'POS access required';end if;
 key=(p->>'key')::uuid;
 select * into o from public.bp_orders where idempotency_key=key;
 if found then select * into i from public.bp_invoices where order_id=o.id;return jsonb_build_object('order_id',o.id,'number',o.number,'invoice_id',i.id,'access_token',i.access_token,'total',o.total,'duplicate',true);end if;
 if jsonb_array_length(coalesce(p->'items','[]')) not between 1 and 100 then raise exception 'Add at least one item (maximum 100).';end if;
 customer_email=lower(trim(coalesce(p->>'email','')));customer_name=trim(coalesce(nullif(p->>'name',''),'Walk-in customer'));
 if p_online then
  if length(customer_name)<2 or customer_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(coalesce(p->>'phone',''))<7 then raise exception 'Add your name, email and phone.';end if;
  if (select count(*) from public.bp_orders where lower(bp_orders.customer_email)=order_input.customer_email and created_at>now()-interval '10 minutes')>=5 then raise exception 'Please wait before placing another order.';end if;
  select * into del from public.bp_deliveries where id=(p->>'delivery_id')::uuid and active;if not found then raise exception 'Choose an available delivery option.';end if;
  if del.type<>'pickup' and length(trim(coalesce(p->>'address','')))<8 then raise exception 'Enter your delivery address.';end if;
  if cardinality(del.areas)>0 and not coalesce(p->>'area','')=any(del.areas) then raise exception 'Choose an area covered by this delivery option.';end if;
  method=p->>'payment_method';if not exists(select 1 from public.bp_content c,jsonb_array_elements(c.data->'payments') m where c.id='site-settings' and m->>'id'=method and (m->>'enabled')::boolean) then raise exception 'Choose an available payment method.';end if;
 else
  select id into shift from public.bp_shifts where operator_id=auth.uid() and closed_at is null for update;
  if shift is null then raise exception 'Open your till before completing a sale.';end if;
  discount=coalesce((p->>'discount')::numeric,0);if discount>0 and not bp_private.operator('discount') then raise exception 'Owner permission is required for discounts.';end if;
 end if;
 -- Lock products in a consistent order, then re-read all prices and stock on the server.
 for item in select jsonb_build_object('id',x->>'id','qty',sum((x->>'qty')::int)) from jsonb_array_elements(p->'items') x group by x->>'id' order by x->>'id' loop
  qty=(item->>'qty')::int;if qty not between 1 and 999 then raise exception 'Check the item quantities.';end if;
  select * into prod from public.bp_products where id=(item->>'id')::uuid and status='published' for update;if not found then raise exception 'A product is no longer available.';end if;
  if prod.track_stock and prod.stock_qty<qty then raise exception 'Not enough stock for %',prod.name;end if;
  amount=round(prod.price*qty,2);subtotal=subtotal+amount;tax=tax+round(amount*prod.tax_rate/100,2);
  select unit_cost into cost from bp_private.product_costs where product_id=prod.id;
  items=items||jsonb_build_array(jsonb_build_object('product_id',prod.id,'name',prod.name,'sku',prod.sku,'quantity',qty,'unit_price',prod.price,'unit_cost',coalesce(cost,0),'tax_rate',prod.tax_rate,'line_total',amount));
 end loop;
 if discount<0 or discount>subtotal+tax then raise exception 'Discount must be within the sale total.';end if;
 if p_online then shipping=case when del.free_over is not null and subtotal>=del.free_over then 0 else del.fee end;end if;
 insert into public.bp_orders(channel,customer_name,customer_email,customer_phone,address,area,delivery_id,delivery_snapshot,status,subtotal,tax,discount,delivery_fee,total,payment_method,notes,operator_id,shift_id,idempotency_key)
 values(case when p_online then 'online' else 'pos' end,left(customer_name,200),left(customer_email,250),left(coalesce(p->>'phone',''),60),left(coalesce(p->>'address',''),2000),left(coalesce(p->>'area',''),100),case when p_online then del.id end,case when p_online then to_jsonb(del) else '{}'::jsonb end,case when p_online then 'pending' else 'completed' end,subtotal,tax,discount,shipping,subtotal+tax-discount+shipping,coalesce(method,'pos'),left(coalesce(p->>'notes',''),3000),case when not p_online then auth.uid() end,shift,key) returning * into o;
 for item in select * from jsonb_array_elements(items) loop
  insert into public.bp_order_items(order_id,product_id,name,sku,quantity,unit_price,unit_cost,tax_rate,line_total) values(o.id,(item->>'product_id')::uuid,item->>'name',item->>'sku',(item->>'quantity')::int,(item->>'unit_price')::numeric,(item->>'unit_cost')::numeric,(item->>'tax_rate')::numeric,(item->>'line_total')::numeric);
  update public.bp_products set stock_qty=stock_qty-(item->>'quantity')::int,updated_at=now() where id=(item->>'product_id')::uuid and track_stock;
  if found then insert into public.bp_stock_movements(product_id,delta,reason,order_id,actor) values((item->>'product_id')::uuid,-(item->>'quantity')::int,'sale',o.id,auth.uid());end if;
 end loop;
 insert into public.bp_invoices(source_kind,order_id,customer_name,customer_email,customer_phone,items,subtotal,tax,discount,delivery_fee,total,due_now)
 values('store',o.id,o.customer_name,o.customer_email,o.customer_phone,(select jsonb_agg(x-'unit_cost') from jsonb_array_elements(items)x),subtotal,tax,discount,shipping,o.total,o.total) returning * into i;
 if not p_online and o.total>0 then
  perform set_config('bp.pos_checkout','yes',true);
  for payment in select * from jsonb_array_elements(coalesce(p->'payments','[]')) loop
   amount=round((payment->>'amount')::numeric,2);paytotal=paytotal+amount;
   perform bp_private.post_payment(i.id,amount,payment->>'method',payment->>'reference',key||'-'||paytotal,'payment','',shift);
  end loop;
  perform set_config('bp.pos_checkout','no',true);
  if paytotal<>o.total then raise exception 'Payments must add up to the exact sale total.';end if;
  received=coalesce((p->>'cash_received')::numeric,0);
  if received<coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(p->'payments') x where x->>'method'='cash'),0) then raise exception 'Cash received is less than the cash payment.';end if;
 elsif not p_online then update public.bp_invoices set status='paid' where id=i.id;end if;
 perform bp_private.enqueue(i.id,'store','order-'||o.id);
 insert into public.bp_notifications(kind,title,body,entity_id) values('sale',case when p_online then 'New store order' else 'POS sale completed' end,'Order BP-'||lpad(o.number::text,6,'0'),o.id);
 insert into public.bp_audit(actor,action,entity_id,detail) values(auth.uid(),'sale_created',o.id,jsonb_build_object('total',o.total,'channel',o.channel));
 return jsonb_build_object('order_id',o.id,'number',o.number,'invoice_id',i.id,'access_token',i.access_token,'total',o.total,'change',greatest(0,coalesce(received,0)-coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(coalesce(p->'payments','[]'))x where x->>'method'='cash'),0)));
end;$$;
create or replace function bp_private.has_active_session() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.sessions where id=nullif(auth.jwt()->>'session_id','')::uuid and user_id=auth.uid() and (not_after is null or not_after>now()));$$;
revoke all on function bp_private.has_active_session() from public,anon;grant execute on function bp_private.has_active_session() to authenticated;
create or replace function public.bp_access_context() returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('is_admin',bp_private.is_admin(),'has_session',bp_private.has_active_session(),'can_pos',bp_private.operator('pos'),'can_book',bp_private.operator('booking'),'staff',(select to_jsonb(s) from public.bp_staff s where s.user_id=auth.uid()));$$;

commit;
