# Wind Turbine IoT Monitoring System — Backend

This is the backend API for the Wind Turbine IoT Monitoring System.

## Setup

```bash
npm install
```

## Configuration

Create a `.env` file:

```
PORT=5000
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/windturbine?retryWrites=true&w=majority

# Optional — blade pitch control target.
# Leave ESP32_BASE_URL unset to run in simulator mode: pitch commands are
# accepted and the live simulator acts on them, but nothing is sent over the
# network. Set it once the ESP32 has a known address.
ESP32_BASE_URL=http://<esp32-ip>
ESP32_TIMEOUT_MS=8000
```

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `PORT` | no | `5000` | Port the API listens on |
| `MONGO_URI` | **yes** | — | MongoDB Atlas connection string |
| `ESP32_BASE_URL` | no | *(unset)* | Base URL of the turbine controller, e.g. `http://192.168.1.50`. Unset = simulator mode |
| `ESP32_TIMEOUT_MS` | no | `8000` | How long to wait for the controller to answer a pitch command |

> **Note:** Never commit `.env` or expose credentials. The `.gitignore` already excludes `.env`.
> Give the ESP32 a fixed address (static IP or a DHCP reservation) before setting `ESP32_BASE_URL` —
> a DHCP lease can change between boots.

## Running

```bash
# Start the server
npm start

# Seed simulated data (~300 records)
npm run seed
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/telemetry` | Submit telemetry |
| GET | `/api/telemetry/latest` | Latest measurement |
| GET | `/api/telemetry/history` | Historical data (with filters) |
| GET | `/api/analytics/summary` | Summary statistics |
| GET | `/api/analytics/power` | Power analysis data |
| POST | `/api/control/pitch` | Command a blade pitch angle — body `{ "angle": <number> }` |
| GET | `/api/control/pitch` | Last accepted command, enforced limits, and current target |

### Pitch control

`POST /api/control/pitch` validates the angle (−30° to +30°) and forwards it to the
controller as `GET <ESP32_BASE_URL>/pitch?deg=<angle>` — a query parameter, because that is
what the firmware reads. With `ESP32_BASE_URL` unset the command is recorded instead and the
live simulator picks it up.

Response `data.status` is one of:

| Status | HTTP | Meaning |
|---|---|---|
| `accepted` | 200 | Recorded for the simulator (no controller configured) |
| `acknowledged` | 200 | The controller received the command |
| `unconfirmed` | 202 | Timed out. **Not a failure** — the stepper move blocks, so it may still have run |
| `busy` | 409 | Another command is still outstanding |
| `unexpected_response` | 502 | The controller replied with something unusable |
| `unreachable` | 503 | Could not connect to the controller |

An acknowledgement means the command was received, not that the blade reached the angle —
there is no encoder. The reported position arrives separately as `pitchAngle` in telemetry.

## Seed Data

The seed script generates **SIMULATED DATA** across 3 experiments:

| Experiment | Pitch | Wind Range |
|------------|-------|------------|
| EXP-001 | 0° | 2–4 m/s |
| EXP-002 | 4° | 3–6 m/s |
| EXP-003 | 20° | 5–8 m/s |

All seeded records have `source: "simulator"`.
