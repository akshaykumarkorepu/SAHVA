-- ============================================================================
-- SAHVA · 0100 · Foundation: extensions, private schema, enums, shared triggers
-- ============================================================================
-- Conventions used throughout this schema:
--   * All primary keys are uuid (no sequential ids leaking tenant volume).
--   * All timestamps are timestamptz, stored UTC. Clinic-local rendering uses
--     clinics.timezone. Never store naive local time.
--   * All money is an INTEGER count of paise (1 INR = 100 paise). No floats.
--     Sub-paise API costs use micro-INR (1 INR = 1_000_000) in usage_events.
--   * Every tenant-scoped table carries clinic_id directly (deliberate
--     denormalisation for RLS + dashboard filters — see docs/data-model.md).
--   * Cross-tenant mixing is prevented structurally with COMPOSITE foreign keys
--     (id, clinic_id) rather than application checks or triggers.
-- ============================================================================

create extension if not exists pgcrypto     with schema extensions;  -- gen_random_uuid
create extension if not exists btree_gist   with schema extensions;  -- uuid = inside EXCLUDE
create extension if not exists citext       with schema extensions;  -- case-insensitive email

-- Private schema for helper functions. Not exposed over PostgREST.
create schema if not exists sahva;
revoke all on schema sahva from public, anon, authenticated;
grant usage on schema sahva to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.language_code      as enum ('te', 'en', 'hi');
create type public.plan_code          as enum ('starter', 'growth', 'multi_branch');
create type public.subscription_status as enum ('trialing','active','past_due','paused','cancelled');

create type public.staff_role         as enum ('owner', 'manager', 'receptionist', 'doctor');
create type public.member_status      as enum ('invited', 'active', 'suspended');

create type public.sex                as enum ('male', 'female', 'other', 'unknown');

create type public.appointment_status as enum (
  'booked',           -- created, not yet acknowledged by patient
  'confirmed',        -- patient confirmed (WhatsApp/SMS reply or staff call)
  'checked_in',
  'completed',
  'cancelled',
  'no_show',
  'needs_reschedule'  -- doctor became unavailable; the Action Required state
);
create type public.booking_source     as enum ('ai_call','staff_manual','walk_in','whatsapp','web');
create type public.actor_type         as enum ('ai','staff','patient','doctor','system');
create type public.appointment_event  as enum (
  'created','confirmed','rescheduled','cancelled','checked_in',
  'completed','no_show','flagged_for_reschedule','reminder_sent'
);

create type public.telephony_provider as enum ('exotel','twilio','plivo','knowlarity','browser_demo');
create type public.call_direction     as enum ('inbound','outbound');
create type public.call_status        as enum ('in_progress','completed','missed','abandoned','failed','transferred');
create type public.call_outcome       as enum (
  'booked','rescheduled','cancelled','faq_answered',
  'escalated','no_action','unresolved'
);
create type public.call_intent        as enum ('book','reschedule','cancel','faq','emergency','other');
create type public.turn_role          as enum ('assistant','caller','system','tool');

create type public.time_off_kind      as enum ('leave','emergency','conference','hours_change','clinic_closed');

create type public.action_type        as enum (
  'reschedule_needed',    -- doctor unavailable, patients must be contacted
  'unrecognised_caller',  -- AI could not identify/confirm the caller
  'ai_escalation',        -- AI handed off (medical question, angry caller)
  'low_confidence_call',  -- poor STT confidence; verify the booking
  'failed_message',       -- WhatsApp/SMS delivery failed
  'booking_conflict',     -- backend rejected an AI booking attempt
  'missed_call_followup'  -- call dropped before resolution
);
create type public.action_severity    as enum ('low','normal','high','urgent');
create type public.action_status      as enum ('open','in_progress','resolved','dismissed');

create type public.batch_status       as enum ('draft','notifying','completed','cancelled');
create type public.batch_item_status  as enum ('pending','notified','rebooked','cancelled','unreachable');

create type public.message_channel    as enum ('whatsapp','sms','voice_callback');
create type public.message_direction  as enum ('outbound','inbound');
create type public.message_status     as enum ('queued','sending','sent','delivered','read','failed','undelivered');

create type public.usage_kind         as enum (
  'stt_seconds','tts_characters','llm_input_tokens','llm_output_tokens',
  'telephony_seconds','whatsapp_message','sms_message'
);

create type public.faq_category       as enum ('fees','timings','location','services','doctors','insurance','preparation','other');

-- Phase 2
create type public.note_status        as enum ('draft','finalised');
create type public.condition_status   as enum ('active','chronic','resolved');
create type public.vaccination_status as enum ('due','administered','overdue','skipped');
create type public.care_trigger       as enum ('after_appointment','chronic_medication','preventive_checkup','vaccination_due');
create type public.care_task_status   as enum ('pending','sent','completed','skipped','failed');
create type public.invoice_status     as enum ('draft','issued','paid','partially_paid','void');
create type public.payment_mode       as enum ('cash','upi','card','netbanking','other');

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function sahva.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on schema sahva is
  'Private helper schema: RLS predicates, scheduling logic, triggers. Not exposed via PostgREST.';
