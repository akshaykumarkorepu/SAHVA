\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- Two clinics, two staff. Ravi runs Warangal; Suresh runs Karimnagar.
do $s$
declare v_w uuid; v_k uuid; v_ravi uuid; v_suresh uuid; v_recep uuid;
begin
  select id into v_w from public.clinics where slug = 'sri-sai-warangal';

  insert into public.clinics (slug, name, phone_e164, city)
  values ('krishna-karimnagar','Krishna Clinic','+918712223333','Karimnagar')
  on conflict (slug) do update set name = excluded.name returning id into v_k;

  insert into auth.users (email, raw_user_meta_data)
  values ('ravi@srisai.in',   '{"full_name":"Ravi Kumar"}'::jsonb)   returning id into v_ravi;
  insert into auth.users (email, raw_user_meta_data)
  values ('suresh@krishna.in','{"full_name":"Suresh Babu"}'::jsonb)  returning id into v_suresh;
  insert into auth.users (email, raw_user_meta_data)
  values ('geeta@srisai.in',  '{"full_name":"Geeta"}'::jsonb)        returning id into v_recep;

  insert into public.clinic_members (clinic_id, staff_id, role, status, joined_at)
  values (v_w, v_ravi,  'owner',       'active', now()),
         (v_k, v_suresh,'owner',       'active', now()),
         (v_w, v_recep, 'receptionist','active', now());

  -- Give Karimnagar a patient of its own to look for.
  insert into public.patients (clinic_id, full_name, phone_e164)
  values (v_k, 'Karimnagar Patient', '+919222222222');

  perform pg_temp.check('auth trigger auto-created staff_profiles',
    (select count(*) from public.staff_profiles where id in (v_ravi, v_suresh, v_recep)) = 3);
end $s$;

