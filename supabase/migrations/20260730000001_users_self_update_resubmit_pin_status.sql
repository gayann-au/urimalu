-- Pin the status value the merchant self-update policy will accept.
--
-- users_self_update_resubmit exists so a rejected merchant can resubmit
-- (REJECTED to PENDING) and so an approved merchant editing a review
-- sensitive field can send themselves back for review (APPROVED to PENDING).
-- Both flows write status = 'PENDING' and nothing else. See SignupMerchant.jsx
-- resubmit mode and AccountMerchantForm.jsx needsReview.
--
-- The original with_check pinned role and is_disabled but never mentioned
-- status. Permissive policies are combined with OR, so a merchant calling the
-- REST API directly could satisfy this policy alone and write any value
-- users_status_check allows, including APPROVED. That let a rejected merchant
-- skip both the resubmit form and the 24 hour auto approve wait, and reappear
-- in the public feed with the details that were rejected.
--
-- Adding status = 'PENDING' closes that without touching either legitimate
-- flow. Verified against production before applying: REJECTED to PENDING
-- passed, an ordinary profile edit passed through users_self_update_safe_fields,
-- and a self set APPROVED failed with 42501.
--
-- Only the WITH CHECK expression changes. The USING qual stays id = auth.uid().
-- Applied by hand in the Supabase SQL editor on 30 July 2026; this file is the
-- record of that change, not a pending migration.

ALTER POLICY users_self_update_resubmit ON public.users
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT u.role FROM public.users u WHERE u.id = auth.uid())
    AND is_disabled = (SELECT u.is_disabled FROM public.users u WHERE u.id = auth.uid())
    AND status = 'PENDING'
  );
