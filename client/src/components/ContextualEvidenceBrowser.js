import React, { useEffect, useMemo, useRef, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL !== undefined ? process.env.REACT_APP_BACKEND_URL : '';
const CONTEXTUAL_ROLES = Object.freeze({
  game_overview: ['rulebook_reference'],
  assembled_tableau: ['rulebook_reference'],
  board_setup: ['board_setup_context'],
  rulebook_reference: ['rulebook_reference'],
});

export function contextualRolesForIntent(intent) {
  return CONTEXTUAL_ROLES[intent] || [];
}

export function canBrowseContextualEvidence(intent) {
  return contextualRolesForIntent(intent).length > 0;
}

export function contextualAssetThumbnailUrl(asset) {
  return asset?.kind === 'contextual_page' || asset?.kind === 'contextual_crop' ? asset.url || null : null;
}

export function contextualAssetFileUrl(projectId, assetId, variant = 'full') {
  if (!projectId || typeof assetId !== 'string' || !assetId) return null;
  const origin = BACKEND_URL.replace(/\/+$/, '');
  return `${origin}/api/projects/${encodeURIComponent(projectId)}/contextual-assets/${encodeURIComponent(assetId)}/file?variant=${variant}`;
}

function apiUrl(projectId, suffix) {
  const origin = BACKEND_URL.replace(/\/+$/, '');
  return `${origin}/api/projects/${encodeURIComponent(projectId)}/contextual-evidence${suffix}`;
}

function inventoryUrl(projectId) {
  const origin = BACKEND_URL.replace(/\/+$/, '');
  return `${origin}/api/projects/${encodeURIComponent(projectId)}/images`;
}

function cropUrl(projectId, pageId) {
  return apiUrl(projectId, `/pages/${encodeURIComponent(pageId)}/crops`);
}

function availablePage(page) {
  return page && typeof page.id === 'string' && Number.isInteger(Number(page.pageNumber ?? page.index))
    && Number(page.width) > 0 && Number(page.height) > 0;
}

function cropIsWithinPage(crop, page) {
  const x = Number(crop.x);
  const y = Number(crop.y);
  const width = Number(crop.width);
  const height = Number(crop.height);
  return Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(width) && Number.isInteger(height)
    && x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= page.width && y + height <= page.height;
}

function sourceFacts(candidate, projectId) {
  if (!candidate) return null;
  return <div aria-label="Verified source facts" style={{ margin: '8px 0', padding: 8, background: '#fff', border: '1px solid #d0d7de' }}>
    <strong>{candidate.filename}</strong><div>Project: {projectId}</div><div>Size: {candidate.bytes} bytes · SHA-256: {candidate.sha256Prefix || candidate.sha256?.slice(0, 12) || 'pending'} · Pages: {candidate.pageCount ?? 'pending'}</div>
    <div>Adoption creates a private project-owned PDF copy and review-page rasters locally.</div>
  </div>;
}

async function responseJson(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.code || `HTTP_${response.status}`);
    error.status = response.status;
    error.correlationId = typeof body?.correlationId === 'string' ? body.correlationId : null;
    throw error;
  }
  return body;
}

function publicFailure(error, fallback) {
  const code = error?.message || fallback;
  return process.env.NODE_ENV === 'development' && error?.correlationId
    ? `${code} · reference ${error.correlationId}`
    : code;
}

