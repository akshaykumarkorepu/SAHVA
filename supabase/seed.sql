-- ============================================================================
-- SAHVA · seed
-- One pilot clinic (Sri Sai Clinic, Warangal) with enough real-shaped data to
-- drive the dashboard, plus a live demonstration of the Action Required flow.
-- Safe to re-run: every insert is keyed and idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Global reference data
-- ---------------------------------------------------------------------------
-- The single plan sold, matching migration 20261012000700. Older tiers are
-- not seeded: they were placeholders and nothing references them.
insert into public.plans (code, name, monthly_price_paise, yearly_price_paise, included_call_minutes,
                          overage_per_min_paise, max_doctors, sort_order, features)
values
  ('starter','SAHVA for Clinics', 199900, 999900, 0, 0, null, 1,
   '{"ai_receptionist":true,"whatsapp_confirmations":true,"dashboard":true,"analytics":true}'::jsonb)
on conflict (code) do nothing;

insert into public.vaccine_catalogue (code, name, recommended_age_weeks, dose_number, sort_order) values
  ('BCG','BCG',0,1,1), ('HEPB_0','Hepatitis B - birth dose',0,1,2),
  ('OPV_0','OPV 0',0,1,3), ('PENTA_1','Pentavalent 1',6,1,4),
  ('PENTA_2','Pentavalent 2',10,2,5), ('PENTA_3','Pentavalent 3',14,3,6),
  ('MR_1','Measles-Rubella 1',36,1,7), ('DPT_B1','DPT Booster 1',68,1,8)
on conflict (code) do nothing;

-- Sahva-provided default templates (clinic_id null). Clinics may override.
insert into public.message_templates (clinic_id, key, channel, language, body, variables) values
  (null,'appointment_confirmed','whatsapp','en',
   'Namaste {{patient_name}}, your appointment with {{doctor_name}} at {{clinic_name}} is confirmed for {{date_time}}. Reply CANCEL to cancel.',
   '{patient_name,doctor_name,clinic_name,date_time}'),
  (null,'appointment_confirmed','whatsapp','te',
   'నమస్తే {{patient_name}} గారు, {{clinic_name}}లో {{doctor_name}} గారితో మీ అపాయింట్‌మెంట్ {{date_time}}కి నిర్ధారించబడింది.',
   '{patient_name,doctor_name,clinic_name,date_time}'),
  (null,'appointment_reminder','whatsapp','te',
   'గుర్తుచేయడం: రేపు {{date_time}}కి {{doctor_name}} గారితో మీ అపాయింట్‌మెంట్ ఉంది. {{clinic_name}}',
   '{doctor_name,clinic_name,date_time}'),
  (null,'reschedule_needed','whatsapp','te',
   'క్షమించండి, {{doctor_name}} గారు {{date_time}}కి అందుబాటులో లేరు. కొత్త సమయం కోసం దయచేసి {{clinic_phone}}కి కాల్ చేయండి. {{clinic_name}}',
   '{doctor_name,clinic_name,clinic_phone,date_time}'),
  (null,'reschedule_needed','whatsapp','en',
   'We are sorry — {{doctor_name}} is unavailable on {{date_time}}. Please call {{clinic_phone}} to pick a new time. {{clinic_name}}',
   '{doctor_name,clinic_name,clinic_phone,date_time}')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The pilot clinic
-- ---------------------------------------------------------------------------
do $seed$
declare
  v_clinic  uuid;
  v_anitha  uuid;
  v_ramesh  uuid;
  v_kavitha uuid;
  v_p       uuid;
  v_appt    uuid;
  v_call    uuid;
  d         int;
  tz        text := 'Asia/Kolkata';
  today     date := (now() at time zone 'Asia/Kolkata')::date;
