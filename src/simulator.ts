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
