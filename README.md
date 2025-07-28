# 18 · ALERTECH Sensor Dashboard

**Roadmap stage:** Phase 6 – TypeScript + Tailwind · July 2025

**Inspired by:** ALERTECH, the fire detection system my team built for an Arduino hackathon (IoT nodes reading temperature, humidity and smoke, plus a dashboard for the fire station)

During the hackathon our dashboard was a quick page that just printed numbers. I rebuilt it properly in React + TypeScript. There's no hardware here, so a typed simulator module plays the Arduino nodes: four rooms send a reading every second, and every so often one of them "catches fire" or drops off the network.

### Features
- Simulator emits a discriminated union of events (`reading`, `fire-start`, `fire-end`, `disconnect`, `reconnect`)
- Live Recharts line chart per metric (temperature / smoke / humidity) for the last 60 seconds
- Per-device status cards: normal, warning, critical or offline
- Offline detection when a node hasn't reported for N seconds
- Threshold settings saved to localStorage
- Alert log with severity levels. A new alert is only raised when a condition escalates, so the log doesn't fill up with repeats every second
- Acknowledge one alert or all of them
