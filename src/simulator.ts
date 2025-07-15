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
 */
export function startSimulator(
  onEvent: (e: SensorEvent) => void,
  { intervalMs = 1000, fireChance = 0.004, dropChance = 0.002 }: SimulatorOptions = {}
): Simulator {
  const state = new Map<DeviceId, DeviceState>(
    DEVICES.map((d) => [
      d.id,
      { temperature: rand(26, 30), humidity: rand(55, 70), smoke: rand(20, 60), fireTicks: 0, offlineTicks: 0 },
    ])
  );

  const ignite = (id: DeviceId, now: number) => {
    const s = state.get(id);
    if (!s || s.fireTicks > 0 || s.offlineTicks > 0) return;
    s.fireTicks = Math.round(rand(20, 40));
    onEvent({ type: "fire-start", deviceId: id, timestamp: now });
  };

  const tick = () => {
    const now = Date.now();
    for (const d of DEVICES) {
      const s = state.get(d.id)!;

      if (s.offlineTicks > 0) {
        s.offlineTicks--;
        if (s.offlineTicks === 0) onEvent({ type: "reconnect", deviceId: d.id, timestamp: now });
        continue;
      }
      if (s.fireTicks === 0 && Math.random() < dropChance) {
        s.offlineTicks = Math.round(rand(12, 25));
        onEvent({ type: "disconnect", deviceId: d.id, timestamp: now });
        continue;
      }

      if (Math.random() < fireChance) ignite(d.id, now);
