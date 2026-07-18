# Otterly Clean Web App

React web app for the Otterly Clean service ordering platform.

## Setup

Create `apps/web/.env` from the example file:

```bash
cp .env.example .env
```

Set the API URL:

```text
REACT_APP_BACKEND_URL=http://localhost:10000
```

## Available Scripts

```bash
npm ci
npm start
npm run build
npm test -- --watchAll=false
```

## Notes

- The app uses Firebase Authentication for user sessions.
- API requests are sent to the Express API configured through `REACT_APP_BACKEND_URL`.
- See the root README for full-stack setup, API variables, and deployment notes.