export function ContextualEvidenceBrowser({ isOpen, onClose, onSelect, projectId, sceneId, plan = {} }) {
  const [inventory, setInventory] = useState(null);
  const [status, setStatus] = useState('idle');
  const [discovery, setDiscovery] = useState(null);
  const [localPreview, setLocalPreview] = useState(null);
  const [adoptionStatus, setAdoptionStatus] = useState('idle');
  const [legacyConfirmed, setLegacyConfirmed] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [role, setRole] = useState('rulebook_reference');
  const [confirmed, setConfirmed] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [cropStatus, setCropStatus] = useState('idle');
  const [error, setError] = useState('');
  const currentProject = useRef({ projectId, isOpen });
  const allowedRoles = contextualRolesForIntent(plan.primaryIntent);
  const pages = useMemo(() => (Array.isArray(inventory?.pages) ? inventory.pages.filter(availablePage) : []), [inventory]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;
  const eligibleLegacy = discovery?.eligibleCandidate || null;
  const isCurrentProject = () => currentProject.current.projectId === projectId && currentProject.current.isOpen === true;

  useEffect(() => {
    currentProject.current = { projectId, isOpen };
    return () => {
      if (currentProject.current.projectId === projectId) currentProject.current = { projectId, isOpen: false };
    };
  }, [projectId, isOpen]);

  const refreshInventory = async (stillCurrent = isCurrentProject) => {
    const data = await responseJson(await fetch(inventoryUrl(projectId)));
    if (!stillCurrent()) return false;
    const contextual = data?.contextualEvidence;
    if (!contextual || contextual.available !== true) {
      const unavailable = new Error(contextual?.code || 'CONTEXTUAL_EVIDENCE_UNAVAILABLE');
      unavailable.status = 404;
      throw unavailable;
    }
    setInventory(contextual);
    setSelectedPageId(Array.isArray(contextual.pages) && contextual.pages[0]?.id ? contextual.pages[0].id : null);
    setStatus('ready');
    return true;
  };

  useEffect(() => {
    if (!isOpen || !projectId || !canBrowseContextualEvidence(plan.primaryIntent)) return undefined;
    let active = true;
    setStatus('loading');
    setError('');
    setDiscovery(null);
    setLocalPreview(null);
    setAdoptionStatus('idle');
    (async () => {
      const stillCurrent = () => active && isCurrentProject();
      try {
        const refreshed = await refreshInventory(stillCurrent);
        if (!refreshed) return;
      } catch (fetchError) {
        if (!stillCurrent()) return;
        setStatus(fetchError?.status === 404 ? 'legacy_unavailable' : 'failed');
        setError(publicFailure(fetchError, 'CONTEXTUAL_EVIDENCE_UNAVAILABLE'));
        if (fetchError?.status === 404) {
          try {
            const result = await responseJson(await fetch(apiUrl(projectId, '/adoption/candidates')));
            if (stillCurrent()) setDiscovery(result);
          } catch (discoveryError) {
            if (stillCurrent()) setError(publicFailure(discoveryError, 'CONTEXTUAL_ADOPTION_NO_CANDIDATE'));
          }
        }
      }
    })();
    return () => { active = false; };
    // refreshInventory uses current project ID only; scene state is reset below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId, plan.primaryIntent]);

  useEffect(() => {
    setRole(allowedRoles[0] || 'rulebook_reference');
    setConfirmed(false);
  }, [sceneId, plan.primaryIntent, isOpen, allowedRoles]);

  useEffect(() => {
    if (!selectedPage) return;
    setCrop({ x: 0, y: 0, width: selectedPage.width, height: selectedPage.height });
    setCropStatus('idle');
  }, [selectedPage]);

  if (!isOpen || !canBrowseContextualEvidence(plan.primaryIntent)) return null;
  const selectEvidence = (asset) => {
    if (!asset || !allowedRoles.includes(role) || (role === 'board_setup_context' && !confirmed)) return;
    onSelect(asset, {
      role,
      confirmed: role !== 'board_setup_context' || confirmed,
      documentSha256: asset.documentSha256 || inventory?.source?.sha256 || null,
      pageId: selectedPage?.id || null,
      pageRasterSha256: selectedPage?.sha256 || null,
      cropId: asset.kind === 'contextual_crop' ? asset.id : null,
      renderProfile: asset.renderProfile || inventory?.renderProfile?.id || null,
    });
  };
  const createCrop = async () => {
    if (!selectedPage || !cropIsWithinPage(crop, selectedPage)) {
      setCropStatus('invalid');
      return;
    }
    setCropStatus('saving');
    try {
      const created = await responseJson(await fetch(cropUrl(projectId, selectedPage.id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...crop, contextualConfirmation: confirmed === true }),
      }));
      if (!isCurrentProject()) return;
      const asset = { ...created, kind: 'contextual_crop' };
      setInventory((previous) => ({ ...previous, pages: (previous?.pages || []).map((page) => page.id === selectedPage.id ? { ...page, crops: [...(page.crops || []).filter((item) => item.id !== created.id), created] } : page) }));
      setCropStatus('created');
      selectEvidence(asset);
    } catch (cropError) {
      if (!isCurrentProject()) return;
      setCropStatus('failed');
      setError(publicFailure(cropError, 'CONTEXTUAL_CROP_UNAVAILABLE'));
    }
  };
  const previewLocal = async (file) => {
    setLocalPreview(null);
    setLocalConfirmed(false);
    if (!file) return;
    setAdoptionStatus('verifying_local');
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const preview = await responseJson(await fetch(apiUrl(projectId, '/adoption/local-preview'), { method: 'POST', body: form }));
      if (!isCurrentProject()) return;
      setLocalPreview(preview);
      setAdoptionStatus('local_verified');
    } catch (previewError) {
      if (!isCurrentProject()) return;
      setAdoptionStatus('failed');
      setError(publicFailure(previewError, 'CONTEXTUAL_ADOPTION_SOURCE_INVALID'));
    }
  };
  const adopt = async (source, candidate) => {
    setAdoptionStatus('adopting');
    setError('');
    try {
      await responseJson(await fetch(apiUrl(projectId, `/adoption/${source}`), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candidate.id, confirmation: { projectId, filename: candidate.filename } }),
      }));
      if (!isCurrentProject()) return;
      const refreshed = await refreshInventory(isCurrentProject);
      if (refreshed && isCurrentProject()) setAdoptionStatus('succeeded');
    } catch (adoptionError) {
      if (!isCurrentProject()) return;
      setAdoptionStatus('failed');
      setError(publicFailure(adoptionError, 'CONTEXTUAL_ADOPTION_RENDER_FAILED'));
    }
  };

  return <section aria-label={`Rulebook evidence browser for ${sceneId || 'scene'}`} role="dialog" aria-modal="true" style={{ border: '1px solid #6b7280', borderRadius: 8, padding: 12, marginTop: 10, background: '#f8fafc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><strong>Rulebook evidence browser</strong><p style={{ margin: '4px 0' }}>Canonical contextual pages are reference evidence, not component closeups.</p></div><button type="button" aria-label={`Close rulebook browser for ${sceneId}`} onClick={onClose}>Close</button></div>
    {status === 'loading' && <p role="status">Loading canonical rulebook evidence…</p>}
    {status === 'legacy_unavailable' && <><p role="alert">Legacy project: contextual rulebook evidence is unavailable. No page or crop can be selected.</p>
      <section aria-label="Contextual evidence adoption">
        <strong>Adopt a verified source PDF</strong><p>Adoption is explicit and does not change your storyboard, script, native assets, or current contextual selections.</p>
        {discovery?.status === 'ambiguous' && <p role="alert">Multiple linked legacy sources are ambiguous. Choose a local PDF instead.</p>}
        {eligibleLegacy && <><p>One project-linked legacy source is available for review.</p>{sourceFacts(eligibleLegacy, projectId)}<label><input type="checkbox" aria-label={`Confirm adoption of ${eligibleLegacy.filename} for ${projectId}`} checked={legacyConfirmed} onChange={(event) => setLegacyConfirmed(event.target.checked)} /> I confirm adoption for project {projectId} from {eligibleLegacy.filename}.</label><div><button type="button" disabled={!legacyConfirmed || adoptionStatus === 'adopting'} onClick={() => adopt('legacy', eligibleLegacy)}>Adopt verified legacy source</button></div></>}
        {!eligibleLegacy && discovery?.status !== 'ambiguous' && <p>No linked legacy source is eligible. A local PDF can still be verified and adopted explicitly.</p>}
        <label style={{ display: 'block', marginTop: 10 }}>Choose a local PDF to adopt <input aria-label={`Choose local PDF for ${projectId}`} type="file" accept="application/pdf,.pdf" onChange={(event) => previewLocal(event.target.files?.[0])} /></label>
        {adoptionStatus === 'verifying_local' && <p role="status">Verifying selected PDF…</p>}
        {localPreview && <>{sourceFacts(localPreview, projectId)}<label><input type="checkbox" aria-label={`Confirm adoption of ${localPreview.filename} for ${projectId}`} checked={localConfirmed} onChange={(event) => setLocalConfirmed(event.target.checked)} /> I confirm adoption for project {projectId} from {localPreview.filename}.</label><div><button type="button" disabled={!localConfirmed || adoptionStatus === 'adopting'} onClick={() => adopt('local', localPreview)}>Adopt selected local PDF</button></div></>}
        {adoptionStatus === 'adopting' && <p role="status">Creating canonical source and review pages…</p>}
        {adoptionStatus === 'failed' && <p role="alert">Contextual source adoption failed ({error}). No page or crop can be selected.</p>}
      </section>
    </>}
    {status === 'failed' && <p role="alert">Contextual rulebook evidence is unavailable ({error}). No page or crop can be selected.</p>}
    {status === 'ready' && adoptionStatus === 'succeeded' && <p role="status">Contextual source adopted successfully. Review pages are now available.</p>}
    {status === 'ready' && inventory?.source && <p>Source: {inventory.source.filename} · SHA-256 {inventory.source.sha256?.slice(0, 12)} · {inventory.source.pageCount} pages · render profile: {inventory.renderProfile?.id} · provenance {inventory.provenance?.kind || 'direct_project_upload'}</p>}
    {status === 'ready' && pages.length === 0 && <p role="status">No canonical rulebook pages are available for this project.</p>}
    {status === 'ready' && selectedPage && <>
      <div role="list" aria-label={`Rulebook pages for ${sceneId}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, margin: '10px 0' }}>
        {pages.map((page) => <article role="listitem" key={page.id} style={{ border: page.id === selectedPage.id ? '2px solid #1976d2' : '1px solid #d0d7de', borderRadius: 6, padding: 8 }}><button type="button" aria-label={`Preview rulebook page ${page.pageNumber}`} onClick={() => setSelectedPageId(page.id)}><img src={contextualAssetFileUrl(projectId, page.id, 'thumbnail')} alt={`Rulebook page ${page.pageNumber} thumbnail`} style={{ display: 'block', width: '100%', height: 130, objectFit: 'contain' }} /></button><strong>page {page.pageNumber}</strong><div>profile {page.renderProfile || inventory?.renderProfile?.id} · {page.width}×{page.height}</div><div>hash {(page.sha256 || 'unavailable').slice(0, 12)}</div></article>)}
      </div>
      <section aria-label={`Full page preview for ${selectedPage.pageNumber}`}><strong>Full page preview · page {selectedPage.pageNumber}</strong><img src={contextualAssetFileUrl(projectId, selectedPage.id, 'full')} alt={`Full rulebook page ${selectedPage.pageNumber}`} style={{ display: 'block', maxWidth: '100%', maxHeight: 420, objectFit: 'contain', border: '1px solid #d0d7de', margin: '6px 0' }} /></section>
      <label>Role <select aria-label={`Contextual evidence role for ${sceneId}`} value={role} onChange={(event) => setRole(event.target.value)}>{allowedRoles.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label>
      {role === 'board_setup_context' && <label style={{ display: 'block', marginTop: 6 }}><input aria-label={`Confirm contextual board setup evidence for ${sceneId}`} type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm this page is contextual board-setup evidence, not component proof.</label>}
      <button type="button" disabled={role === 'board_setup_context'} onClick={() => selectEvidence({ id: selectedPage.id, kind: 'contextual_page' })}>Select page</button>{role === 'board_setup_context' && <span>Board setup requires a confirmed operator crop; full pages remain reference-only.</span>}
      <fieldset style={{ marginTop: 10 }}><legend>Create bounded crop from page {selectedPage.pageNumber}</legend>{['x', 'y', 'width', 'height'].map((field) => <label key={field} style={{ marginRight: 8 }}>{field} <input aria-label={`Crop ${field} for ${sceneId}`} type="number" min={field === 'width' || field === 'height' ? 1 : 0} max={field === 'x' || field === 'width' ? selectedPage.width : selectedPage.height} value={crop[field]} onChange={(event) => setCrop((previous) => ({ ...previous, [field]: Number(event.target.value) }))} /></label>)}<button type="button" disabled={cropStatus === 'saving' || (role === 'board_setup_context' && !confirmed)} onClick={createCrop}>Create and select crop</button>{cropStatus === 'invalid' && <span role="alert">Crop must stay within page bounds.</span>}{cropStatus === 'failed' && <span role="alert">Unable to create crop.</span>}</fieldset>
      {(selectedPage.crops || []).length > 0 && <div><strong>Existing crops</strong>{selectedPage.crops.map((item) => <button key={item.id} type="button" onClick={() => selectEvidence({ ...item, kind: 'contextual_crop' })}>Select crop {item.id}</button>)}</div>}
    </>}
  </section>;
}
