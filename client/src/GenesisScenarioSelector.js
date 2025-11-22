import React, { useEffect, useState } from 'react';
import axios from 'axios';

export function GenesisScenarioSelector({ projectId }) {
  const [scenarios, setScenarios] = useState([]);
  const [current, setCurrent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    axios
      .get('/api/genesis/scenarios')
      .then((res) => {
        if (cancelled) return;
        setScenarios(res.data || []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load scenarios.');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;

    axios
      .get(`/api/projects/${projectId}/scenario`)
      .then((res) => {
        if (cancelled) return;
        setCurrent(res.data.scenarioId || null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || 'Failed to load project scenario.');
      });

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (!projectId) return null;

  const handleChange = async (e) => {
    const scenarioId = e.target.value;
    setSaving(true);
    setError(null);
    try {
      await axios.post(`/api/projects/${projectId}/scenario`, { scenarioId });
      setCurrent(scenarioId);
    } catch (err) {
      setError(err.message || 'Failed to save scenario.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="genesis-scenario-selector">
      <h4>GENESIS Scenario</h4>
      {error && <div className="genesis-scenario-selector__error">{error}</div>}
      <select
        value={current || ''}
        onChange={handleChange}
        disabled={saving || scenarios.length === 0}
      >
        {scenarios.length === 0 && <option value="">No scenarios available</option>}
        {scenarios.length > 0 && !current && (
          <option value="">Select scenario…</option>
        )}
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      {current && (
        <p className="genesis-scenario-selector__desc">
          {scenarios.find((s) => s.id === current)?.description || ''}
        </p>
      )}
      {saving && <p>Saving…</p>}
    </div>
  );
}
