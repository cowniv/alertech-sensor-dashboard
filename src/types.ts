export type DeviceId = string;

export interface Device {
  id: DeviceId;
  name: string;
  room: string;
}

export interface Reading {
  deviceId: DeviceId;
  timestamp: number; // ms since epoch
  temperature: number; // °C
  humidity: number; // %RH
  smoke: number; // ppm (MQ-2 style estimate)
}

export interface Thresholds {
  temperatureWarn: number;
  temperatureCritical: number;
  smokeWarn: number;
  smokeCritical: number;
  humidityLow: number; // dry air helps fires spread
  offlineAfterSec: number;
}

export type Severity = "info" | "warning" | "critical";

/** Everything the simulator can emit, as a discriminated union on `type`. */
export type SensorEvent =
  | { type: "reading"; reading: Reading }
  | { type: "fire-start"; deviceId: DeviceId; timestamp: number }
  | { type: "fire-end"; deviceId: DeviceId; timestamp: number }
  | { type: "disconnect"; deviceId: DeviceId; timestamp: number }
  | { type: "reconnect"; deviceId: DeviceId; timestamp: number };

export type AlertKind = "temperature" | "smoke" | "humidity" | "offline";

export interface Alert {
  id: string;
  deviceId: DeviceId;