begin
  -- Clinic ------------------------------------------------------------------
  insert into public.clinics (slug, name, legal_name, phone_e164, whatsapp_e164, support_email,
                              address_line, landmark, city, district, state, pincode,
                              timezone, default_language, supported_languages, onboarded_at,
                              verification_status)
  values ('sri-sai-warangal','Sri Sai Clinic','Sri Sai Poly Clinic',
          '+918702345678','+918702345678','frontdesk@srisaiclinic.in',
          '2-4-118, Station Road','Opposite Hanamkonda bus stand','Warangal','Hanamkonda',
          'Telangana','506001', tz, 'te', '{te,en}', now() - interval '40 days',
          'approved')  -- an established clinic, as if reviewed before verification existed
  on conflict (slug) do update set name = excluded.name
  returning id into v_clinic;

  insert into public.clinic_settings (clinic_id, greeting_te, greeting_en, escalation_phone_e164,
                                      ai_may_cancel, min_notice_minutes, booking_horizon_days)
  values (v_clinic,
          'నమస్తే, శ్రీ సాయి క్లినిక్‌కి స్వాగతం. నేను మాయ. మీకు ఎలా సహాయం చేయగలను?',
          'Namaste, welcome to Sri Sai Clinic. This is Maya. How may I help you?',
          '+919849012345', false, 30, 30)
  on conflict (clinic_id) do nothing;

  -- Clinic hours: Mon-Sat, split morning/evening. Closed Sunday.
  for d in 1..6 loop
    insert into public.clinic_hours (clinic_id, day_of_week, opens_at, closes_at, label)
    values (v_clinic, d, '09:00', '13:00', 'Morning'),
           (v_clinic, d, '17:00', '20:00', 'Evening')
    on conflict (clinic_id, day_of_week, opens_at) do nothing;
  end loop;

  insert into public.clinic_closures (clinic_id, starts_on, ends_on, reason)
  values (v_clinic, today + 45, today + 46, 'Sankranti holiday')
  on conflict do nothing;

  -- Doctors -----------------------------------------------------------------
  insert into public.doctors (clinic_id, full_name, spoken_name, specialty, qualifications,
                              languages, consult_duration_min, consult_fee_paise, followup_fee_paise,
                              colour_hex, sort_order)
  select v_clinic,'Dr. Anitha Reddy','Dr Anitha','General Physician','MBBS, MD',
          '{te,en}', 15, 30000, 15000, '#2F6BFF', 1
   where not exists (select 1 from public.doctors
                      where clinic_id = v_clinic and spoken_name = 'Dr Anitha');
  select id into v_anitha from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Anitha';

  insert into public.doctors (clinic_id, full_name, spoken_name, specialty, qualifications,
                              languages, consult_duration_min, consult_fee_paise, followup_fee_paise,
                              colour_hex, sort_order)
  select v_clinic,'Dr. Ramesh Babu','Dr Ramesh','Paediatrician','MBBS, DCH',
          '{te,en,hi}', 20, 35000, 20000, '#12B886', 2
   where not exists (select 1 from public.doctors
                      where clinic_id = v_clinic and spoken_name = 'Dr Ramesh');
  select id into v_ramesh from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Ramesh';

  insert into public.doctors (clinic_id, full_name, spoken_name, specialty, qualifications,
                              languages, consult_duration_min, consult_fee_paise, followup_fee_paise,
                              colour_hex, sort_order)
  select v_clinic,'Dr. Kavitha Rao','Dr Kavitha','Dentist','BDS, MDS',
          '{te,en}', 30, 40000, 25000, '#F08C00', 3
   where not exists (select 1 from public.doctors
                      where clinic_id = v_clinic and spoken_name = 'Dr Kavitha');
  select id into v_kavitha from public.doctors where clinic_id = v_clinic and spoken_name = 'Dr Kavitha';

  -- Weekly sessions. Anitha: Mon-Sat both shifts. Ramesh: Mon-Sat mornings.
  -- Kavitha: Tue/Thu/Sat evenings only — the "specialised days" case the AI
  -- must answer correctly instead of assuming everyone works every day.
  for d in 1..6 loop
    insert into public.doctor_sessions (clinic_id, doctor_id, day_of_week, starts_at, ends_at, label)
    values (v_clinic, v_anitha, d, '09:00', '13:00', 'Morning'),
           (v_clinic, v_anitha, d, '17:00', '20:00', 'Evening'),
           (v_clinic, v_ramesh, d, '09:30', '12:30', 'Morning')
    on conflict (doctor_id, day_of_week, starts_at, effective_from) do nothing;
  end loop;

  foreach d in array array[2,4,6] loop
    insert into public.doctor_sessions (clinic_id, doctor_id, day_of_week, starts_at, ends_at, label)
    values (v_clinic, v_kavitha, d, '17:00', '20:00', 'Evening')
    on conflict (doctor_id, day_of_week, starts_at, effective_from) do nothing;
  end loop;

  -- Services and FAQs -------------------------------------------------------
  insert into public.clinic_services (clinic_id, name_en, name_te, price_paise, duration_min, category, sort_order)
  values
    (v_clinic,'General consultation','సాధారణ సంప్రదింపు',30000,15,'consultation',1),
    (v_clinic,'Child vaccination','పిల్లల టీకా',60000,20,'paediatrics',2),
    (v_clinic,'Dental scaling','దంత శుభ్రపరచడం',150000,45,'dental',3),
    (v_clinic,'Blood pressure check','రక్తపోటు తనిఖీ',10000,10,'diagnostics',4)
  on conflict (clinic_id, lower(name_en)) do nothing;

  if not exists (select 1 from public.clinic_faqs where clinic_id = v_clinic) then
    insert into public.clinic_faqs (clinic_id, question_en, question_te, answer_en, answer_te, category, keywords, priority)
    values
      (v_clinic,'What are the consultation fees?','సంప్రదింపు ఫీజు ఎంత?',
       'General consultation is Rs 300. Paediatric consultation is Rs 350. Dental consultation is Rs 400.',
       'సాధారణ సంప్రదింపు రూ.300. పిల్లల వైద్యం రూ.350. దంత వైద్యం రూ.400.',
       'fees','{fee,fees,charge,cost,ఫీజు,ఖర్చు}',10),
      (v_clinic,'What are your timings?','మీ సమయాలు ఏమిటి?',
       'We are open Monday to Saturday, 9 AM to 1 PM and 5 PM to 8 PM. Closed on Sunday.',
       'సోమవారం నుండి శనివారం వరకు ఉదయం 9 నుండి 1 వరకు, సాయంత్రం 5 నుండి 8 వరకు. ఆదివారం సెలవు.',
       'timings','{timing,hours,open,close,సమయం,తెరిచి}',9),
      (v_clinic,'Where are you located?','మీరు ఎక్కడ ఉన్నారు?',
       'We are at 2-4-118 Station Road, opposite the Hanamkonda bus stand, Warangal.',
       'హనుమకొండ బస్ స్టాండ్ ఎదురుగా, స్టేషన్ రోడ్, వరంగల్.',
       'location','{where,address,location,ఎక్కడ,చిరునామా}',8),
      (v_clinic,'Do I need an appointment?','అపాయింట్‌మెంట్ అవసరమా?',
       'Walk-ins are welcome but an appointment avoids waiting. I can book one for you now.',
       'నేరుగా రావచ్చు, కానీ అపాయింట్‌మెంట్ ఉంటే వేచి ఉండాల్సిన అవసరం లేదు. ఇప్పుడే బుక్ చేయగలను.',
       'services','{appointment,booking,walk in,అపాయింట్‌మెంట్}',7)
    on conflict do nothing;
  end if;

  -- Subscription ------------------------------------------------------------
  insert into public.subscriptions (clinic_id, plan_code, status, current_period_start, current_period_end, billing_email)
  values (v_clinic,'starter','active', date_trunc('month', now()),
          date_trunc('month', now()) + interval '1 month','frontdesk@srisaiclinic.in')
  on conflict do nothing;

  -- Patients ----------------------------------------------------------------
  -- Note Lakshmi and Aarav: same handset, two patients. That is the common
  -- paediatric case and the reason identity is phone + name, not phone alone.
  insert into public.patients (clinic_id, full_name, phone_e164, approx_age_years, sex, preferred_language, first_seen_via)
  values
    (v_clinic,'Lakshmi Devi','+919885512345',34,'female','te','ai_call'),
    (v_clinic,'Aarav',       '+919885512345', 3,'male',  'te','ai_call'),
    (v_clinic,'Srinivas Rao','+919701123456',52,'male',  'te','ai_call'),
    (v_clinic,'Priya Sharma','+919642233445',28,'female','en','walk_in'),
    (v_clinic,'Mohan Kumar', '+919391556677',41,'male',  'te','ai_call')
  on conflict do nothing;

  -- Appointments over the coming week ---------------------------------------
  -- Placed on the next weekday so they always land inside a real session.
  declare
    v_day date := today + 1;
  begin
    while extract(dow from v_day) = 0 loop v_day := v_day + 1; end loop;

    -- Anitha, morning
    select id into v_p from public.patients where clinic_id = v_clinic and full_name = 'Srinivas Rao';
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source, reason)
    select v_clinic, v_anitha, v_p, (v_day + time '10:00') at time zone tz,
            ((v_day + time '10:00') at time zone tz) + interval '15 min', 15, 'confirmed','ai_call','BP follow-up'
     where not exists (select 1 from public.appointments
                        where doctor_id = v_anitha and starts_at = ((v_day + time '10:00')) at time zone tz);

    select id into v_p from public.patients where clinic_id = v_clinic and full_name = 'Priya Sharma';
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source, reason)
    select v_clinic, v_anitha, v_p, (v_day + time '10:30') at time zone tz,
            ((v_day + time '10:30') at time zone tz) + interval '15 min', 15, 'booked','ai_call','Fever and cold'
     where not exists (select 1 from public.appointments
                        where doctor_id = v_anitha and starts_at = ((v_day + time '10:30')) at time zone tz);

    -- Ramesh, paediatrics
    select id into v_p from public.patients where clinic_id = v_clinic and full_name = 'Aarav';
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source, reason)
    select v_clinic, v_ramesh, v_p, (v_day + time '10:00') at time zone tz,
            ((v_day + time '10:00') at time zone tz) + interval '20 min', 20, 'booked','ai_call','Pentavalent dose 2'
     where not exists (select 1 from public.appointments
                        where doctor_id = v_ramesh and starts_at = ((v_day + time '10:00')) at time zone tz);

    select id into v_p from public.patients where clinic_id = v_clinic and full_name = 'Mohan Kumar';
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at, duration_min, status, source, reason)
    select v_clinic, v_ramesh, v_p, (v_day + time '11:00') at time zone tz,
            ((v_day + time '11:00') at time zone tz) + interval '20 min', 20, 'confirmed','walk_in','Child cough'
     where not exists (select 1 from public.appointments
                        where doctor_id = v_ramesh and starts_at = ((v_day + time '11:00')) at time zone tz);
  end;

  -- Calls: 30 days of history, weighted toward after-hours recovery ---------
  for d in 0..29 loop
    insert into public.calls (clinic_id, provider, provider_call_sid, direction, from_e164, to_e164,
                              started_at, answered_at, ended_at, duration_sec, status, outcome, intent,
                              primary_language, languages_detected, stt_confidence_avg, recovered_missed)
    select
      v_clinic, 'exotel', 'seed-' || d || '-' || g,
      'inbound',
      '+9198' || lpad(((d * 7 + g * 13) % 100000000)::text, 8, '0'),
      '+918702345678',
      (today - d + time '09:00') at time zone tz + (g * interval '47 min'),
      (today - d + time '09:00') at time zone tz + (g * interval '47 min') + interval '3 sec',
      (today - d + time '09:00') at time zone tz + (g * interval '47 min') + interval '108 sec',
      108,
      'completed',
      (array['booked','booked','faq_answered','rescheduled','no_action'])[1 + (d + g) % 5]::public.call_outcome,
      (array['book','book','faq','reschedule','other'])[1 + (d + g) % 5]::public.call_intent,
      (array['te','te','te','en'])[1 + (d + g) % 4]::public.language_code,
      '{te,en}',
      0.72 + ((d + g) % 20) / 100.0,
      ((d + g) % 3 = 0)
    from generate_series(1, 4 + (d % 3)) g
    on conflict do nothing;
  end loop;

  -- Usage events for one recent call, so cost-per-call is demonstrable ------
  select id into v_call from public.calls where clinic_id = v_clinic order by started_at desc limit 1;
  insert into public.usage_events (clinic_id, call_id, kind, provider, quantity, unit_cost_micro_inr) values
    (v_clinic, v_call, 'stt_seconds',        'sarvam',    108,  11111),   -- ~Rs 40/hour
    (v_clinic, v_call, 'tts_characters',     'sarvam',    640,   2200),   -- ~Rs 22/10k chars
    (v_clinic, v_call, 'llm_input_tokens',   'anthropic', 4200,     13),
    (v_clinic, v_call, 'llm_output_tokens',  'anthropic',  380,     66),
    (v_clinic, v_call, 'telephony_seconds',  'exotel',    108,   8333)    -- ~Rs 0.50/min
  on conflict do nothing;

  -- ------------------------------------------------------------------------
  -- Demonstrate the trust flow: Dr Anitha is suddenly unavailable tomorrow
  -- morning. The trigger flags her appointments, opens a DRAFT batch and
  -- raises an Action Required item. Nothing is cancelled, nobody is messaged.
  -- ------------------------------------------------------------------------
  declare
    v_day date := today + 1;
  begin
    while extract(dow from v_day) = 0 loop v_day := v_day + 1; end loop;

    if not exists (select 1 from public.doctor_time_off
                   where doctor_id = v_anitha and kind = 'emergency') then
      insert into public.doctor_time_off (clinic_id, doctor_id, starts_at, ends_at, kind, reason)
      values (v_clinic, v_anitha,
              (v_day + time '09:00') at time zone tz,
              (v_day + time '13:00') at time zone tz,
              'emergency', 'Called to district hospital');
    end if;
  end;

  raise notice 'Seeded clinic % (Sri Sai Clinic, Warangal)', v_clinic;
