-- ============================================================================
-- SAHVA · 1450 · Dashboard views
-- All declared security_invoker = true so the caller's RLS applies. A view
-- without it runs as its owner and would leak every clinic's rows.
-- ============================================================================

-- Today's board, in clinic-local time.
create view public.v_todays_appointments
with (security_invoker = true) as
select
  a.id, a.clinic_id, a.starts_at, a.ends_at, a.status, a.source,
  a.reason, a.token_number,
  (a.starts_at at time zone c.timezone)::time as local_time,
  d.id   as doctor_id,   d.spoken_name as doctor_name, d.colour_hex,
  p.id   as patient_id,  p.full_name   as patient_name,
  p.phone_e164, p.preferred_language
from public.appointments a
join public.clinics  c on c.id = a.clinic_id
join public.doctors  d on d.id = a.doctor_id
join public.patients p on p.id = a.patient_id
where (a.starts_at at time zone c.timezone)::date = (now() at time zone c.timezone)::date
  and a.status <> 'cancelled';

-- Per-day call metrics. Backs the weekly chart and the missed-call counter.
create view public.v_call_metrics_daily
with (security_invoker = true) as
select
  c.clinic_id,
  (c.started_at at time zone cl.timezone)::date              as day,
  count(*)                                                    as total_calls,
  count(*) filter (where c.status = 'completed')              as answered,
  count(*) filter (where c.recovered_missed)                  as recovered_missed,
  count(*) filter (where c.outcome = 'booked')                as bookings,
  count(*) filter (where c.outcome = 'rescheduled')           as reschedules,
  count(*) filter (where c.escalated_to_human)                as escalations,
  count(*) filter (where c.primary_language = 'te')           as telugu_calls,
  count(*) filter (where c.primary_language = 'en')           as english_calls,
  round(avg(c.duration_sec) filter (where c.duration_sec is not null), 1) as avg_duration_sec,
  round(avg(c.stt_confidence_avg), 3)                         as avg_stt_confidence
from public.calls c
join public.clinics cl on cl.id = c.clinic_id
group by c.clinic_id, (c.started_at at time zone cl.timezone)::date;

-- Real cost per call. This is the table the pricing decision comes off.
create view public.v_call_costs
with (security_invoker = true) as
select
  c.id as call_id,
  c.clinic_id,
  c.started_at,
  c.duration_sec,
  c.outcome,
  coalesce(sum(u.cost_micro_inr), 0)                                   as cost_micro_inr,
  round(coalesce(sum(u.cost_micro_inr), 0) / 1000000.0, 4)             as cost_inr,
  coalesce(sum(u.cost_micro_inr) filter (where u.kind = 'stt_seconds'), 0)        as stt_micro_inr,
  coalesce(sum(u.cost_micro_inr) filter (where u.kind = 'tts_characters'), 0)     as tts_micro_inr,
  coalesce(sum(u.cost_micro_inr) filter (where u.kind in ('llm_input_tokens','llm_output_tokens')), 0) as llm_micro_inr,
  coalesce(sum(u.cost_micro_inr) filter (where u.kind = 'telephony_seconds'), 0)  as telephony_micro_inr
from public.calls c
left join public.usage_events u on u.call_id = c.id
group by c.id, c.clinic_id, c.started_at, c.duration_sec, c.outcome;

-- Monthly roll-up against the plan's included minutes.
create view public.v_clinic_monthly_usage
with (security_invoker = true) as
select
  u.clinic_id,
  date_trunc('month', u.occurred_at at time zone cl.timezone)::date as month,
  round(sum(u.cost_micro_inr) / 1000000.0, 2)                       as total_cost_inr,
  round(sum(u.quantity) filter (where u.kind = 'telephony_seconds') / 60.0, 1) as call_minutes,
  count(distinct u.call_id) filter (where u.call_id is not null)     as billable_calls
from public.usage_events u
join public.clinics cl on cl.id = u.clinic_id
group by u.clinic_id, date_trunc('month', u.occurred_at at time zone cl.timezone)::date;

-- The Action Required queue, ready to render.
create view public.v_open_action_items
with (security_invoker = true) as
select
  ai.id, ai.clinic_id, ai.type, ai.severity, ai.status, ai.title, ai.description,
  ai.due_by, ai.created_at, ai.assigned_to,
  ai.related_appointment_id, ai.related_call_id, ai.related_batch_id,
  d.spoken_name as doctor_name,
  p.full_name   as patient_name,
  p.phone_e164  as patient_phone,
  b.total_affected, b.notified_count, b.rebooked_count, b.status as batch_status,
  (ai.due_by is not null and ai.due_by < now()) as is_overdue
from public.action_items ai
left join public.doctors  d on d.id = ai.related_doctor_id
left join public.patients p on p.id = ai.related_patient_id
left join public.reschedule_batches b on b.id = ai.related_batch_id
where ai.status in ('open','in_progress');

-- Utilisation: offered capacity vs booked, per doctor per day.
create view public.v_doctor_utilisation
with (security_invoker = true) as
select
  a.clinic_id,
  a.doctor_id,
  d.spoken_name as doctor_name,
  (a.starts_at at time zone cl.timezone)::date as day,
  count(*) filter (where a.status in ('booked','confirmed','checked_in','completed')) as booked,
  count(*) filter (where a.status = 'completed')        as completed,
  count(*) filter (where a.status = 'no_show')          as no_shows,
  count(*) filter (where a.status = 'cancelled')        as cancellations,
  count(*) filter (where a.source = 'ai_call')          as ai_booked
from public.appointments a
join public.doctors d  on d.id  = a.doctor_id
join public.clinics cl on cl.id = a.clinic_id
group by a.clinic_id, a.doctor_id, d.spoken_name, (a.starts_at at time zone cl.timezone)::date;

comment on view public.v_call_costs is
  'Per-call vendor cost in micro-INR. Roadmap: measure this across the pilot before any price is quoted.';
