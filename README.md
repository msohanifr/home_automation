# Home Automation Hub

Simple Django + React home automation dashboard with rooms, devices and integration placeholders for Google Home, Nest, Ring and others.

## Features

- User login & registration (token based). User stays logged in until they click **Log out**.
- Dashboard with:
  - Summary cards (rooms, devices, online devices, integrations)
  - Dynamic rooms list (click a room to open its layout)
  - Integrations manager (Google Home, Nest, Ring, Other)
- Room view:
  - Picture map background per room (URL-based)
  - Drag & drop devices (lights, switches, cameras, thermostats)
  - Device on/off toggle via double-click
- Backend API:
  - Rooms CRUD
  - Devices CRUD (with per-room filtering)
  - Integrations CRUD
  - Dashboard summary endpoint
- Dockerized:
  - Backend (Django, DRF) on port **8002**
  - Frontend (React + Webpack dev server) on port **3003**

> NOTE: Integrations with Google Home, Nest, Ring, etc. are implemented as **placeholders**. You can store tokens/metadata and extend the backend views to call the real vendor APIs.

## Running with Docker

From the project root (where `docker-compose.yml` lives):

```bash
docker-compose build
docker-compose up
```

Then open:

- Backend API: http://localhost:8002/api/
- Frontend app: http://localhost:3003/

## First steps

1. Go to the frontend http://localhost:3003/
2. Register a new account (or log in if you already have one).
3. Create one or more rooms from the dashboard.
4. Click a room pill to open it.
5. Use the palette to add devices, then drag them around the room canvas.
6. Double-click a device to toggle it on/off.
7. Optionally add integrations for Google Home / Nest / Ring in the dashboard.

Enjoy!# home_automation
