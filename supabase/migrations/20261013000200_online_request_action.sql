-- ============================================================================
-- SAHVA · A new Action Required kind: a booking request from the clinic's
-- public page, waiting for the clinic to call the patient back. Its own file:
-- a new enum value cannot be used in the transaction that adds it.
-- ============================================================================
alter type public.action_type add value if not exists 'online_request';
