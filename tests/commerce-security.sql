begin;
-- All fixture identities, roles, products, receipts and jobs exist only in this
-- transaction and are rolled back. No account API or email service is invoked.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','authenticated','authenticated','bp-owner-fixture@example.com',now(),'{}','{}'),
('10000000-0000-4000-8000-000000000002','authenticated','authenticated','bp-staff-fixture@example.com',now(),'{}','{}');
insert into public.bp_admins(email) values('bp-owner-fixture@example.com');
insert into auth.sessions(id,user_id,created_at,updated_at) values('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',now(),now());
insert into public.bp_staff(user_id,name,email,active,force_password_change) values('10000000-0000-4000-8000-000000000002','Fixture cashier','bp-staff-fixture@example.com',true,false);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select public.bp_command('save_product','{"id":"30000000-0000-4000-8000-000000000001","name":"Fixture shampoo","sku":"BP-QA-SHAMPOO","price":1000,"unit_cost":400,"tax_rate":15,"stock_qty":5,"status":"published","track_stock":true}');
select public.bp_command('shift_open','{"opening_cash":1000}');
select public.bp_command('sale','{"key":"40000000-0000-4000-8000-000000000001","items":[{"id":"30000000-0000-4000-8000-000000000001","qty":2}],"discount":100,"email":"bp-pos-fixture@example.com","payments":[{"method":"cash","amount":1200},{"method":"bank","amount":1000}],"cash_received":1500}');
do $$declare o public.bp_orders;i public.bp_invoices;d jsonb;beforeqty int;lineid uuid;begin
 select * into o from public.bp_orders where idempotency_key='40000000-0000-4000-8000-000000000001';select * into i from public.bp_invoices where order_id=o.id;
 if o.total<>2200 or i.paid<>2200 then raise exception 'FAIL server totals or split payment';end if;
 if (select stock_qty from public.bp_products where id='30000000-0000-4000-8000-000000000001')<>3 then raise exception 'FAIL stock decrement';end if;
 perform public.bp_command('sale','{"key":"40000000-0000-4000-8000-000000000001","items":[{"id":"30000000-0000-4000-8000-000000000001","qty":2}],"payments":[]}');
 if (select stock_qty from public.bp_products where id='30000000-0000-4000-8000-000000000001')<>3 then raise exception 'FAIL duplicate sale';end if;
 begin perform public.bp_command('sale','{"key":"40000000-0000-4000-8000-000000000099","items":[{"id":"30000000-0000-4000-8000-000000000001","qty":100}],"payments":[]}');raise exception 'FAIL overselling accepted';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 select id into lineid from public.bp_order_items where order_id=o.id;
 d=jsonb_build_object('id',o.id,'key','refund-fixture-1','items',jsonb_build_array(jsonb_build_object('id',lineid,'qty',1)),'restock',true,'method','bank','reason','Fixture return');
 perform public.bp_command('refund_order',d);perform public.bp_command('refund_order',d);
 if (select stock_qty from public.bp_products where id='30000000-0000-4000-8000-000000000001')<>4 then raise exception 'FAIL idempotent refund stock';end if;
 if (select refunded from public.bp_invoices where id=i.id)<>1100 then raise exception 'FAIL proportional refund';end if;
 d=public.bp_command('finance',jsonb_build_object('from',(now() at time zone 'America/Jamaica')::date,'to',(now() at time zone 'America/Jamaica')::date));
 if (d->>'net_received')::numeric<>1100 then raise exception 'FAIL financial totals';end if;
 if (select count(*) from public.bp_email_outbox where invoice_id=i.id and template_id='store')<>1 or exists(select 1 from public.bp_email_outbox where invoice_id=i.id and template_id='receipt') then raise exception 'FAIL duplicate split-payment emails';end if;
 perform public.bp_command('refund_invoice',jsonb_build_object('invoice_id',i.id,'amount',100,'method','cash','key','fixture-cash-adjustment','reason','Fixture cash adjustment'));
 select id into lineid from public.bp_shifts where operator_id='10000000-0000-4000-8000-000000000001' and closed_at is null;
 d=public.bp_command('shift_close',jsonb_build_object('id',lineid,'counted_cash',2100));
 if (d->>'expected_cash')::numeric<>2100 then raise exception 'FAIL cash refund till reconciliation';end if;

