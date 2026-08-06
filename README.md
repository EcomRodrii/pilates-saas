Tentare Software Pilates

> Modern management platform for Pilates studios.

Tentare is an all-in-one SaaS platform built specifically for Pilates studios. It combines class scheduling, instructor management, payments, CRM, marketing automation, and a customizable client portal into a single platform.

## Features

- 🧘 Studio management
- 📅 Class scheduling
- 👥 Instructor management
- 💳 Online payments
- 📈 CRM & member management
- 🤖 Marketing automation
- 🌐 White-label client portal
- 📊 Analytics & reporting

## Tech Stack

- Next.js
- React
- TypeScript
- Supabase
- PostgreSQL
- Stripe
- Tailwind CSS
- Vercel

---

# Getting Started

## Requirements

- Node.js 20+
- npm
- Docker (recommended for local Supabase)

## Installation

```bash
git clone https://github.com/your-org/tentare.git
cd tentare
npm install

Create your .env.local.

Run locally
npm run dev

Application:

http://localhost:3000
Local Supabase (Recommended)

The project includes a local Supabase configuration where CAPTCHA and email confirmations are disabled.

Start the local stack:

npx supabase start

Configure your .env.local:

NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY

Mailpit is available at:

http://127.0.0.1:54324

Stop the stack:

npx supabase stop
Production Authentication

Production uses Cloudflare Turnstile.

Required environment variable:

NEXT_PUBLIC_TURNSTILE_SITE_KEY=YOUR_SITE_KEY

Localhost must also be added as an allowed hostname in Cloudflare Turnstile.

Project Structure
app/
components/
lib/
supabase/
public/
e2e/
Deployment

The project is deployed on Vercel.

vercel
License

Private repository.

Copyright © Tentare.


## También quitaría todo esto

GitHub ya lo muestra automáticamente, así que sobra:

- "This is a Next.js project bootstrapped..."
- "Learn More"
- "Next.js Documentation"
- "Deploy on Vercel"
- Todo el texto generado por `create-next-app`.

## Incluso añadiría al principio una imagen

Algo así:

```md
<p align="center">
  <img src="docs/cover.png" width="100%">
</p>

<h1 align="center">Tentare</h1>

<p align="center">
Management platform built exclusively for Pilates studios.
</p>
