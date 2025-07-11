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
    for (const d of DEVICES) {
      const key = `${d.id}:offline`;
      if (lastSeen[d.id] !== undefined && isOffline(d.id) && !active.current.has(key)) {
        active.current.set(key, "warning");
        pushAlert(
          makeAlert(d.id, { kind: "offline", severity: "warning", message: `${d.room} node stopped reporting` }, now)
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const chartData = useMemo(() => {
    const rows = new Map<number, Record<string, number>>();
    for (const d of DEVICES) {
      for (const r of history[d.id] ?? []) {
        const sec = Math.floor(r.timestamp / 1000) * 1000;
        const row = rows.get(sec) ?? { t: sec };
        row[d.id] = r[metric];
        rows.set(sec, row);
      }
    }
    return [...rows.values()].sort((a, b) => a.t - b.t);
  }, [history, metric]);

  const unacked = alerts.filter((a) => !a.acknowledged).length;
  const visibleAlerts = showAcked ? alerts : alerts.filter((a) => !a.acknowledged);
  const ack = (id: string) => setAlerts((p) => p.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  const ackAll = () => setAlerts((p) => p.map((a) => ({ ...a, acknowledged: true })));

  const setT = (key: keyof Thresholds, value: number) => setThresholds({ ...thresholds, [key]: value });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-orange-400">ALERT</span>ECH · Firestation Dashboard
          </h1>
          <p className="text-xs text-slate-400">Simulated IoT nodes · temperature, humidity, smoke · 1 reading/sec</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${unacked ? "bg-fire text-white" : "bg-slate-800"}`}>
            {unacked} unacknowledged
          </span>
          <button className="btn bg-slate-800 hover:bg-slate-700" onClick={() => setPaused((p) => !p)}>
            {paused ? "Resume" : "Pause"} feed
          </button>
          <button
            className="btn bg-orange-500 text-slate-950 hover:bg-orange-400"
            onClick={() => downloadText(`alertech-readings-${Date.now()}.csv`, readingsToCsv(log.current))}
          >
            Export CSV
          </button>
        </div>
      </header>

      <main className="grid gap-4 p-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Devices">
            {DEVICES.map((d, i) => {
              const latest = history[d.id]?.slice(-1)[0];
              const offline = isOffline(d.id);
              const status = statusFor(latest, thresholds, offline);
              return (
                <article key={d.id} className={`panel border-2 ${STATUS_STYLE[status]}`}>
                  <div className="flex items-center justify-between">
                    <h2 className="font-semibold text-slate-100">
                      <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLORS[i] }} />
                      {d.room}
                    </h2>
                    <span className="text-xs font-bold uppercase">{status}</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    {d.id} · last seen {lastSeen[d.id] ? time(lastSeen[d.id]) : "never"}
                  </p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-slate-200">
                    {(Object.keys(METRICS) as Metric[]).map((m) => (
                      <div key={m} className="rounded-lg bg-slate-950 py-2">
                        <dt className="text-[10px] uppercase text-slate-500">{METRICS[m].label}</dt>
                        <dd className="font-mono text-sm">
                          {latest && !offline ? `${latest[m]}${METRICS[m].unit}` : "—"}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <button
                    className="mt-3 text-xs text-slate-500 underline hover:text-orange-400"
                    onClick={() => sim.current?.triggerFire(d.id)}
                  >
                    Simulate fire here
                  </button>
                </article>
              );
            })}
          </section>

          <section className="panel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Live readings (last {HISTORY}s)</h2>
              <div role="tablist" className="flex gap-1">
                {(Object.keys(METRICS) as Metric[]).map((m) => (
                  <button
                    key={m}
                    role="tab"
                    aria-selected={metric === m}
                    onClick={() => setMetric(m)}
                    className={`btn ${metric === m ? "bg-orange-500 text-slate-950" : "bg-slate-800 hover:bg-slate-700"}`}
                  >
                    {METRICS[m].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid stroke="#1e293b" />
                  <XAxis dataKey="t" tickFormatter={time} stroke="#64748b" fontSize={11} minTickGap={40} />
                  <YAxis stroke="#64748b" fontSize={11} unit={METRICS[metric].unit} width={60} />
                  <Tooltip
                    labelFormatter={(v) => time(Number(v))}
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155" }}
                  />
                  <Legend />
                  {DEVICES.map((d, i) => (
                    <Line
                      key={d.id}
                      dataKey={d.id}
                      name={d.room}
                      stroke={COLORS[i]}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel">
            <h2 className="mb-3 font-semibold">Thresholds</h2>
            <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => e.preventDefault()}>
              {(
                [
                  ["temperatureWarn", "Temp warning (°C)"],
                  ["temperatureCritical", "Temp critical (°C)"],
                  ["smokeWarn", "Smoke warning (ppm)"],
                  ["smokeCritical", "Smoke critical (ppm)"],
                  ["humidityLow", "Low humidity (%)"],
                  ["offlineAfterSec", "Offline after (s)"],
                ] as [keyof Thresholds, string][]
              ).map(([key, label]) => (
                <label key={key} className="text-xs text-slate-400">
                  {label}
                  <input
                    type="number"
                    className="input mt-1"
                    value={thresholds[key]}
                    min={0}
                    onChange={(e) => setT(key, Number(e.target.value))}
                  />
                </label>
              ))}
            </form>
            <button className="mt-3 text-xs text-slate-400 underline" onClick={() => setThresholds(DEFAULT_THRESHOLDS)}>
              Reset to defaults
            </button>
          </section>
        </div>

        <aside className="panel flex max-h-[calc(100vh-7rem)] flex-col lg:sticky lg:top-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Alert log</h2>
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1 text-slate-400">
                <input type="checkbox" checked={showAcked} onChange={(e) => setShowAcked(e.target.checked)} />
                show acked
              </label>
              <button className="btn bg-slate-800 hover:bg-slate-700" onClick={ackAll} disabled={!unacked}>
                Ack all
              </button>
            </div>
          </div>
          <ul className="flex-1 space-y-2 overflow-y-auto" aria-live="polite">
            {visibleAlerts.length === 0 && <li className="text-sm text-slate-500">All clear.</li>}
            {visibleAlerts.map((a) => {
              const device = DEVICES.find((d) => d.id === a.deviceId);
              return (
                <li key={a.id} className={`rounded-lg p-3 text-sm ${SEVERITY_STYLE[a.severity]} ${a.acknowledged ? "opacity-50" : ""}`}>
                  <div className="flex items-center justify-between">
                    <strong className="uppercase text-xs">{a.severity}</strong>
                    <span className="text-xs opacity-70">{time(a.timestamp)}</span>
                  </div>
                  <p className="text-slate-100">
                    {device?.room}: {a.message}
                  </p>
                  {!a.acknowledged && (
                    <button className="mt-1 text-xs underline" onClick={() => ack(a.id)}>
                      Acknowledge
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      </main>
    </div>
  );
}
