-- Keep the teacher class roster behind the same subscription gate as other Teaching Hub tables.
drop policy if exists "Subscription required for class_students" on public.class_students;

create policy "Subscription required for class_students"
on public.class_students
as restrictive
for all
to authenticated
using ((select private.current_user_has_subscription_access()))
with check ((select private.current_user_has_subscription_access()));
