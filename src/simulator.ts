import type { Device, DeviceId, Reading, SensorEvent } from "./types";

export const DEVICES: Device[] = [
  { id: "ALT-01", name: "Node 01", room: "Kitchen" },
  { id: "ALT-02", name: "Node 02", room: "Living Room" },
  { id: "ALT-03", name: "Node 03", room: "Bedroom" },
  { id: "ALT-04", name: "Node 04", room: "Storage Room" },
];

interface DeviceState {
  temperature: number;
  humidity: number;
  smoke: number;
  fireTicks: number; // > 0 while a fire scenario is running
  offlineTicks: number; // > 0 while the device is "unplugged"
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const round1 = (v: number) => Math.round(v * 10) / 10;

export interface SimulatorOptions {
  intervalMs?: number;
  fireChance?: number; // chance per device per tick
  dropChance?: number;
}

export interface Simulator {
  stop: () => void;
  triggerFire: (id: DeviceId) => void;
}

/**
 * Stands in for the Arduino nodes. Each tick every device drifts around a
 * baseline. Sometimes a fire scenario ramps temperature and smoke up, and
 * sometimes a device stops reporting so offline detection has work to do.
