-- ============================================================================
-- SAHVA · Patients book from their own page
--
-- A signed-in patient can see their clinic's doctors and book a free slot.
-- Bookings go through book_appointment() with source 'web', so availability,
-- the double-booking constraint and the "clinic must be live" guard all
-- apply exactly as for the AI and the front desk. The owner can turn online
-- booking off; it is on by default, like rescheduling from the portal.
-- ============================================================================
alter table public.clinic_settings
  add column patient_may_book boolean not null default true;

comment on column public.clinic_settings.patient_may_book is
  'Signed-in patients may book a new appointment from their page (source web).';
