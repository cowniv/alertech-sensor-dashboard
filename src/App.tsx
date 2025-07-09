import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DEFAULT_THRESHOLDS, downloadText, evaluate, makeAlert, readingsToCsv, statusFor } from "./alerts";
import { DEVICES, startSimulator, type Simulator } from "./simulator";
import type { Alert, AlertKind, DeviceId, DeviceStatus, Reading, SensorEvent, Severity, Thresholds } from "./types";
import { useLocalStorage } from "./useLocalStorage";

const HISTORY = 60; // seconds of readings kept per device for the charts
const MAX_LOG = 5000; // readings kept for CSV export
const COLORS = ["#f97316", "#38bdf8", "#a3e635", "#e879f9"];

type Metric = "temperature" | "smoke" | "humidity";
const METRICS: Record<Metric, { label: string; unit: string }> = {
  temperature: { label: "Temperature", unit: "°C" },
  smoke: { label: "Smoke", unit: "ppm" },
  humidity: { label: "Humidity", unit: "%" },
};

const STATUS_STYLE: Record<DeviceStatus, string> = {
  normal: "border-ok/40 text-ok",
  warning: "border-warn/60 text-warn",
  critical: "border-fire text-fire animate-pulse",
  offline: "border-slate-700 text-slate-500",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  info: "bg-sky-500/15 text-sky-300",
  warning: "bg-warn/15 text-warn",
  critical: "bg-fire/20 text-fire",
};

const rank: Record<Severity, number> = { info: 1, warning: 2, critical: 3 };
const time = (ts: number) => new Date(ts).toLocaleTimeString();

export default function App() {
  const [thresholds, setThresholds] = useLocalStorage<Thresholds>("alertech:thresholds", DEFAULT_THRESHOLDS);
  const [history, setHistory] = useState<Record<DeviceId, Reading[]>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [lastSeen, setLastSeen] = useState<Record<DeviceId, number>>({});
  const [now, setNow] = useState(Date.now());
  const [metric, setMetric] = useState<Metric>("temperature");
  const [paused, setPaused] = useState(false);
  const [showAcked, setShowAcked] = useState(false);

  const log = useRef<Reading[]>([]);
  const sim = useRef<Simulator | null>(null);
  // remembers the highest active severity per device+kind so we don't spam alerts every second
  const active = useRef(new Map<string, Severity>());
  const thresholdsRef = useRef(thresholds);
  thresholdsRef.current = thresholds;

  const pushAlert = (a: Alert) => setAlerts((prev) => [a, ...prev].slice(0, 200));

  useEffect(() => {
    if (paused) return;
    const handle = (e: SensorEvent) => {
      switch (e.type) {
        case "reading": {
          const r = e.reading;
          log.current.push(r);
          if (log.current.length > MAX_LOG) log.current.shift();
          setLastSeen((p) => ({ ...p, [r.deviceId]: r.timestamp }));
          setHistory((p) => ({ ...p, [r.deviceId]: [...(p[r.deviceId] ?? []), r].slice(-HISTORY) }));

          const checks = evaluate(r, thresholdsRef.current);
          const firing = new Set<AlertKind>();
          for (const c of checks) {
            firing.add(c.kind);
            const key = `${r.deviceId}:${c.kind}`;
            const prev = active.current.get(key);
            if (!prev || rank[c.severity] > rank[prev]) {
              active.current.set(key, c.severity);
              pushAlert(makeAlert(r.deviceId, c, r.timestamp));
            }
          }
          for (const k of ["temperature", "smoke", "humidity"] as const) {
            if (!firing.has(k)) active.current.delete(`${r.deviceId}:${k}`);
          }
          active.current.delete(`${r.deviceId}:offline`);
          break;
        }
        case "fire-start":
        case "fire-end":
          // ground truth from the simulator; shown in the console for debugging only
          console.debug(`[sim] ${e.type} @ ${e.deviceId}`);
          break;
        case "disconnect":
        case "reconnect":
          console.debug(`[sim] ${e.type} @ ${e.deviceId}`);
          break;
      }
    };
    sim.current = startSimulator(handle);
    return () => sim.current?.stop();
  }, [paused]);

  // clock for offline detection
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const isOffline = (id: DeviceId) =>
    !paused && (lastSeen[id] === undefined || now - lastSeen[id] > thresholds.offlineAfterSec * 1000);

  useEffect(() => {
    if (paused) return;
