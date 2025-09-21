// client/src/components/DebugChips.jsx
import React from 'react';

const QA_ENABLED =
  String(process.env.REACT_APP_QA_LABELS || '').toLowerCase() === 'true';

export default function DebugChips({ info }) {
  const [open, setOpen] = React.useState(false);

  if (!QA_ENABLED) return null;
  if (!info) return null;

  return (
    <div style={{ position: 'fixed', bottom: 8, right: 8, zIndex: 9999 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: '#333',
          color: '#fff',
          padding: '6px 10px',
          borderRadius: 6,
          border: '1px solid #555',
          marginBottom: 6,
          cursor: 'pointer',
        }}
      >
        {open ? 'Hide QA' : 'Show QA'}
      </button>
      {open && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            background: '#111a',
            padding: 8,
            borderRadius: 6,
            border: '1px solid #444',
          }}
        >
          {Object.entries(info).map(([k, v]) => (
            <span
              key={k}
              style={{
                background: '#222',
                color: '#ddd',
                border: '1px solid #444',
                borderRadius: 999,
                padding: '4px 8px',
                fontSize: 12,
              }}
            >
              {k}: {String(v)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
