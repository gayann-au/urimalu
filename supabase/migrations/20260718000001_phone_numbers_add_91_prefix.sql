-- Phone number format fix.
--
-- Every farmer and merchant contact number was stored as bare 10 digits with
-- no country code, so the WhatsApp click-to-chat links (wa.me/<digits>) had no
-- country code and could not route. This prefixes +91 onto every clean Indian
-- mobile number across the three columns that hold one:
--   users.phone, users.whatsapp, and seller_leads.farmer_phone (a snapshot
--   copied from users.phone when a farmer posts "ready to sell").
--
-- Restricted to exactly the CLEAN_add_+91 rows from the reviewed preview: a
-- value whose digits, once spaces and dashes are stripped, are exactly 10 long
-- and start with 6, 7, 8, or 9. A value already carrying a country code has 12
-- digits, so the length = 10 guard skips it and the +91 is never doubled.
-- Anything else (wrong length, or a leading digit outside 6-9) is left
-- untouched. This also makes the migration safe to re-run: once a value is
-- '+91XXXXXXXXXX' it has 12 digits and no longer matches.
--
-- The three wa.me link builders already strip a leading '+' via
-- replace(/[^0-9]/g, ""), so no application code needs to change for the links
-- to work with this format.

begin;

-- Defensive: guarantee the columns can hold a 13-character '+91XXXXXXXXXX'
-- value, in case phone/whatsapp were created as a fixed-width type. Both are
-- no-ops if the columns are already text (they carry no length or CHECK
-- constraint in any migration). seller_leads.farmer_phone is already text.
-- Safe to delete these two lines if you know both columns are already text.
alter table public.users alter column phone    type text;
alter table public.users alter column whatsapp type text;

update public.users
set phone = '+91' || regexp_replace(phone, '[^0-9]', '', 'g')
where nullif(trim(phone), '') is not null
  and length(regexp_replace(phone, '[^0-9]', '', 'g')) = 10
  and left(regexp_replace(phone, '[^0-9]', '', 'g'), 1) in ('6', '7', '8', '9');

update public.users
set whatsapp = '+91' || regexp_replace(whatsapp, '[^0-9]', '', 'g')
where nullif(trim(whatsapp), '') is not null
  and length(regexp_replace(whatsapp, '[^0-9]', '', 'g')) = 10
  and left(regexp_replace(whatsapp, '[^0-9]', '', 'g'), 1) in ('6', '7', '8', '9');

update public.seller_leads
set farmer_phone = '+91' || regexp_replace(farmer_phone, '[^0-9]', '', 'g')
where nullif(trim(farmer_phone), '') is not null
  and length(regexp_replace(farmer_phone, '[^0-9]', '', 'g')) = 10
  and left(regexp_replace(farmer_phone, '[^0-9]', '', 'g'), 1) in ('6', '7', '8', '9');

commit;
