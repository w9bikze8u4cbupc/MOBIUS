import React, { useEffect, useState, useRef } from "react";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";
const TOKEN = process.env.REACT_APP_API_TOKEN || "REPLACE_WITH_PROD_TOKEN";

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function fetchWithBackoff(url, options = {}, attempts = 4) {
  let base = 1000;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i === attempts - 1) throw err;
      const jitter = Math.random() * 300;
      await sleep(base + jitter);
      base *= 2;
    }
  }
}

export default function GlowingOrbWithBackend() {
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const wsRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;
    const wsUrl = `${API_BASE.replace(/^http/, "ws")}/ws/status/${jobId}?token=${TOKEN}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => console.log("ws open");
    ws.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        setStatus(payload.status);
        setProgress(payload.progress || 0);
        if (payload.result && payload.status === "success") {
          // handle final result if needed
          console.log("Result:", payload.result);
        }
      } catch (err) {
        console.error("ws parse", err);
      }
    };
    ws.onclose = () => console.log("ws closed");
    ws.onerror = (e) => console.error("ws error", e);
    return () => { ws.close(); wsRef.current = null; };
  }, [jobId]);

  const startIngest = async (file, metadata = "{}") => {
    try {
      // create formdata if file present
      let body;
      let headers = { "Authorization": `Bearer ${TOKEN}` };
      if (file) {
        body = new FormData();
        body.append("file", file, file.name);
        body.append("metadata", metadata);
      } else {
        headers["Content-Type"] = "application/json";
        body = JSON.stringify({ metadata });
      }
      const res = await fetchWithBackoff(`${API_BASE}/api/ingest`, { method: "POST", body, headers });
      const json = await res.json();
      setJobId(json.job_id);
      setStatus("queued");
      setProgress(0);
    } catch (err) {
      console.error("startIngest failed", err);
      setStatus("error");
    }
  };

  // UI: simplified orb + controls
  return (
    <div>
      <div id="glowing-orb" style={{ width: 320, height: 320, borderRadius: "50%", background: "radial-gradient(circle,#66f,#0af)" }}>
        <div style={{ color: "#fff", padding: 12 }}>
          <h3>Glowing Orb</h3>
          <p>Status: {status || "idle"}</p>
          <p>Progress: {progress}%</p>
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        <input id="file" type="file" />
        <button onClick={() => {
          const f = document.getElementById("file").files[0];
          startIngest(f, JSON.stringify({ source: "glowing-orb-ui" }));
        }}>Start Ingest</button>
        <button onClick={() => {
          if (jobId) {
            // fallback poll status
            fetch(`${API_BASE}/api/status/${jobId}`, { headers: { "Authorization": `Bearer ${TOKEN}` } })
              .then(r => r.json()).then(j => { setStatus(j.status); setProgress(j.progress); });
          }
        }}>Poll Status</button>
      </div>
    </div>
  );
}