end$$;
-- Full customer lifecycle, with fixed fixture catalog and rollback-only records.
insert into public.bp_content(id,kind,title,status,data) values
('bp-qa-service','service','Fixture appointment','published','{"price":4000,"duration_minutes":60}'),
('bp-qa-service-2','service','Fixture second service','published','{"price":6000,"duration_minutes":60}'),
('bp-qa-course','course','Fixture course','published','{"price":20000,"kit_price":25000}');
update public.bp_content set data=data||'{"booking_days":[1,2,3,4,5,6,7],"booking_capacity":1,"blackout_dates":[]}'::jsonb where id='shop-settings';
insert into public.bp_deliveries(id,name,type,fee,areas)values('30000000-0000-4000-8000-000000000002','Fixture local delivery','delivery',500,'{Kingston}');
select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$declare d date=(now() at time zone 'America/Jamaica')::date+14;r jsonb;begin
 insert into public.bp_submissions(id,kind,content_id,name,email,phone,payment_method,amount,payment_status,data,client_token)
 values('50000000-0000-4000-8000-000000000001','booking','bp-qa-service','Fixture visitor','bp-visit-fixture@example.com','8760000000','bank',1,'paid',jsonb_build_object('date',d,'time','10:00'),'60000000-0000-4000-8000-000000000001');
 r=public.bp_command('slots',jsonb_build_object('date',d,'service_id','bp-qa-service-2'));
 if r ? '10:00' or r ? '10:30' then raise exception 'FAIL occupied slots advertised';end if;
 begin insert into public.bp_submissions(kind,content_id,name,email,phone,payment_method,data)values('booking','bp-qa-service-2','Overlapping customer','bp-overlap@example.com','8760000000','bank',jsonb_build_object('date',d,'time','10:30'));raise exception 'FAIL overlap accepted';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin insert into public.bp_submissions(kind,content_id,name,email,phone,payment_method,data)values('booking','bp-qa-service','No time customer','bp-notime@example.com','8760000000','bank',jsonb_build_object('date',d,'time','Flexible'));raise exception 'FAIL unallocated booking accepted';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 r=public.bp_command('receipt','{"id":"50000000-0000-4000-8000-000000000001","token":"60000000-0000-4000-8000-000000000001"}');
 if (r->>'amount')::numeric<>2000 or (r->>'total')::numeric<>4000 or r->>'payment_status'<>'unpaid' then raise exception 'FAIL booking invoice or deposit';end if;
 begin perform public.bp_command('receipt','{"id":"50000000-0000-4000-8000-000000000001","token":"00000000-0000-4000-8000-000000000000"}');raise exception 'FAIL wrong receipt capability';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.bp_server_command('config','{}');raise exception 'FAIL browser server command';exception when insufficient_privilege then null;end;
 begin perform public.bp_command('staff_get','{"user_id":"10000000-0000-4000-8000-000000000002"}');raise exception 'FAIL internal staff action public';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 insert into public.bp_submissions(id,kind,content_id,name,email,phone,payment_method,amount,data,client_token)values('50000000-0000-4000-8000-000000000002','enrollment','bp-qa-course','Fixture learner','bp-course-fixture@example.com','8760000000','bank',1,'{"kit":true}','60000000-0000-4000-8000-000000000002');
 r=public.bp_command('receipt','{"id":"50000000-0000-4000-8000-000000000002","token":"60000000-0000-4000-8000-000000000002"}');
 insert into public.bp_submissions(id,kind,content_id,name,email,phone,payment_method,amount,data)values('50000000-0000-4000-8000-000000000003','tuition','bp-qa-course','Fixture learner','bp-course-fixture@example.com','8760000000','bank',10000,jsonb_build_object('enrollment_token',r->>'access_token'));
 begin insert into public.bp_submissions(kind,content_id,name,email,phone,payment_method,amount,data)values('tuition','bp-qa-course','Imposter','bp-course-fixture@example.com','8760000000','bank',10000,'{}');raise exception 'FAIL enrollment email exposed invoice';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 r=public.bp_command('order','{"key":"40000000-0000-4000-8000-000000000002","items":[{"id":"30000000-0000-4000-8000-000000000001","qty":1,"price":1}],"delivery_id":"30000000-0000-4000-8000-000000000002","name":"Fixture shopper","email":"bp-shop-fixture@example.com","phone":"8760000000","address":"1 Fixture Street","area":"Kingston","payment_method":"bank"}');
 if (r->>'total')::numeric<>1650 then raise exception 'FAIL online delivery or authoritative price';end if;
 begin perform public.bp_command('order','{"key":"40000000-0000-4000-8000-000000000003","items":[{"id":"30000000-0000-4000-8000-000000000001","qty":1}],"delivery_id":"30000000-0000-4000-8000-000000000002","name":"Fixture shopper","email":"bp-shop-fixture@example.com","phone":"8760000000","address":"1 Fixture Street","area":"Unknown","payment_method":"bank"}');raise exception 'FAIL delivery coverage ignored';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
