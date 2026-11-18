# Tr's Kyain lone — Premium Website v3

This is a **website-only** React + Vite project. It is not a native Android/iOS app.

## Included

- Premium responsive UI foundation (mobile, tablet and desktop)
- Teacher email/password authentication using Firebase Auth
- Teacher quiz builder with MCQ and written questions
- Edit and delete previously created quizzes
- Six-character quiz codes and shareable query links (`/?q=ABC123`)
- Student quiz portal, timer and submission flow
- Teacher grading dashboard, leaderboard and gradebook
- Result share links (`/?s=ABC123`)
- Gemini image-to-quiz serverless API (`/api/generate-quiz`); the Gemini key stays server-side
- Vercel deployment configuration

## Run locally

1. Install Node.js 20 or later.
2. Copy `.env.example` to `.env.local` and fill the Firebase web app values.
3. Add `GEMINI_API_KEY` to `.env.local` for the AI image-to-quiz feature.
4. Run:

```bash
npm install
npm run dev
```

Open the local URL printed by Vite.

## Deploy to Vercel

1. Push this project folder to a GitHub repository.
2. Import the repository in Vercel. Framework should be detected as Vite.
3. Add all Firebase `VITE_FIREBASE_*` values in Vercel → Project → Settings → Environment Variables.
4. Add `GEMINI_API_KEY` and optionally `GEMINI_MODEL=gemini-2.5-flash` as server environment variables. Do **not** prefix the Gemini key with `VITE_`.
5. Deploy and enable Firebase Authentication → Email/Password and Firestore in Firebase Console.

Optional short-domain setting: set `VITE_PUBLIC_SHORT_BASE_URL` to a custom domain that points to this same Vercel deployment, for example `https://your-short-domain.example`. Without a custom short domain, links use the deployed website's normal domain plus `/?q=CODE` or `/?s=CODE`. Six-character codes are short identifiers; they cannot shorten a long domain by themselves.

## Important production checklist

The uploaded v2 source uses direct client-side Firestore access and stores answer keys in quiz documents that the student client can fetch. It also has localStorage fallback writes. This is acceptable only for a private prototype/demo, **not a secure public examination system**: a technically skilled student could inspect client data, and a local-only submission will not reach the teacher on another device.

Before using this for real exams, migrate quiz answer keys and grading to a trusted server (Firebase Admin / Vercel API), keep answer keys in teacher-only documents, validate teacher ownership on the server, and apply restrictive Firestore Security Rules. Do not use permissive test-mode Firestore rules in production. This project does not pretend that a browser-only code change can provide server-side secrecy or cross-device persistence without the required Firebase server credentials and security-rule configuration.

## Firebase configuration notes

Firebase web config values identify the web app and are intended to be used in the browser; Firestore Security Rules and Authentication determine access. Never put a Firebase Admin service-account JSON or Gemini API key in `VITE_*` variables or in client source.
