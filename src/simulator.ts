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

      if (s.fireTicks > 0) {
        s.temperature += rand(1.2, 3.5);
        s.smoke += rand(40, 120);
        s.humidity -= rand(0.5, 1.5);
        s.fireTicks--;
        if (s.fireTicks === 0) onEvent({ type: "fire-end", deviceId: d.id, timestamp: now });
      } else {
        // relax back toward the baseline
        s.temperature += (28 - s.temperature) * 0.15 + rand(-0.3, 0.3);
        s.smoke += (40 - s.smoke) * 0.2 + rand(-5, 5);
        s.humidity += (62 - s.humidity) * 0.1 + rand(-0.5, 0.5);
      }

      s.temperature = clamp(s.temperature, 15, 120);
      s.humidity = clamp(s.humidity, 10, 95);
      s.smoke = clamp(s.smoke, 0, 2000);

      const reading: Reading = {
        deviceId: d.id,
        timestamp: now,
        temperature: round1(s.temperature),
        humidity: round1(s.humidity),
        smoke: Math.round(s.smoke),
      };
      onEvent({ type: "reading", reading });
    }
  };

  const handle = setInterval(tick, intervalMs);
  return {
    stop: () => clearInterval(handle),
    triggerFire: (id) => ignite(id, Date.now()),
  };
}