end$$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$declare b public.bp_invoices;c public.bp_invoices;t public.bp_invoices;r jsonb;o uuid;begin
 select * into b from public.bp_invoices where submission_id='50000000-0000-4000-8000-000000000001';
 if (select count(*) from public.bp_email_outbox where invoice_id=b.id and template_id='booking')<>1 then raise exception 'FAIL booking invoice email queue';end if;
 perform public.bp_command('payment',jsonb_build_object('invoice_id',b.id,'amount',2000,'method','bank','key','booking-fixture-deposit'));
 if (select payment_status from public.bp_submissions where id=b.submission_id)<>'paid' or (select status from public.bp_invoices where id=b.id)<>'partial' then raise exception 'FAIL deposit status sync';end if;
 select * into c from public.bp_invoices where submission_id='50000000-0000-4000-8000-000000000002';
 t=bp_private.invoice_for('50000000-0000-4000-8000-000000000003');
 if c.id<>t.id or c.total<>30000 or c.due_now<>10000 then raise exception 'FAIL course and tuition invoice ledger';end if;
 select id into o from public.bp_orders where idempotency_key='40000000-0000-4000-8000-000000000002';
 perform public.bp_command('order_status',jsonb_build_object('id',o,'status','cancelled'));perform public.bp_command('order_status',jsonb_build_object('id',o,'status','cancelled'));
 if (select stock_qty from public.bp_products where id='30000000-0000-4000-8000-000000000001')<>4 or (select status from public.bp_invoices where order_id=o)<>'void' then raise exception 'FAIL cancellation stock/idempotency';end if;
end$$;

select set_config('request.jwt.claims','{}',true);
set local role anon;
do $$begin
 begin perform public.bp_command('save_product','{}');raise exception 'FAIL anon product write';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform public.bp_command('finance','{}');raise exception 'FAIL anon finances';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
 begin perform * from public.bp_invoices;raise exception 'FAIL public invoice list';exception when insufficient_privilege then null;end;
 if public.bp_command('document','{"token":"00000000-0000-4000-8000-000000000000"}') is not null then raise exception 'FAIL invoice token';end if;
end$$;
reset role;
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated","session_id":"20000000-0000-4000-8000-000000000002"}',true);
set local role authenticated;
do $$begin
 if not (public.bp_access_context()->>'can_pos')::boolean then raise exception 'FAIL employee POS role';end if;
 if (select count(*) from public.bp_invoices)>0 then raise exception 'FAIL staff finance list';end if;
 begin perform public.bp_command('finance','{}');raise exception 'FAIL employee finances';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
end$$;
reset role;
set local role service_role;
select public.bp_server_command('staff_save','{"user_id":"10000000-0000-4000-8000-000000000002","name":"Fixture cashier","email":"bp-staff-fixture@example.com","active":false,"actor":"10000000-0000-4000-8000-000000000001"}');
do $$begin
 begin perform public.bp_server_command('staff_save','{"user_id":"10000000-0000-4000-8000-000000000001","name":"Owner takeover","email":"bp-owner-fixture@example.com"}');raise exception 'FAIL owner changed as employee';exception when raise_exception then if sqlerrm like 'FAIL%' then raise;end if;end;
end$$;
reset role;
set local role authenticated;
do $$begin if (public.bp_access_context()->>'can_pos')::boolean or (public.bp_access_context()->>'has_session')::boolean then raise exception 'FAIL disabled account session';end if;end$$;
reset role;
set local role service_role;
do $$declare claimed jsonb;again jsonb;begin
 claimed=public.bp_server_command('claim_emails','{}');again=public.bp_server_command('claim_emails','{}');
 if jsonb_array_length(claimed)=0 or jsonb_array_length(again)<>0 then raise exception 'FAIL email queue leases';end if;
end$$;
reset role;
select 'PASS: transactional inventory, split tenders, idempotency, refunds, finance totals, public and employee permission isolation, immediate deactivation, booking availability/deposits, shared course ledger, delivery coverage and cancellation' as result;
rollback;
