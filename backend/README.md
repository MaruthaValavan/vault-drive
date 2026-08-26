# Vaultly Drive Backend

Separate Node.js + Express backend for the Vaultly cloud storage frontend.

## What this repo does

- Verifies Supabase JWTs sent by the frontend.
- Performs all database and storage operations with a privileged Supabase service-role client.
- Exposes a REST API for folders, files, search, trash, upload and download.

## Stack

- Node.js + Express
- TypeScript
- Supabase (`@supabase/supabase-js`)
- Multer for multipart uploads
- Zod for input validation

## Setup

1. Copy the environment file and fill in your Supabase service role key:

   ```bash
   cp .env.example .env
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Run in development:

   ```bash
   npm run dev
   ```

   The API will be available at `http://localhost:4000` by default.

## Production notes

- The `SUPABASE_SERVICE_ROLE_KEY` must stay secret. Never commit it or expose it to the browser.
- Set `CORS_ORIGIN` to the exact URL of your deployed frontend.
- This backend is designed to be moved to its own repository.
