# Tr.Kyain Lone — AI Learning Platform

A responsive, bilingual (Myanmar + English) learning and assessment platform for teachers and students. Built with React, Vite, Supabase and a server-side Gemini API.

## Features

- Teacher email/password sign-in with Supabase Auth.
- AI photo/PDF-to-quiz workflow using Gemini; the API key stays server-side.
- Manual MCQ and written-question editing, answer-key selection, marks and time limits.
- Instant answer-sheet builder for teachers who do not need AI generation.
- Six-character student quiz codes and shareable quiz links.
- Student quiz-taking, timed assessments and submission history.
- Teacher review, grading, leaderboard and gradebook views.
- Teaching Hub for classes, lesson plans, question bank and homework assignment records.
- KPay subscription request flow with private receipt uploads and manual admin review.
- Supabase Row Level Security and server-side MCQ grading.
- Responsive mobile and desktop UI; Figma design source includes the shared visual tokens and reusable icon components.

## Local development

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev
```

## Environment variables

Frontend (Vite):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Vercel server-side:
- `GEMINI_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Do not put the Gemini API key or any Supabase service-role/secret key in a `VITE_*` variable. The browser must use only the publishable key.

## Supabase setup

1. Enable Email/Password under Supabase Auth providers.
2. Configure the site's production URL and local development URL in Auth URL Configuration.
3. Apply the SQL migrations in `supabase/migrations` in timestamp order.
4. Keep RLS enabled on exposed public tables and retain the ownership/subscription policies.
5. Keep the `kpay-receipts` bucket private; signed URLs are used for admin review.
6. Enable leaked-password protection in Supabase Auth settings before public launch.

## Vercel deployment

The project is linked to the GitHub repository `wwwmaung223-lgtm/tr_kyain_lone-app`. Pushes to `main` trigger deployments when the Git integration is active. Set the environment variables above in the Vercel project before using AI generation.

## Production verification checklist

- Test teacher sign-in, sign-out, trial access and subscription gating.
- Create a quiz, publish it, open the short link from a separate browser/device, submit as a student and verify it appears in the teacher dashboard.
- Test image and PDF uploads with the Gemini endpoint and confirm generated questions are reviewed before publishing.
- Verify MCQ grades are computed server-side and student-facing quiz data does not expose answer keys.
- Test KPay receipt upload, private storage and admin approval/rejection.
- Test mobile and desktop layouts, network errors, empty states and slow loading.
- Confirm Vercel Production is publicly reachable for students; preview deployments may remain protected by SSO.

## Important limitations

- KPay approval is a manual verification workflow; it is not an automated payment gateway.
- AI output must be checked by the teacher before publishing. OCR/AI can misread poor-quality photos, handwriting and complex layouts.
- Teaching Hub currently provides teacher-side class, lesson, question-bank and homework records; student homework submission and class roster workflows still need to be completed before claiming a full school-management suite.