end
$seed$;

-- ===========================================================================
-- Clinical history
--
-- Without this the patient record is a working screen with nothing on it:
-- visits, medicines, vaccinations and bills all read zero, because the seed
-- above stops at appointments and calls. A clinic owner being shown the
-- patient surface for the first time should see a real record, not an empty
-- one.
--
-- Lakshmi Devi carries the chronic case (hypertension, on two medicines, one
-- bill outstanding). Aarav carries the paediatric one (a vaccination given and
-- the next one due) — the two shapes the product actually has to handle.
-- ===========================================================================
do $clinical$
declare
  v_clinic   uuid;
  v_anitha   uuid;
  v_ramesh   uuid;
  v_lakshmi  uuid;
  v_aarav    uuid;
  v_appt     uuid;
  v_consult  uuid;
  v_rx       uuid;
  v_plan     uuid;
  v_invoice  uuid;
  tz         text := 'Asia/Kolkata';
  today      date := (now() at time zone 'Asia/Kolkata')::date;
begin
  select id into v_clinic  from public.clinics where slug = 'sri-sai-warangal';
  if v_clinic is null then return; end if;

  select id into v_anitha  from public.doctors  where clinic_id = v_clinic and spoken_name = 'Dr Anitha';
  select id into v_ramesh  from public.doctors  where clinic_id = v_clinic and spoken_name = 'Dr Ramesh';
  select id into v_lakshmi from public.patients where clinic_id = v_clinic and full_name  = 'Lakshmi Devi';
  select id into v_aarav   from public.patients where clinic_id = v_clinic and full_name  = 'Aarav';

  -- ---- Conditions --------------------------------------------------------
  insert into public.patient_conditions (clinic_id, patient_id, condition, status, onset_date, noted_by)
  select v_clinic, v_lakshmi, 'Hypertension', 'chronic', today - 400, v_anitha
   where not exists (select 1 from public.patient_conditions
                      where patient_id = v_lakshmi and condition = 'Hypertension');

  insert into public.patient_conditions (clinic_id, patient_id, condition, status, onset_date, resolved_date, noted_by)
  select v_clinic, v_lakshmi, 'Iron deficiency anaemia', 'resolved', today - 600, today - 300, v_anitha
   where not exists (select 1 from public.patient_conditions
                      where patient_id = v_lakshmi and condition = 'Iron deficiency anaemia');

  -- ---- A completed visit, three weeks ago --------------------------------
  select id into v_appt from public.appointments
   where patient_id = v_lakshmi and status = 'completed' limit 1;

  if v_appt is null then
    insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at,
                                     duration_min, status, source, reason)
    values (v_clinic, v_anitha, v_lakshmi,
            ((today - 21) + time '10:00') at time zone tz,
            (((today - 21) + time '10:00') at time zone tz) + interval '15 min',
            15, 'completed', 'ai_call', 'Blood pressure check')
    returning id into v_appt;
  end if;

  select id into v_consult from public.consultations where appointment_id = v_appt;

  if v_consult is null then
    insert into public.consultations (clinic_id, appointment_id, patient_id, doctor_id,
                                      chief_complaint, findings, diagnosis_text, advice,
                                      follow_up_days, status, finalised_at)
    values (v_clinic, v_appt, v_lakshmi, v_anitha,
            'Headache and dizziness for three days',
            'BP 158/96. No neurological deficit.',
            'Hypertension, poorly controlled',
            'Reduce salt. Walk 30 minutes daily. Review in four weeks.',
            28, 'finalised',
            (((today - 21) + time '10:25') at time zone tz))
    returning id into v_consult;
  end if;

  -- ---- Prescription ------------------------------------------------------
  select id into v_rx from public.prescriptions where consultation_id = v_consult;

  if v_rx is null then
    insert into public.prescriptions (clinic_id, consultation_id, patient_id, doctor_id, issued_at, notes)
    values (v_clinic, v_consult, v_lakshmi, v_anitha,
            (((today - 21) + time '10:25') at time zone tz),
            'Take after food. Do not stop without review.')
    returning id into v_rx;

    insert into public.prescription_items (prescription_id, drug_name, strength, form, dosage,
                                           frequency, duration_days, instructions_en, instructions_te, sort_order)
    values
      (v_rx, 'Amlodipine', '5 mg', 'tablet', '1-0-0', 'Once daily', 30,
       'Take one tablet every morning after breakfast.',
       'ప్రతి ఉదయం అల్పాహారం తర్వాత ఒక మాత్ర వేసుకోండి.', 1),
      (v_rx, 'Metformin', '500 mg', 'tablet', '1-0-1', 'Twice daily', 30,
       'Take after breakfast and after dinner.',
       'అల్పాహారం తర్వాత మరియు రాత్రి భోజనం తర్వాత వేసుకోండి.', 2);
  end if;

  -- ---- Bills: one settled, one outstanding -------------------------------
  if not exists (select 1 from public.patient_invoices where patient_id = v_lakshmi) then
    insert into public.patient_invoices (clinic_id, patient_id, appointment_id, consultation_id,
                                         invoice_number, subtotal_paise, total_paise,
                                         status, payment_mode, issued_at, paid_at)
    values (v_clinic, v_lakshmi, v_appt, v_consult, 'SSC-2026-0307', 30000, 30000,
            'paid', 'upi',
            (((today - 21) + time '10:30') at time zone tz),
            (((today - 21) + time '10:34') at time zone tz))
    returning id into v_invoice;

    insert into public.patient_invoice_items (invoice_id, description, quantity, unit_price_paise, sort_order)
    values (v_invoice, 'General consultation', 1, 30000, 1);

    insert into public.patient_invoices (clinic_id, patient_id, invoice_number,
                                         subtotal_paise, total_paise, status, issued_at)
    values (v_clinic, v_lakshmi, 'SSC-2026-0418', 45000, 45000, 'issued',
            (((today - 2) + time '11:10') at time zone tz))
    returning id into v_invoice;

    insert into public.patient_invoice_items (invoice_id, description, quantity, unit_price_paise, sort_order)
    values
      (v_invoice, 'General consultation', 1, 30000, 1),
      (v_invoice, 'Blood pressure check',  1, 10000, 2),
      (v_invoice, 'Dressing',              1,  5000, 3);
  end if;

  -- ---- The review that visit asked for -----------------------------------
  -- Without this the patient record opens on an empty hero card, which is the
  -- largest thing on the page. The consultation above asked for a review in
  -- four weeks; this is it, so the record tells one continuous story.
  if not exists (
    select 1 from public.appointments
     where patient_id = v_lakshmi and starts_at > now()
  ) then
    -- Three days out, not tomorrow. A same-day appointment is in the past by
    -- the afternoon, and then the patient record opens on an empty hero — the
    -- demo degrades within hours of seeding.
    declare v_day date := today + 3;
    begin
      while extract(dow from v_day) = 0 loop v_day := v_day + 1; end loop;
      insert into public.appointments (clinic_id, doctor_id, patient_id, starts_at, ends_at,
                                       duration_min, status, source, reason)
      values (v_clinic, v_anitha, v_lakshmi,
              (v_day + time '09:30') at time zone tz,
              ((v_day + time '09:30') at time zone tz) + interval '15 min',
              15, 'confirmed', 'ai_call', 'BP follow-up');
    end;
  end if;

  -- ---- Care plan and its follow-ups --------------------------------------
  select id into v_plan from public.care_plans
   where clinic_id = v_clinic and name = 'Hypertension review';

  if v_plan is null then
    insert into public.care_plans (clinic_id, name, trigger, offset_days, template_key, channel)
    values (v_clinic, 'Hypertension review', 'chronic_medication', 28, 'bp_review', 'whatsapp')
    returning id into v_plan;
  end if;

  insert into public.care_tasks (clinic_id, care_plan_id, patient_id, due_on, status)
  values (v_clinic, v_plan, v_lakshmi, today + 3,  'pending'),
         (v_clinic, v_plan, v_lakshmi, today - 2,  'pending')
  on conflict (care_plan_id, patient_id, due_on) do nothing;

  -- ---- Paediatric vaccinations ------------------------------------------
  insert into public.patient_vaccinations (clinic_id, patient_id, vaccine_code, dose_number,
                                           due_date, administered_at, administered_by, status)
  values (v_clinic, v_aarav, 'PENTA_1', 1, today - 21,
          (((today - 21) + time '11:20') at time zone tz), v_ramesh, 'administered')
  on conflict (patient_id, vaccine_code, dose_number) do nothing;

  insert into public.patient_vaccinations (clinic_id, patient_id, vaccine_code, dose_number,
                                           due_date, status)
  values (v_clinic, v_aarav, 'PENTA_2', 2, today + 7, 'due')
  on conflict (patient_id, vaccine_code, dose_number) do nothing;

  raise notice 'Seeded clinical history for Lakshmi Devi and Aarav';
end
$clinical$;
