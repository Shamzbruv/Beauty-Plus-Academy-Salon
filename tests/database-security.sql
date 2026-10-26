begin;
insert into public.bp_content(id,kind,title,status,data) values ('bp-qa-event','event','QA event','published','{"starts_at":"2027-01-01T15:00:00Z","price":1000,"capacity":1,"registration_open":true,"waitlist":true,"fields":[{"id":"q1","label":"Dietary needs","type":"select","required":true,"options":["None","Vegetarian"]}]}');
set local role anon;
insert into public.bp_submissions(id,kind,content_id,name,email,phone,amount,payment_method,payment_status,data) values ('00000000-0000-4000-8000-000000000001','event','bp-qa-event','QA One','bp-qa-one@example.com','8760000000',1,'bank','paid','{"answers":{"q1":"None"}}');
insert into public.bp_submissions(id,kind,content_id,name,email,phone,amount,payment_method,data) values ('00000000-0000-4000-8000-000000000002','event','bp-qa-event','QA Two','bp-qa-two@example.com','8760000000',1,'bank','{"answers":{"q1":"Vegetarian"}}');
do $$begin
 begin insert into public.bp_submissions(kind,content_id,name,email,payment_method,data) values('event','bp-qa-event','Missing Answer','bp-qa-missing@example.com','bank','{}');raise exception 'TEST FAILED required field accepted';exception when raise_exception then if sqlerrm like 'TEST FAILED%' then raise;end if;end;
 begin insert into public.bp_submissions(kind,content_id,name,email,payment_method,data) values('event','bp-qa-event','Duplicate Person','bp-qa-one@example.com','bank','{"answers":{"q1":"None"}}');raise exception 'TEST FAILED duplicate accepted';exception when unique_violation then null;end;
 begin perform * from public.bp_submissions;raise exception 'TEST FAILED private registrations exposed';exception when insufficient_privilege then null;end;
 begin update public.bp_content set title='Unauthorized' where id='bp-qa-event';raise exception 'TEST FAILED public editing accepted';exception when insufficient_privilege then null;end;
end$$;
reset role;
do $$begin
 if (select amount from public.bp_submissions where id='00000000-0000-4000-8000-000000000001')<>1000 then raise exception 'TEST FAILED price not recalculated';end if;
 if (select payment_status from public.bp_submissions where id='00000000-0000-4000-8000-000000000001')<>'pending' then raise exception 'TEST FAILED paid status forgery';end if;
 if (select status from public.bp_submissions where id='00000000-0000-4000-8000-000000000002')<>'waitlisted' then raise exception 'TEST FAILED capacity not enforced';end if;
 if (select jsonb_array_length(form_snapshot) from public.bp_submissions where id='00000000-0000-4000-8000-000000000001')<>1 then raise exception 'TEST FAILED form snapshot missing';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000099","role":"authenticated","email":"intruder@example.com","user_metadata":{"is_admin":true}}',true);
do $$begin
 if public.bp_is_admin() then raise exception 'TEST FAILED fake admin metadata accepted';end if;
 if (select count(*) from public.bp_submissions)>0 then raise exception 'TEST FAILED nonadmin can read attendees';end if;
 if (select count(*) from public.bp_admins)>0 then raise exception 'TEST FAILED admin allowlist exposed';end if;
 exception when insufficient_privilege then null;
end$$;
reset role;
select 'PASS: server pricing, payment forgery prevention, required fields, duplicate registration, capacity/waitlist, form snapshots, public editing blocked, private registrations, untrusted metadata denied' as result;
rollback;
