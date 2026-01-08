# Diana Activity Tracker

A comprehensive activity tracking system with Sprint management, user authentication, and admin controls.

## Features

- 📊 Activity tracking with GXP Scope, Priority, and Risk Level
- 🔐 User authentication with admin and client roles
- 📅 Automatic Sprint assignment based on activity date
- 🎨 Conditional row formatting based on GXP and Priority
- 📧 Email notifications 3 days before activity starts
- 📥 Export data to PDF and Excel with date filters
- ✏️ Edit tracking with timestamps and user info
- 📱 Mobile responsive design
- 📈 Sprint progress tracking with color indicators

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open your browser to `http://localhost:3000`

## Default Admin Account

- Username: admin
- Password: admin123

**Important:** Change the admin password after first login!

## Sprint Structure

- Sprint 1: January - March
- Sprint 2: April - June
- Sprint 3: July - September
- Sprint 4: October - December

## Activity Status Options

- Planned
- In Progress
- Completed
- Cancelled
- On Hold

## Priority Levels

- Critical (Red background)
- High
- Medium
- Low

## Sprint Progress Colors

- Red: < 50% completed
- Orange: 50-79% completed
- Green: 80-100% completed
