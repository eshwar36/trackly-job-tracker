# Trackly — Smart Job & Internship Tracker

Trackly is a full-stack web app for organizing job and internship applications in one place.

## Features

- Secure account registration, login, and logout
- Password hashing with Node's `scrypt` function; passwords are never stored as plain text
- Per-user application data, protected by server-side session cookies
- Add, filter, and delete applications
- Status tracking: Applied, Interview, Offer, and Rejected
- Live dashboard totals, interview count, response rate, and progress goal
- SQLite database stored locally by the app
- Responsive interface for desktop and mobile

## Tech stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server and REST API
- Database: SQLite (`node:sqlite`)
- Security: salted password hashing and HTTP-only session cookies

## Run locally

1. Install Node.js 24 or later.
2. In this project folder, run: `node server.js`
3. Open `http://127.0.0.1:3000` in your browser.

No package installation is required.

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
