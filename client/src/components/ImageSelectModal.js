// client/src/components/ImageSelectModal.jsx
import React, { useMemo, useState, useEffect } from 'react';
import { isLikelyComponent, scoreImage } from '../utils/componentHeuristics';

export default function ImageSelectModal({ images = [], isOpen, onClose, onConfirm, title = 'Choose Images' }) {
  const [selected, setSelected] = useState(new Set());
  const [filterTab, setFilterTab] = useState('all'); // 'all' | 'components' | 'other'
  const [sortKey, setSortKey] = useState('score');   // 'score' | 'size' | 'name'

  useEffect(() => {
    // Reset selection when modal opens or image list changes
    setSelected(new Set());
  }, [isOpen, images]);

  const withScores = useMemo(() => {
    return (images || []).map((img) => ({ ...img, __score: scoreImage(img), __likely: isLikelyComponent(img) }));
  }, [images]);

  const filtered = useMemo(() => {
    if (filterTab === 'components') return withScores.filter((x) => x.__likely);
    if (filterTab === 'other') return withScores.filter((x) => !x.__likely);
    return withScores;
  }, [withScores, filterTab]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    if (sortKey === 'size') {
      arr.sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
    } else if (sortKey === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else {
      // score (default)
      arr.sort((a, b) => (b.__score || 0) - (a.__score || 0));
    }
    return arr;
  }, [filtered, sortKey]);

  const toggle = (url) => {
    const next = new Set(selected);
    if (next.has(url)) next.delete(url);
    else next.add(url);
    setSelected(next);
  };

  const selectAll = () => setSelected(new Set(sorted.map((x) => x.url)));
  const clearAll = () => setSelected(new Set());

  if (!isOpen) return null;

  return (
    <div style={S.overlay} role="dialog" aria-modal="true">
      <div style={S.body}>
        <div style={S.headerRow}>
          <h3 style={S.title}>{title}</h3>
          <button onClick={onClose} style={S.closeButton}>×</button>
        </div>
        <div style={S.header}>
          <div style={S.tabs}>
            <button style={tabStyle(filterTab === 'all')} onClick={() => setFilterTab('all')}>All</button>
            <button style={tabStyle(filterTab === 'components')} onClick={() => setFilterTab('components')}>Components</button>
            <button style={tabStyle(filterTab === 'other')} onClick={() => setFilterTab('other')}>Other</button>
          </div>
          <div style={S.sortRow}>
            <label style={{ marginRight: 8 }}>Sort:</label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
              <option value="score">Score</option>
              <option value="size">Size</option>
              <option value="name">Name</option>
            </select>
            <div style={{ flex: 1 }} />
            <button onClick={selectAll}>Select All</button>
            <button onClick={clearAll}>Clear All</button>
          </div>
        </div>

        <div style={S.grid}>
          {sorted.map((img, i) => {
            const isSel = selected.has(img.url);
            return (
              <button
                key={img.url || i}
                onClick={() => toggle(img.url)}
                title={`${img.name || ''}${img.page != null ? ` (p${img.page})` : ''}`}
                style={{
                  ...S.thumb,
                  outline: isSel ? '2px solid #4da3ff' : '1px solid #333',
                  borderColor: img.__likely ? '#f39c12' : '#333',
                }}
              >
                <img
                  src={img.url}
                  alt={img.name || `img-${i}`}
                  loading="lazy"
                  crossOrigin="anonymous"
                  style={S.img}
                />
                <div style={S.meta}>
                  <span>{img.page != null ? `p${img.page}` : ''}</span>
                  {img.width && img.height ? <span> · {img.width}×{img.height}</span> : null}
                  <span> · {img.type || ''}</span>
                  {typeof img.__score === 'number' ? <span> · ★ {img.__score.toFixed(1)}</span> : null}
                </div>
              </button>
            );
          })}
        </div>

        <div style={S.actions}>
          <button onClick={onClose}>Cancel</button>
          <button
            disabled={selected.size === 0}
            onClick={() => onConfirm(sorted.filter((x) => selected.has(x.url)))}
          >
            Use {selected.size} image{selected.size !== 1 ? 's' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', zIndex: 9999,
  },
  body: {
    margin: 'auto', background: '#111', color: '#fff', padding: 16, width: '92vw', maxWidth: 1100, borderRadius: 8,
    boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
  },
  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { margin: 0, fontSize: '1.2em', color: '#fff' },
  closeButton: { background: 'transparent', border: 'none', color: '#fff', fontSize: '1.5em', cursor: 'pointer', padding: 4 },
  header: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 },
  tabs: { display: 'flex', gap: 6 },
  sortRow: { display: 'flex', alignItems: 'center', gap: 8 },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, maxHeight: '65vh', overflow: 'auto',
  },
  thumb: { position: 'relative', padding: 0, background: '#000', cursor: 'pointer', border: '1px solid #333' },
  img: { width: '100%', height: 140, objectFit: 'contain', background: '#222' },
  meta: {
    position: 'absolute', left: 6, bottom: 6, background: 'rgba(0,0,0,0.6)', padding: '2px 6px', borderRadius: 10, fontSize: 11,
  },
  actions: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 },
};

function tabStyle(active) {
  return {
    padding: '6px 10px',
    background: active ? '#2d2d2d' : '#1a1a1a',
    border: active ? '1px solid #666' : '1px solid #333',
    color: '#fff',
    borderRadius: 6,
    cursor: 'pointer',
  };
}