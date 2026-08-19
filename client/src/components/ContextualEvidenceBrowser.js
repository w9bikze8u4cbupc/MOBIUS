import React, { useEffect, useMemo, useState } from 'react';

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

function inventoryUrl(projectId) {
  const origin = BACKEND_URL.replace(/\/+$/, '');
  return `${origin}/api/projects/${encodeURIComponent(projectId)}/images`;
}

function cropUrl(projectId, pageId) {
  const origin = BACKEND_URL.replace(/\/+$/, '');
  return `${origin}/api/projects/${encodeURIComponent(projectId)}/contextual-evidence/pages/${encodeURIComponent(pageId)}/crops`;
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

export function ContextualEvidenceBrowser({ isOpen, onClose, onSelect, projectId, sceneId, plan = {} }) {
  const [inventory, setInventory] = useState(null);
  const [status, setStatus] = useState('idle');
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [role, setRole] = useState('rulebook_reference');
  const [confirmed, setConfirmed] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 1, height: 1 });
  const [cropStatus, setCropStatus] = useState('idle');
  const [error, setError] = useState('');
  const allowedRoles = contextualRolesForIntent(plan.primaryIntent);
  const pages = useMemo(() => (Array.isArray(inventory?.pages) ? inventory.pages.filter(availablePage) : []), [inventory]);
  const selectedPage = pages.find((page) => page.id === selectedPageId) || pages[0] || null;

  useEffect(() => {
    if (!isOpen || !projectId || !canBrowseContextualEvidence(plan.primaryIntent)) return undefined;
    let active = true;
    setStatus('loading');
    setError('');
    fetch(inventoryUrl(projectId))
      .then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          const failure = new Error(body?.code || `HTTP_${response.status}`);
          failure.status = response.status;
          throw failure;
        }
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        const contextual = data?.contextualEvidence;
        if (!contextual || contextual.available !== true) {
          const unavailable = new Error(contextual?.code || 'CONTEXTUAL_EVIDENCE_UNAVAILABLE');
          unavailable.status = 404;
          throw unavailable;
        }
        setInventory(contextual);
        setSelectedPageId(Array.isArray(contextual.pages) && contextual.pages[0]?.id ? contextual.pages[0].id : null);
        setStatus('ready');
      })
      .catch((fetchError) => {
        if (!active) return;
        setStatus(fetchError?.status === 404 ? 'legacy_unavailable' : 'failed');
        setError(fetchError?.message || 'CONTEXTUAL_EVIDENCE_UNAVAILABLE');
      });
    return () => { active = false; };
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
      const response = await fetch(cropUrl(projectId, selectedPage.id), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...crop, contextualConfirmation: confirmed === true }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => ({})))?.code || `HTTP_${response.status}`);
      const created = await response.json();
      const asset = { ...created, kind: 'contextual_crop' };
      setInventory((previous) => ({ ...previous, pages: (previous?.pages || []).map((page) => page.id === selectedPage.id ? { ...page, crops: [...(page.crops || []).filter((item) => item.id !== created.id), created] } : page) }));
      setCropStatus('created');
      selectEvidence(asset);
    } catch (cropError) {
      setCropStatus('failed');
      setError(cropError?.message || 'CONTEXTUAL_CROP_UNAVAILABLE');
    }
  };

  return <section aria-label={`Rulebook evidence browser for ${sceneId || 'scene'}`} role="dialog" aria-modal="true" style={{ border: '1px solid #6b7280', borderRadius: 8, padding: 12, marginTop: 10, background: '#f8fafc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}><div><strong>Rulebook evidence browser</strong><p style={{ margin: '4px 0' }}>Canonical contextual pages are reference evidence, not component closeups.</p></div><button type="button" aria-label={`Close rulebook browser for ${sceneId}`} onClick={onClose}>Close</button></div>
    {status === 'loading' && <p role="status">Loading canonical rulebook evidence…</p>}
    {status === 'legacy_unavailable' && <p role="alert">Legacy project: contextual rulebook evidence is unavailable. No page or crop can be selected.</p>}
    {status === 'failed' && <p role="alert">Contextual rulebook evidence is unavailable ({error}). No page or crop can be selected.</p>}
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
