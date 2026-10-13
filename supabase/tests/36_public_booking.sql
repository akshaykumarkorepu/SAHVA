\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- The API calls these with the service role.
select set_config('request.jwt.claims', '{"role":"service_role"}', false);

do $t$
declare
  v_w     uuid := (select id from public.clinics where slug = 'sri-sai-warangal');
  v_doc   uuid;
  v_slot  timestamptz;
  v_slot2 timestamptz;
  v_appt  public.appointments;
  v_item  public.action_items;
  v_n     int;
  v_blocked boolean;
begin
  -- A free slot 3+ days ahead with any Sri Sai doctor.
  select d.id, s.slot_start into v_doc, v_slot
    from public.doctors d, generate_series(3, 10) g(i),
         lateral sahva.available_slots(d.id, (now() + make_interval(days => g.i))::date) s
   where d.clinic_id = v_w and d.is_active and s.remaining > 0
   order by g.i, s.slot_start limit 1;
  perform pg_temp.check('there is a free slot to request', v_slot is not null);
  select s.slot_start into v_slot2 from sahva.available_slots(v_doc, v_slot::date) s
   where s.remaining > 0 and s.slot_start > v_slot order by s.slot_start limit 1;

  v_blocked := false;
  begin
    perform public.request_public_booking(v_w, v_doc, 'Ravi', '12345', v_slot);
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('a real Indian mobile number is required', v_blocked);

  v_blocked := false;
  begin
    perform public.request_public_booking(v_w, v_doc, 'Ravi', '+919812300001', now() + interval '30 minutes');
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('requests need 2 hours notice, for a call-back', v_blocked);

  v_appt := public.request_public_booking(v_w, v_doc, 'New Visitor', '+919812300001', v_slot, 'Fever');
  perform pg_temp.check('the request holds the slot as a web booking', v_appt.status = 'booked' and v_appt.source = 'web');
  perform pg_temp.check('and is marked unverified', not v_appt.phone_verified);
  select * into v_item from public.action_items where related_appointment_id = v_appt.id;
  perform pg_temp.check('the clinic gets an urgent call-back item',
    v_item.type = 'online_request' and v_item.severity = 'high' and v_item.status = 'open' and v_item.payload->>'phone' = '+919812300001');

  v_blocked := false;
  begin
    perform public.request_public_booking(v_w, v_doc, 'New Visitor', '+919812300001', v_slot2);
  exception when unique_violation then v_blocked := true;
  end;
  perform pg_temp.check('one open request per number', v_blocked);

  v_blocked := false;
  begin
    perform public.request_public_booking(v_w, v_doc, 'Someone Else', '+919812300002', v_slot);
  exception when others then v_blocked := true;
  end;
  perform pg_temp.check('a held slot cannot be requested twice', v_blocked);

  -- The clinic calls and confirms.
  update public.appointments set status = 'confirmed' where id = v_appt.id returning * into v_appt;
  perform pg_temp.check('confirming verifies the booking', v_appt.phone_verified);
  select * into v_item from public.action_items where id = v_item.id;
  perform pg_temp.check('and resolves the call-back item', v_item.status = 'resolved' and v_item.resolved_at is not null);

  -- A request nobody confirms is released.
  v_appt := public.request_public_booking(v_w, v_doc, 'Silent Visitor', '+919812300003', v_slot2);
  update public.appointments set created_at = now() - interval '25 hours' where id = v_appt.id;
  v_n := public.expire_unverified_bookings();
  perform pg_temp.check('an unconfirmed request is released after 24 hours', v_n >= 1);
  select * into v_appt from public.appointments where id = v_appt.id;
  perform pg_temp.check('cancelled by the system, with a reason', v_appt.status = 'cancelled' and v_appt.cancelled_by = 'system');
  select count(*) into v_n from public.action_items where related_appointment_id = v_appt.id and status = 'dismissed';
  perform pg_temp.check('its call-back item is closed', v_n = 1);

  -- The clinic can turn the page's requests off.
  update public.clinic_settings set public_booking_enabled = false where clinic_id = v_w;
  v_blocked := false;
  begin
    perform public.request_public_booking(v_w, v_doc, 'Late Visitor', '+919812300004', v_slot2);
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('a clinic can switch requests off', v_blocked);
  update public.clinic_settings set public_booking_enabled = true where clinic_id = v_w;

  perform pg_temp.check('staff bookings stay verified', (select bool_and(phone_verified) from public.appointments where source <> 'web'));
end $t$;

select set_config('request.jwt.claims', '', false);

begin;
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = 'ravi@srisai.in'), 'role','authenticated')::text, true);
set local role authenticated;
do $t$ declare v_blocked boolean := false; begin
  begin
    perform public.request_public_booking((select id from public.clinics where slug = 'sri-sai-warangal'), null, 'x', '+919812300009', now() + interval '3 days');
  exception when insufficient_privilege then v_blocked := true;
  end;
  perform pg_temp.check('only the API (service role) can make requests', v_blocked);
end $t$;
commit;
