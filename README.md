# Trackly — Smart Job & Internship Tracker

Trackly is a full-stack web app for organizing job and internship applications in one place.

## Features

- Secure account registration, login, and logout
- Password hashing with Node's `scrypt` function; passwords are never stored as plain text
- Per-user application data, protected by server-side session cookies
- Add, filter, and delete applications
- Status tracking: Applied, Interview, Offer, and Rejected
- Live dashboard totals, interview count, response rate, and progress goal
- SQLite locally, or a persistent Turso libSQL database in deployment
- Responsive interface for desktop and mobile

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server and REST API
- Database: SQLite / Turso libSQL (`@libsql/client`)
- Security: salted password hashing and HTTP-only session cookies

## Run locally

1. Install Node.js 24.
2. In this project folder, run `npm ci`, then `npm start`.
3. Open `http://127.0.0.1:3000` in your browser.

Without database environment variables, the app uses `trackly.db` in the working directory. Run `npm test` to check authentication, data isolation, CRUD, restart persistence, and private file protection.

## Free deployment: Render + Turso

1. Create a free account at https://turso.tech and create a **libSQL** database. Copy its database URL and generate an auth token. This app uses the libSQL client; choose the libSQL engine.
2. Sign in at https://dashboard.render.com with GitHub. Choose **New > Blueprint**, connect this repository, and use the root `render.yaml` on the updated branch.
3. Enter `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` when prompted. Store the token only in Render's environment settings; never commit it or put it in frontend JavaScript.
4. Confirm the service uses the **Free** plan and deploy. The blueprint installs dependencies with `npm ci`, starts with `npm start`, and checks `/health`.
5. Open the Render service URL, register an account, and add an application. Redeploy and verify the saved application remains.

For manual creation, choose **Web Service**, leave Root Directory empty, use Node 24, Build Command `npm ci`, Start Command `npm start`, and Health Check Path `/health`. Set `NODE_ENV=production` and both Turso variables.

Free Render services sleep after 15 idle minutes and may take about a minute to wake. Local files disappear on restarts; production therefore requires Turso configuration and never silently falls back to local storage. Free tier usage limits apply. Existing local data is not automatically copied to Turso: import an existing SQLite database into Turso before switching if you need to retain it.

Login sessions are stored in the database, expire after seven days, and use Secure cookies in production. Only explicitly listed frontend files are served publicly.

References: https://render.com/docs/free and https://docs.turso.tech/sdk/ts/reference

## API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/auth/register` | Create an account |
| POST | `/api/auth/login` | Log in |
| POST | `/api/auth/logout` | Log out |
| GET | `/api/me` | Get the signed-in user |
| GET / POST | `/api/applications` | Read or add applications |
| DELETE | `/api/applications/:id` | Delete an application |

## Next improvements

- Edit an existing application
- Deadline reminders and calendar view
- Notes and document attachments per application
- Cloud database and public deployment
