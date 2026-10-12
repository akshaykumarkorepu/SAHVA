-- ============================================================================
-- SAHVA · 'support' as an actor: SAHVA staff reading a record the clinic
-- opened to them (see 001700). Its own file: a new enum value cannot be used
-- in the transaction that adds it.
-- ============================================================================
alter type public.actor_type add value if not exists 'support';
