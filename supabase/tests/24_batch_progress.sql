\set ON_ERROR_STOP on
create or replace function pg_temp.check(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label; end if;
end $$;

-- ---------------------------------------------------------------------------
-- Geeta (receptionist, Warangal) works Dr Anitha's reschedule batch end to end.
-- ---------------------------------------------------------------------------
begin;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email='geeta@srisai.in'),
                    'role','authenticated')::text, true);
set local role authenticated;
do $t$
declare
  v_batch   public.reschedule_batches;
  v_first   public.reschedule_batch_items;
  v_item    public.reschedule_batch_items;
  v_slot    timestamptz;
  v_new     public.appointments;
  v_n       int;
  v_blocked boolean := false;
  v_day     date;
begin
  select * into v_batch from public.reschedule_batches where status = 'draft' order by created_at desc limit 1;
  perform pg_temp.check('a draft batch with several patients exists', v_batch.total_affected >= 2);

  select * into v_first from public.reschedule_batch_items
   where batch_id = v_batch.id order by created_at limit 1;

  -- Contact cannot be recorded before a named person approves the batch.
  begin
    update public.reschedule_batch_items set status = 'unreachable' where id = v_first.id;
  exception when check_violation then v_blocked := true;
  end;
  perform pg_temp.check('no contact recorded while the batch is a draft', v_blocked);

  -- A patient rebooking is the truth whenever it happens — even before approval.
  for v_day in select generate_series(v_batch.window_end::date + 1, v_batch.window_end::date + 14, '1 day')::date loop
    select slot_start into v_slot from public.get_available_slots(v_batch.doctor_id, v_day) limit 1;
    exit when v_slot is not null;
  end loop;
  perform pg_temp.check('the doctor has a free slot after the leave', v_slot is not null);

  v_new := public.reschedule_appointment(v_first.appointment_id, v_slot, null, 'staff');
  select * into v_item from public.reschedule_batch_items where id = v_first.id;
  perform pg_temp.check('rebooking marks the batch item rebooked', v_item.status = 'rebooked');
  perform pg_temp.check('the item points at the new appointment', v_item.new_appointment_id = v_new.id);

  select * into v_batch from public.reschedule_batches where id = v_batch.id;
  perform pg_temp.check('batch counts the rebook', v_batch.rebooked_count = 1 and v_batch.notified_count = 1);

  -- A double-click on Rebook must not book the patient twice.
  v_blocked := false;
  begin
    perform public.reschedule_appointment(v_first.appointment_id, v_slot + interval '1 hour', null, 'staff');
  exception when invalid_parameter_value then v_blocked := true;
  end;
  perform pg_temp.check('an already-rebooked appointment cannot be rebooked again', v_blocked);
  select count(*) into v_n from public.appointments where rescheduled_from_id = v_first.appointment_id;
  perform pg_temp.check('exactly one replacement appointment exists', v_n = 1);

  -- Approve, as the API does.
  update public.reschedule_batches
     set status = 'notifying', dispatched_by = auth.uid(), dispatched_at = now()
   where id = v_batch.id;

  -- Told by phone: still open, the patient has not picked a time.
  select * into v_item from public.reschedule_batch_items
   where batch_id = v_batch.id and status = 'pending' order by created_at limit 1;
  update public.reschedule_batch_items set status = 'notified' where id = v_item.id;
  select * into v_batch from public.reschedule_batches where id = v_batch.id;
  perform pg_temp.check('a told-but-not-rebooked patient keeps the batch open', v_batch.status = 'notifying');
  perform pg_temp.check('told patients are counted', v_batch.notified_count = 2);

  -- Everyone else is unreachable: nobody is left waiting, so it closes.
  update public.reschedule_batch_items set status = 'unreachable'
   where batch_id = v_batch.id and status in ('pending', 'notified');
  select * into v_batch from public.reschedule_batches where id = v_batch.id;
  perform pg_temp.check('the batch completes when nobody is left waiting', v_batch.status = 'completed');

  select count(*) into v_n from public.action_items
   where related_batch_id = v_batch.id and status = 'resolved' and resolved_at is not null;
  perform pg_temp.check('its Action Required item resolves itself', v_n = 1);
end $t$;
rollback;
