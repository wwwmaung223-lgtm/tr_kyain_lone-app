-- Apply the same subscription boundary to teacher-side homework submission records.
drop policy if exists "Subscription required for homework_submissions" on public.homework_submissions;

create policy "Subscription required for homework_submissions"
on public.homework_submissions
as restrictive
for all
to authenticated
using ((select private.current_user_has_subscription_access()))
with check ((select private.current_user_has_subscription_access()));
