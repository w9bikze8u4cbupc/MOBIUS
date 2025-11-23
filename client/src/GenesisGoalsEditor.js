import React, { useEffect, useState } from "react";
import axios from "axios";

export function GenesisGoalsEditor({ projectId }) {
  const [goals, setGoals] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    axios
      .get(`/api/projects/${projectId}/goals`)
      .then((res) =>
        setGoals(
          res.data.goals || {
            minGrade: "B",
            minClarity: 0.75,
            maxDistance: 0.55,
          }
        )
      )
      .catch(() =>
        setGoals({
          minGrade: "B",
          minClarity: 0.75,
          maxDistance: 0.55,
        })
      );
  }, [projectId]);

  if (!projectId || !goals) return null;

  const update = (field, value) => {
    setGoals({ ...goals, [field]: value });
  };

  const save = async () => {
    setSaving(true);
    await axios.post(`/api/projects/${projectId}/goals`, goals);
    setSaving(false);
  };

  return (
    <div className="genesis-goals-editor">
      <h4>Quality Goals</h4>
      <label>Min Grade</label>
      <select
        value={goals.minGrade}
        onChange={(e) => update("minGrade", e.target.value)}
      >
        <option>A</option>
        <option>B</option>
        <option>C</option>
        <option>D</option>
        <option>F</option>
      </select>

      <label>Min Clarity</label>
      <input
        type="number"
        step="0.01"
        value={goals.minClarity}
        onChange={(e) => update("minClarity", parseFloat(e.target.value))}
      />

      <label>Max Distance</label>
      <input
        type="number"
        step="0.01"
        value={goals.maxDistance}
        onChange={(e) => update("maxDistance", parseFloat(e.target.value))}
      />

      <button onClick={save} disabled={saving}>
        Save
      </button>
    </div>
  );
}
