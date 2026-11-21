-- Supabase Auth + Postgres quiz storage.
-- Students read only the sanitized published_quizzes view; teacher answer keys stay private.

create table if not exists public.quiz_assessments (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  teacher_email text not null,
  quiz_data jsonb not null,
  student_data jsonb,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_assessments_teacher_created_idx
  on public.quiz_assessments (teacher_id, created_at desc);
alter table public.quiz_assessments enable row level security;

drop policy if exists "Teachers read their own quizzes" on public.quiz_assessments;
create policy "Teachers read their own quizzes" on public.quiz_assessments
  for select to authenticated using (teacher_id = (select auth.uid()));
drop policy if exists "Published quiz data is readable by students" on public.quiz_assessments;
create policy "Published quiz data is readable by students" on public.quiz_assessments
  for select to anon using (is_published = true);
drop policy if exists "Teachers create their own quizzes" on public.quiz_assessments;
create policy "Teachers create their own quizzes" on public.quiz_assessments
  for insert to authenticated with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers update their own quizzes" on public.quiz_assessments;
create policy "Teachers update their own quizzes" on public.quiz_assessments
  for update to authenticated using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
drop policy if exists "Teachers delete their own quizzes" on public.quiz_assessments;
create policy "Teachers delete their own quizzes" on public.quiz_assessments
  for delete to authenticated using (teacher_id = (select auth.uid()));

grant select on public.quiz_assessments to authenticated;
grant select (code, student_data, teacher_id, is_published)
  on public.quiz_assessments to anon;
grant insert, update, delete on public.quiz_assessments to authenticated;

create or replace view public.published_quizzes
with (security_invoker = true, security_barrier = true) as
  select code, student_data, teacher_id
  from public.quiz_assessments where is_published = true;
revoke all on public.published_quizzes from public;
grant select on public.published_quizzes to anon, authenticated;

create table if not exists public.quiz_submissions (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  quiz_code text not null references public.quiz_assessments(code) on delete cascade,
  teacher_id uuid not null references auth.users(id) on delete cascade,
  submission_data jsonb not null,
  status text not null default 'Pending' check (status in ('Pending', 'Graded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists quiz_submissions_teacher_created_idx
  on public.quiz_submissions (teacher_id, created_at desc);
create index if not exists quiz_submissions_quiz_code_idx
  on public.quiz_submissions (quiz_code);
alter table public.quiz_submissions enable row level security;

drop policy if exists "Students submit answers to published quizzes" on public.quiz_submissions;
create policy "Students submit answers to published quizzes" on public.quiz_submissions
  for insert to anon, authenticated with check (
    status = 'Pending'
    and exists (
      select 1 from public.published_quizzes q
      where q.code = quiz_submissions.quiz_code
        and q.teacher_id = quiz_submissions.teacher_id
    )
  );
drop policy if exists "Teachers read submissions for their quizzes" on public.quiz_submissions;
create policy "Teachers read submissions for their quizzes" on public.quiz_submissions
  for select to authenticated using (teacher_id = (select auth.uid()));
drop policy if exists "Teachers grade submissions for their quizzes" on public.quiz_submissions;
create policy "Teachers grade submissions for their quizzes" on public.quiz_submissions
  for update to authenticated using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));
grant insert on public.quiz_submissions to anon, authenticated;
grant select, update on public.quiz_submissions to authenticated;

-- Grade MCQs inside Postgres so the answer key never reaches a student's browser.
create or replace function public.grade_quiz_submission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_quiz jsonb;
  v_question jsonb;
  v_answer text;
  v_correct integer;
  v_marks numeric;
  v_score numeric := 0;
  v_grades jsonb := '{}'::jsonb;
  v_qid text;
  v_right boolean;
begin
  select quiz_data into v_quiz
  from public.quiz_assessments
  where code = new.quiz_code and teacher_id = new.teacher_id and is_published = true;
  if v_quiz is null then raise exception 'Quiz is unavailable'; end if;
  for v_question in select value from jsonb_array_elements(coalesce(v_quiz->'questions', '[]'::jsonb))
  loop
    v_qid := v_question->>'id';
    v_marks := greatest(0, coalesce((v_question->>'marks')::numeric, 0));
    if v_question->>'type' = 'mcq'
       and v_question->>'correctOption' is not null
       and coalesce(new.submission_data->'answers', '{}'::jsonb) ? v_qid then
      v_answer := new.submission_data->'answers'->>v_qid;
      v_correct := (v_question->>'correctOption')::integer;
      v_right := v_answer ~ '^[0-9]+$' and v_answer::integer = v_correct;
      if v_right then v_score := v_score + v_marks; end if;
      v_grades := v_grades || jsonb_build_object(v_qid,
        jsonb_build_object('status', case when v_right then 'right' else 'wrong' end,
                           'marks', case when v_right then v_marks else 0 end));
    else
      v_grades := v_grades || jsonb_build_object(v_qid,
        jsonb_build_object('status', 'ungraded', 'marks', 0));
    end if;
  end loop;
  new.submission_data := coalesce(new.submission_data, '{}'::jsonb) ||
    jsonb_build_object('status', 'Pending', 'earnedMarks', v_score, 'grades', v_grades);
  new.status := 'Pending';
  return new;
end;
$$;
revoke all on function public.grade_quiz_submission() from public, anon, authenticated;
drop trigger if exists trg_grade_quiz_submission on public.quiz_submissions;
create trigger trg_grade_quiz_submission
before insert on public.quiz_submissions
for each row execute function public.grade_quiz_submission();
