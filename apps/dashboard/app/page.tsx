"use client";

import { useState } from "react";

type Summary = {
  total_spend_usd: string;
  total_savings_usd: string;
  requests_count: string;
  cache_hits: string;
};

export default function Home() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
  const [tenantId, setTenantId] = useState("demo-tenant");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [status, setStatus] = useState("");

  const loadSummary = async () => {
    setStatus("Loading...");
    const res = await fetch(`${apiUrl}/dashboard/summary/${tenantId}`);
    const data = await res.json();
    setSummary(data);
    setStatus("Loaded");
  };

  return (
    <main className="container">
      <h1>AI Cost Optimisation Gateway MVP</h1>
      <p>Multi-tenant spend, savings, and cache visibility.</p>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Tenant Summary</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={tenantId} onChange={(e) => setTenantId(e.target.value)} />
          <button onClick={loadSummary}>Load</button>
          <span>{status}</span>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h4>Total Spend</h4>
          <p>${summary?.total_spend_usd ?? "0"}</p>
        </div>
        <div className="card">
          <h4>Total Savings</h4>
          <p>${summary?.total_savings_usd ?? "0"}</p>
        </div>
        <div className="card">
          <h4>Requests</h4>
          <p>{summary?.requests_count ?? "0"}</p>
        </div>
        <div className="card">
          <h4>Cache Hits</h4>
          <p>{summary?.cache_hits ?? "0"}</p>
        </div>
      </div>
    </main>
  );
}
