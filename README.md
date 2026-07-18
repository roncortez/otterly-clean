# Otterly Clean - Service Ordering Platform

Otterly Clean is a full-stack service ordering and operations management application. Customers can browse available services, manage a cart, place orders, and continue the checkout flow through WhatsApp. Administrators can review orders and manage the service catalog from an internal dashboard.

## Tech Stack

- Web app: React 18, React Router, Firebase Authentication, Axios, Tailwind CSS, Material UI.
- API: Node.js, Express, PostgreSQL, pg-promise, Multer, Sharp, Cloudinary.
- Integrations: Firebase, Cloudinary, Telegram Bot API, WhatsApp checkout links.

## Project Structure

```text
apps/api/
  controllers/      HTTP handlers by domain
  models/           SQL queries and data access
  routes/           Express API routes
  notifications/    External notification helpers
apps/web/
  src/app/          Router, providers, and global context
  src/features/     Feature-based application modules
  src/shared/       Shared UI, styles, and utilities
```

## Requirements

- Node.js 18 or newer recommended.
- PostgreSQL database.
- Firebase project for authentication.
- Cloudinary account for image uploads.
- Telegram bot credentials if order notifications are enabled.

## Environment Setup

Create local environment files from the provided examples:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

API variables:

```text
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_IDS=
CORS_ORIGINS=http://localhost:3000
```

Web app variables:

```text
REACT_APP_BACKEND_URL=http://localhost:10000
```

## Installation and Local Development

API:

```bash
cd apps/api
npm ci
npm start
```

Web app:

```bash
cd apps/web
npm ci
npm start
```

By default, the API runs on `http://localhost:10000` and the web app runs on `http://localhost:3000`.

## Useful Commands

API:

```bash
npm start
npm audit --omit=dev
```

Web app:

```bash
npm start
npm run build
npm test -- --watchAll=false
npm audit --omit=dev
```

## Current Quality Notes

- The project is organized as separate web and API applications under `apps/`.
- Environment examples are included so real credentials do not need to be committed.
- Generated folders such as `node_modules`, `apps/web/build`, and upload artifacts should stay out of version control.
- Before using this as a public portfolio project, rotate any credentials that were previously committed and run a fresh dependency audit.

## Deployment Notes

- Configure all production secrets through the hosting provider, not through committed files.
- Update `CORS_ORIGINS` for the final web app domain.
- Store uploaded images in Cloudinary and keep temporary upload files out of Git.
- Rebuild the web app after changing `REACT_APP_BACKEND_URL`.
