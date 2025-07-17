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
