import React, { useEffect, useState } from 'react';

const backend = process.env.REACT_APP_BACKEND_URL || '';

function VisualReview({ item, failedImages, setFailedImages }) {
  const [visible, setVisible] = useState(6);
  const referents = item.requiredReferents || (item.requiredObjects || []).map((id) => ({ id }));
  const candidates = item.candidates || [];
  return <details>
    <summary>{referents.map((r) => r.name || r.id).join(', ') || 'Référent à préciser'} — {item.sceneId || item.id}</summary>
    <p>{item.teachingPurpose}</p><p>{item.reason}</p>
    {item.autoAnalysisExhausted === false && <p>Analyse automatique partielle : cette revue ne prouve pas une ambiguïté de la source.</p>}
    <p>Décision demandée : {item.recommendedOperatorAction}</p>
    {item.physicalStateRequirement && <details><summary>État physique demandé</summary><pre>{JSON.stringify(item.physicalStateRequirement, null, 2)}</pre></details>}
    {!candidates.length && <p>Aucun candidat : une preuve source supplémentaire est nécessaire.</p>}
    {candidates.length > 0 && <p>{Math.min(visible, candidates.length)} candidats affichés sur {candidates.length}. Les candidats non affichés restent conservés.</p>}
    {candidates.slice(0, visible).map((candidate) => <article key={candidate.assetId}>
      <h4>{candidate.assetId}</h4>
      {failedImages[candidate.assetId] ? <p role="alert">Image indisponible — revue visuelle non vérifiable.</p>
        : <img loading="lazy" width="320" height="240" style={{ objectFit: 'contain' }}
          src={`${backend}${candidate.thumbnailUrl}`} alt={`Candidat ${candidate.assetId}`}
          onError={() => setFailedImages((prior) => ({ ...prior, [candidate.assetId]: true }))} />}
      <p>{(candidate.rejectionReasons || []).join(' ; ')}</p>
      <p>Score lexical (hypothèse) : {candidate.semanticScore} — Détail source : {candidate.detailRatio}</p>
      {(candidate.objectVisualEvidence || []).map((e, index) => <p key={index}>Objet {e.requiredObject} : {e.present ? 'repéré' : 'non confirmé'} — {e.reason}</p>)}
      <details><summary>Sources, mesures et tentatives</summary><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify({ sources: candidate.sourceRefs, preuves: candidate.objectVisualEvidence, tentatives: candidate.objectAnalysisAttempts, hypotheses: candidate.bindingHypotheses }, null, 2)}</pre></details>
    </article>)}
    {visible < candidates.length && <button type="button" onClick={() => setVisible((count) => count + 6)}>Afficher les candidats suivants</button>}
  </details>;
}

/** Read-only evidence surface for the existing canonical queue; never adjudicates automatically. */
export function CanonicalVisualReviews({ projectId }) {
  const [state, setState] = useState({ items: [], error: null });
  const [failedImages, setFailedImages] = useState({});
  useEffect(() => {
    let active = true;
    setState({ items: [], error: null });
    setFailedImages({});
    if (projectId && typeof fetch !== 'function') { setState({ items: [], error: 'HTTP unavailable' }); return () => { active = false; }; }
    if (projectId) Promise.resolve(fetch(`${backend}/api/projects/${encodeURIComponent(projectId)}/visual-reviews`))
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .then((payload) => { if (active) setState({ items: payload.items || [], error: null }); })
      .catch((error) => { if (active) setState({ items: [], error: error.message }); });
    return () => { active = false; };
  }, [projectId]);
  if (!projectId) return null;
  return <section aria-label="Canonical visual evidence">
    <h3>Preuves et ambiguïtés visuelles</h3>
    {state.error && <p role="alert">Chargement des revues impossible : {state.error}</p>}
    {state.items.map((item) => <VisualReview key={item.id} item={item} failedImages={failedImages} setFailedImages={setFailedImages}/>)}
  </section>;
}
