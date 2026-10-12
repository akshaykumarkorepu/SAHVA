\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

do $t$
declare
  v_n int;
  v_clinic uuid; v_doc uuid; v_other uuid;
  v_day date; v_slots timestamptz[]; v_one timestamptz;
  a1 public.appointments; a2 public.appointments; a3 public.appointments; b1 public.appointments;
begin
  select count(*) into v_n from public.appointments where token_number is null;
  perform pg_temp.check('every existing appointment has a token after the backfill', v_n = 0);

  select count(*) into v_n from (
    select a.doctor_id, (a.starts_at at time zone c.timezone)::date, a.token_number
      from public.appointments a join public.clinics c on c.id = a.clinic_id
     group by 1, 2, 3 having count(*) > 1
  ) dup;
  perform pg_temp.check('no doctor has the same token twice on a day', v_n = 0);

  select id into v_clinic from public.clinics where slug = 'sri-sai-warangal';
  select id into v_doc from public.doctors where clinic_id = v_clinic order by spoken_name limit 1;
  select id into v_other from public.doctors where clinic_id = v_clinic and id <> v_doc order by spoken_name limit 1;

  -- A working day far enough out to be empty, with at least three free slots.
  for v_day in select generate_series(current_date + 20, current_date + 40, '1 day')::date loop
    select array_agg(slot_start order by slot_start) into v_slots from public.get_available_slots(v_doc, v_day);
    exit when coalesce(array_length(v_slots, 1), 0) >= 3
          and exists (select 1 from public.get_available_slots(v_other, v_day));
  end loop;

  -- Booked out of time order: tokens follow booking order, not slot order.
  a1 := public.book_appointment(v_clinic, v_doc, 'Token One',   '+919000000101', v_slots[3], null, null, 'staff_manual');
  a2 := public.book_appointment(v_clinic, v_doc, 'Token Two',   '+919000000102', v_slots[1], null, null, 'walk_in');
  a3 := public.book_appointment(v_clinic, v_doc, 'Token Three', '+919000000103', v_slots[2], null, null, 'ai_call');
  perform pg_temp.check('first booking of the day is token 1', a1.token_number = 1);
  perform pg_temp.check('tokens follow booking order, not slot time', a2.token_number = 2 and a3.token_number = 3);

  select slot_start into v_one from public.get_available_slots(v_other, v_day) order by slot_start limit 1;
  b1 := public.book_appointment(v_clinic, v_other, 'Other Doctor', '+919000000104', v_one, null, null, 'staff_manual');
  perform pg_temp.check('each doctor has their own sequence', b1.token_number = 1);

  -- A cancelled token is not reused: the next patient must not share a number
  -- with someone already told it.
  perform public.cancel_appointment(a3.id, 'staff', 'test');
  select array_agg(slot_start order by slot_start) into v_slots from public.get_available_slots(v_doc, v_day);
  a3 := public.book_appointment(v_clinic, v_doc, 'Token Four', '+919000000105', v_slots[1], null, null, 'staff_manual');
  perform pg_temp.check('a cancelled token is never handed out again', a3.token_number = 4);

  -- A token, once given, does not change.
  select token_number into v_n from public.appointments where id = a1.id;
  perform pg_temp.check('an assigned token is stable', v_n = 1);
end
$t$;
