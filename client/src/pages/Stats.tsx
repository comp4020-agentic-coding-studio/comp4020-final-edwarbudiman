import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { Header } from "./Header.tsx";

interface StatsData {
  uptimeSec: number;
  memoryMB: { rss: number; heap: number };
  db: Record<string, number>;
  live: Record<string, number>;
  actionsLastHour: Record<string, number>;
}

// C10-02: a small live view of the running app, refreshed every few seconds.
export function Stats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = false;
    const load = () =>
      api<StatsData>("GET", "/api/stats")
        .then((d) => !stop && (setData(d), setError(null)))
        .catch((e) => !stop && setError(e.message));
    load();
    const t = setInterval(load, 5000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  const table = (title: string, rows: Record<string, number>) => (
    <section className="card">
      <h2>{title}</h2>
      <table className="stats">
        <tbody>
          {Object.entries(rows).length === 0 && (
            <tr>
              <td className="muted">nothing yet</td>
            </tr>
          )}
          {Object.entries(rows)
            .sort()
            .map(([k, v]) => (
              <tr key={k}>
                <th scope="row">{k}</th>
                <td>{v}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </section>
  );

  return (
    <>
      <Header />
      <main className="page stats-page">
        <h1>Live stats</h1>
        <p className="muted">Refreshes every 5 seconds. The full action log is one JSON line per action on the server's output.</p>
        {error && <p className="error">{error}</p>}
        {data && (
          <div className="grid">
            {table("Right now", { ...data.live, "memory (MB rss)": data.memoryMB.rss, "uptime (min)": Math.round(data.uptimeSec / 60) })}
            {table("Stored", data.db)}
            {table("Actions, last hour", data.actionsLastHour)}
          </div>
        )}
      </main>
    </>
  );
}
