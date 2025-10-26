// ---- Utilities ----
export function uid() { 
  return Math.random().toString(36).slice(2, 9); 
}

export function loadInitial() {
  const cached = localStorage.getItem('mobius_script_v1');
  if (cached) try { return JSON.parse(cached); } catch {}
  // Seed with a sample storyboard (replace with ingest output mapping)
  return [
    { 
      id: uid(), 
      title: 'Setup', 
      steps: [
        { id: uid(), text: 'Lay out the board and shuffle all decks.' },
        { id: uid(), text: 'Give each player their starting resources.' },
      ]
    },
    { 
      id: uid(), 
      title: 'Turn Structure', 
      steps: [
        { id: uid(), text: 'On your turn, draw a card and take one action.' },
        { id: uid(), text: 'Resolve end-of-turn effects.' },
      ]
    },
  ];
}

export function persist(chapters) {
  localStorage.setItem('mobius_script_v1', JSON.stringify(chapters));
}

export function toSrt(chapters) {
  let i = 1; 
  const lines = [];
  let t = 0;
  for (const ch of chapters) {
    lines.push(String(i++));
    lines.push(formatTime(t) + ' --> ' + formatTime(t + 3000));
    lines.push(ch.title);
    lines.push('');
    t += 3000;
    for (const st of ch.steps) {
      lines.push(String(i++));
      lines.push(formatTime(t) + ' --> ' + formatTime(t + 4000));
      lines.push(st.text);
      lines.push('');
      t += 4000;
    }
  }
  return lines.join('\n');
}

export function formatTime(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const msPart = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(msPart).padStart(3, '0')}`;
}

export function pad(n){ 
  return String(n).padStart(2,'0'); 
}

export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; 
  a.download = filename; 
  a.click();
  URL.revokeObjectURL(url);
}