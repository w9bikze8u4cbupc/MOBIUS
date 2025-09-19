const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

(async () => {
  const base = process.env.API_BASE || 'http://127.0.0.1:5001';
  const res = await fetch(`${base}/start-extraction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bggUrl: 'https://boardgamegeek.com/boardgame/155987/abyss' })
  });
  assert(res.ok, `HTTP ${res.status}`);
  const data = await res.json();
  assert(data.success, 'missing success flag');
  assert(data.gameInfo, 'missing gameInfo');
  assert(data.gameInfo.gameName, 'missing gameName');
  assert(data.gameInfo.bggId, 'missing bggId');
  console.log('OK:', { 
    title: data.gameInfo.gameName, 
    id: data.gameInfo.bggId,
    components: data.components ? data.components.length : 0
  });
})().catch(e => { 
  console.error('Integration test failed:', e.message); 
  process.exit(1); 
});