\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $s$
declare v_admin uuid; v_blocked boolean := false;
begin
  insert into auth.users (email, raw_user_meta_data) values ('ops@sahva.example', '{"account_type":"admin"}'::jsonb);
  v_admin := sahva.grant_platform_admin('ops@sahva.example', 'super_admin', 'Ops Admin');
  perform set_config('sahva_test.admin', v_admin::text, false);

  perform pg_temp.check('an admin account gets no staff profile',
    not exists (select 1 from public.staff_profiles where id = v_admin));

  insert into public.admin_audit_log (admin_user_id, action, target_type, target_id, reason)
  values (v_admin, 'admin.sign_in', null, null, null);

  begin
    insert into public.clinic_members (clinic_id, staff_id, role, status)
    select id, v_admin, 'owner', 'active' from public.clinics limit 1;
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('a platform admin cannot join a clinic', v_blocked);

  v_blocked := false;
  begin
    perform sahva.grant_platform_admin('ravi@srisai.in', 'support', 'Ravi');
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('a clinic owner cannot be made a platform admin', v_blocked);

  v_blocked := false;
  begin
    update public.admin_audit_log set reason = 'edited';
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('the admin audit log cannot be edited', v_blocked);

  v_blocked := false;
  begin
    perform sahva.grant_platform_admin('nobody@nowhere.example', 'support', 'Nobody');
  exception when others then v_blocked := true;
  end;
  perform pg_temp.check('granting admin to an unknown email fails loudly', v_blocked);
end $s$;

-- A clinic owner, signed in, sees nothing of either table.
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare v_blocked boolean := false;
begin
  begin
    perform count(*) from public.platform_admins;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot read the admin list', v_blocked);

  v_blocked := false;
  begin
    perform count(*) from public.admin_audit_log;
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot read the admin audit log', v_blocked);

  v_blocked := false;
  begin
    perform sahva.grant_platform_admin('ravi@srisai.in', 'super_admin', 'Ravi');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic user cannot make themselves an admin', v_blocked);
end $t$;
rollback;
