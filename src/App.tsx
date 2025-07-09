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
