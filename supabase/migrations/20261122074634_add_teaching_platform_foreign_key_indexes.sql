-- Add covering indexes for foreign keys used by the teaching, homework and payment workflows.
create index if not exists class_students_user_id_idx on public.class_students(user_id);
create index if not exists homework_assignments_class_id_idx on public.homework_assignments(class_id);
create index if not exists lesson_plans_class_id_idx on public.lesson_plans(class_id);
create index if not exists homework_submissions_student_id_idx on public.homework_submissions(student_id);
create index if not exists homework_submissions_user_id_idx on public.homework_submissions(user_id);
create index if not exists payment_requests_reviewed_by_idx on public.payment_requests(reviewed_by);
create index if not exists subscription_requests_requested_plan_code_idx on public.subscription_requests(requested_plan_code);
create index if not exists subscription_requests_reviewed_by_idx on public.subscription_requests(reviewed_by);
create index if not exists subscriptions_plan_code_idx on public.subscriptions(plan_code);
