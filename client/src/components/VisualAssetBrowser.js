import React, { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 24;
const INTENT_ROLES = Object.freeze({
  assembled_tableau: ['overview', 'brand', 'rulebook_reference', 'supporting'],
  game_overview: ['overview', 'brand', 'rulebook_reference', 'supporting'],
  board_setup: ['primary', 'supporting'],
  brand_outro: ['brand', 'rulebook_reference', 'supporting'],
  rulebook_reference: ['rulebook_reference', 'supporting'],
  component_closeup: ['primary', 'supporting'],
  card_action: ['primary', 'supporting'],
  token_action: ['primary', 'supporting'],
  operator_defined: ['primary', 'supporting'],
});
const CLASSIFICATION_TYPES = ['board', 'card', 'token'];

export function validRolesForIntent(intent) {
  return INTENT_ROLES[intent] || INTENT_ROLES.operator_defined;
}

export function roleIsValidForIntent(intent, role) {
  return validRolesForIntent(intent).includes(role);
}

export function defaultRoleForIntent(intent) {
  if (intent === 'brand_outro') return 'brand';
  if (intent === 'rulebook_reference') return 'rulebook_reference';
  if (intent === 'assembled_tableau' || intent === 'game_overview') return 'overview';
  return 'primary';
}

export function assetDisplayName(asset) {
  return String(asset?.label || asset?.name || asset?.title || 'Unnamed project asset');
}

function metadataText(asset) {
  const metadata = asset?.metadata && typeof asset.metadata === 'object' ? asset.metadata : {};
  return [
    asset?.name, asset?.label, asset?.title, asset?.type, asset?.classification, asset?.category,
    asset?.componentId, asset?.componentRef, metadata.name, metadata.label, metadata.type, metadata.classification,
    metadata.category, metadata.componentId, metadata.componentRef, ...(asset?.aliases || []), ...(metadata.aliases || []), ...(asset?.tags || []), ...(metadata.tags || []),
  ].filter((value) => typeof value === 'string').join(' ').toLowerCase();
}

export function assetSourcePage(asset) {
  const metadataPage = asset?.metadata?.page;
  const value = metadataPage ?? asset?.page ?? asset?.pageNum;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function assetClassification(asset) {
  const text = metadataText(asset);
  return CLASSIFICATION_TYPES.find((type) => new RegExp(`\\b${type}\\b`, 'i').test(text)) || 'other';
}

function qualityScore(asset) {
  const score = asset?.quality?.score ?? asset?.curation?.score ?? null;
  return Number.isFinite(Number(score)) ? Number(score) : null;
}

function isExactDuplicate(asset) {
  return asset?.curation?.isDuplicate === true || asset?.metadata?.curation?.isDuplicate === true;
}

function pageNumber(asset) {
  return assetSourcePage(asset) ?? Number.POSITIVE_INFINITY;
}

function intentMetadataCompatible(asset, intent) {
  const text = metadataText(asset);
  if (intent === 'board_setup') return /\bboard\b/.test(text);
  if (intent === 'assembled_tableau' || intent === 'game_overview') return /\b(board|tableau|overview|box|cover|game)\b/.test(text);
  if (intent === 'brand_outro') return /\b(brand|box|cover|title)\b/.test(text);
  if (intent === 'rulebook_reference') return /\b(rulebook|page|reference)\b/.test(text) || Number.isFinite(Number(asset?.page));
  return false;
}

export function assetCompatibility(asset, plan = {}) {
  const candidates = (plan.assetCandidates || []).filter((candidate) => candidate?.assetId === asset?.id);
  const primaryCandidate = candidates.find((candidate) => candidate.requirementRole === 'primary');
  const primaryIntent = plan.primaryIntent || 'operator_defined';
  const componentSpecific = ['board_setup', 'component_closeup', 'card_action', 'token_action'].includes(primaryIntent)
    && (plan.primaryComponentRefs || []).length > 0;
  const compatible = primaryIntent === 'operator_defined' || Boolean(primaryCandidate) || (!componentSpecific && intentMetadataCompatible(asset, primaryIntent));
  return {
    compatible,
    primaryCandidate,
    linked: candidates.some((candidate) => candidate.source === 'component_link'),
    approved: candidates.some((candidate) => candidate.approved === true),
  };
}

/** Filters only the supplied current-project inventory; metadata compatibility is not visual recognition. */
export function filterAndSortVisualAssets(images = [], plan = {}, filters = {}) {
  const query = String(filters.search || '').trim().toLowerCase();
  const type = filters.type || 'all';
  const page = String(filters.page || '').trim();
  const linkStatus = filters.linkStatus || 'all';
  const compatibleOnly = filters.compatibleOnly === true;
  const hideDuplicates = filters.hideDuplicates !== false;
  const threshold = filters.qualityThreshold === '' || filters.qualityThreshold === undefined
    ? null
    : Number(filters.qualityThreshold);
  return (Array.isArray(images) ? images : []).filter((asset) => {
    if (!asset?.id) return false;
    const compatibility = assetCompatibility(asset, plan);
    if (query && !metadataText(asset).includes(query)) return false;
    if (type !== 'all' && assetClassification(asset) !== type) return false;
    if (page && String(assetSourcePage(asset) ?? '') !== page) return false;
    if (linkStatus === 'approved' && !compatibility.approved) return false;
    if (linkStatus === 'linked' && !compatibility.linked) return false;
    if (linkStatus === 'unlinked' && compatibility.linked) return false;
    if (compatibleOnly && !compatibility.compatible) return false;
    if (hideDuplicates && isExactDuplicate(asset)) return false;
    if (Number.isFinite(threshold) && (qualityScore(asset) === null || qualityScore(asset) < threshold)) return false;
    return true;
  }).sort((left, right) => {
    const leftCompatibility = assetCompatibility(left, plan);
    const rightCompatibility = assetCompatibility(right, plan);
    if (leftCompatibility.compatible !== rightCompatibility.compatible) return leftCompatibility.compatible ? -1 : 1;
    if (leftCompatibility.approved !== rightCompatibility.approved) return leftCompatibility.approved ? -1 : 1;
    if (leftCompatibility.linked !== rightCompatibility.linked) return leftCompatibility.linked ? -1 : 1;
    const qualityDifference = (qualityScore(right) ?? -Infinity) - (qualityScore(left) ?? -Infinity);
    if (qualityDifference !== 0) return qualityDifference;
    const pageDifference = pageNumber(left) - pageNumber(right);
    if (pageDifference !== 0) return pageDifference;
    return assetDisplayName(left).localeCompare(assetDisplayName(right)) || String(left.id).localeCompare(String(right.id));
  });
}

function previewMetadataLabel(asset) {
  return `${assetClassification(asset)} · page ${assetSourcePage(asset) ?? 'unknown'} · quality ${qualityScore(asset) ?? 'unscored'}`;
}

function provenanceLabel(compatibility) {
  if (compatibility.approved) return 'approved component link';
  if (compatibility.linked) return 'linked component asset';
  return 'not linked';
}

function selectedComponentId(asset, plan) {
  const compatibility = assetCompatibility(asset, plan);
  return compatibility.primaryCandidate?.componentId
    || ((plan.primaryComponentRefs || []).length === 1 ? plan.primaryComponentRefs[0] : null);
}

function componentOptionsForRole(plan = {}, role) {
  if (role === 'primary') return plan.primaryComponentRefs || [];
  if (role === 'supporting') return plan.supportingComponentRefs || [];
  return [];
}

function defaultComponentIdForRole(plan, role) {
  const options = componentOptionsForRole(plan, role);
  return options.length === 1 ? options[0] : '';
}

/** Formats a canonical component ID with its existing, explainable matched token when available. */
export function componentRequirementLabel(plan = {}, componentRef) {
  const canonicalLabel = typeof plan.componentLabels?.[componentRef] === 'string' && plan.componentLabels[componentRef].trim()
    ? plan.componentLabels[componentRef].trim() : '';
  const match = (Array.isArray(plan.componentRefMatches) ? plan.componentRefMatches : [])
    .find((entry) => entry?.componentId === componentRef && typeof entry?.matchedToken === 'string' && entry.matchedToken.trim());
  const label = canonicalLabel || match?.matchedToken?.trim();
  return label && label !== componentRef ? `${label} (${componentRef})` : componentRef;
}

export function VisualAssetBrowser({
  isOpen,
  onClose,
  onSelect,
  sceneId,
  plan = {},
  images,
  inventoryStatus = 'ready',
  thumbnailUrlForAsset,
}) {
  const [filters, setFilters] = useState({ search: '', type: 'all', page: '', linkStatus: 'all', compatibleOnly: true, hideDuplicates: true, qualityThreshold: '' });
  const [role, setRole] = useState(defaultRoleForIntent(plan.primaryIntent));
  const [componentId, setComponentId] = useState(defaultComponentIdForRole(plan, defaultRoleForIntent(plan.primaryIntent)));
  const [pageIndex, setPageIndex] = useState(0);
  const [thumbnailStates, setThumbnailStates] = useState({});
  const primaryIntent = plan.primaryIntent;
  const assets = useMemo(() => filterAndSortVisualAssets(images, plan, filters), [images, plan, filters]);
  const componentOptions = componentOptionsForRole(plan, role);
  const failedPreviewCount = assets.filter((asset) => thumbnailStates[asset.id] === 'failed').length;
  const pageCount = Math.max(1, Math.ceil(assets.length / PAGE_SIZE));
  const visibleAssets = assets.slice(pageIndex * PAGE_SIZE, (pageIndex + 1) * PAGE_SIZE);
  const roleOptions = validRolesForIntent(plan.primaryIntent);

  useEffect(() => {
    const defaultRole = defaultRoleForIntent(primaryIntent);
    setRole(defaultRole);
    setFilters((previous) => ({ ...previous, compatibleOnly: true }));
    setPageIndex(0);
    setThumbnailStates({});
  }, [sceneId, isOpen, primaryIntent]);

  useEffect(() => {
    const options = componentOptionsForRole(plan, role);
    setComponentId((previous) => options.includes(previous) ? previous : defaultComponentIdForRole(plan, role));
  }, [plan, role]);

  useEffect(() => { if (pageIndex >= pageCount) setPageIndex(Math.max(0, pageCount - 1)); }, [pageCount, pageIndex]);

  if (!isOpen) return null;
  const updateFilter = (field, value) => {
    setFilters((previous) => ({ ...previous, [field]: value }));
    setPageIndex(0);
  };
  const inventoryUnavailable = !sceneId || inventoryStatus === 'unavailable' || inventoryStatus === 'failed';

  return <section aria-label={`Visual asset browser for ${sceneId || 'scene'}`} role="dialog" aria-modal="true" style={{ border: '1px solid #6b7280', borderRadius: 8, padding: 12, marginTop: 10, background: '#f8fafc' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
      <div><strong>Project visual asset browser</strong><p style={{ margin: '4px 0' }}>Metadata compatibility is based on existing labels, page/type fields, and approved links; it is not semantic image recognition.</p></div>
      <button type="button" aria-label={`Close asset browser for ${sceneId}`} onClick={onClose}>Close</button>
    </div>
    {inventoryStatus === 'loading' && <p role="status">Loading current-project assets…</p>}
    {inventoryUnavailable && <p role="alert">Project asset inventory is unavailable. No asset can be selected.</p>}
    {!inventoryUnavailable && inventoryStatus !== 'loading' && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '10px 0' }}>
        <label>Search <input aria-label={`Search visual assets for ${sceneId}`} value={filters.search} onChange={(event) => updateFilter('search', event.target.value)} /></label>
        <label>Type <select aria-label={`Asset type for ${sceneId}`} value={filters.type} onChange={(event) => updateFilter('type', event.target.value)}><option value="all">all</option><option value="board">board</option><option value="card">card</option><option value="token">token</option><option value="other">other</option></select></label>
        <label>Source page <input aria-label={`Source page for ${sceneId}`} type="number" min="1" value={filters.page} onChange={(event) => updateFilter('page', event.target.value)} /></label>
        <label>Link status <select aria-label={`Link status for ${sceneId}`} value={filters.linkStatus} onChange={(event) => updateFilter('linkStatus', event.target.value)}><option value="all">all</option><option value="approved">approved</option><option value="linked">linked</option><option value="unlinked">unlinked</option></select></label>
        <label>Minimum quality <input aria-label={`Minimum quality for ${sceneId}`} type="number" step="0.01" value={filters.qualityThreshold} onChange={(event) => updateFilter('qualityThreshold', event.target.value)} /></label>
        <label><input aria-label={`Only compatible assets for ${sceneId}`} type="checkbox" checked={filters.compatibleOnly} onChange={(event) => updateFilter('compatibleOnly', event.target.checked)} /> Only compatible with this scene</label>
        <label><input aria-label={`Hide exact duplicate assets for ${sceneId}`} type="checkbox" checked={filters.hideDuplicates !== false} onChange={(event) => updateFilter('hideDuplicates', event.target.checked)} /> Hide exact duplicates</label>
        <label>Role <select aria-label={`Selected asset role for ${sceneId}`} value={role} onChange={(event) => setRole(event.target.value)}>{roleOptions.map((option) => <option key={option} value={option}>{option.replace('_', ' ')}</option>)}</select></label>
        {componentOptions.length > 0 && <label>Component requirement <select aria-label={`Component requirement for ${sceneId}`} value={componentId} onChange={(event) => setComponentId(event.target.value)}><option value="">choose explicitly</option>{componentOptions.map((componentRef) => <option key={componentRef} value={componentRef}>{componentRequirementLabel(plan, componentRef)}</option>)}</select></label>}
      </div>
      <p aria-live="polite">{assets.length} current-project assets · sorted by compatibility, approval/link provenance, quality, then source page. {filters.hideDuplicates !== false && 'Exact pixel duplicates are hidden. '}Selection does not create an override. {failedPreviewCount > 0 && <><strong>{failedPreviewCount} preview{failedPreviewCount === 1 ? '' : 's'} unavailable.</strong> <button type="button" onClick={() => setThumbnailStates({})}>Retry unavailable previews</button></>}</p>
      {assets.length === 0 ? <p role="status">No current-project assets match these filters. Clear the compatibility filter to review all available metadata.</p> : <>
        <div role="list" aria-label={`Visual assets for ${sceneId}`} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
          {visibleAssets.map((asset) => {
            const compatibility = assetCompatibility(asset, plan);
            const src = asset.previewKind === 'unavailable' || typeof thumbnailUrlForAsset !== 'function' ? null : thumbnailUrlForAsset(asset);
            const thumbnailState = thumbnailStates[asset.id] || 'loading';
            const previewFailed = !src || thumbnailState === 'failed';
            const selectAsset = () => onSelect(asset, { role, componentId: componentId || selectedComponentId(asset, plan) });
            return <article role="listitem" key={asset.id} style={{ border: '1px solid #d0d7de', borderRadius: 6, padding: 8 }}>
              <div style={{ minHeight: 176, display: 'grid', placeItems: 'center', position: 'relative', background: '#111827', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                {!previewFailed && <img src={src} alt={`${assetDisplayName(asset)} thumbnail`} onLoad={() => setThumbnailStates((previous) => ({ ...previous, [asset.id]: 'loaded' }))} onError={() => setThumbnailStates((previous) => ({ ...previous, [asset.id]: 'failed' }))} style={{ display: 'block', width: '100%', height: 176, objectFit: 'contain', background: '#111827' }} />}
                {thumbnailState === 'loading' && !previewFailed && <span role="status" style={{ position: 'absolute', padding: 6, background: '#111827', color: '#fff', borderRadius: 4 }}>Loading preview…</span>}
                {previewFailed && <div role="status" aria-live="polite" style={{ minHeight: 176, width: '100%', display: 'grid', placeItems: 'center', alignContent: 'center', gap: 4, background: '#7f1d1d', color: '#fff', textAlign: 'center', padding: 10, boxSizing: 'border-box' }}><strong>Preview unavailable</strong><span>{previewMetadataLabel(asset)}</span></div>}
              </div>
              {asset.previewKind === 'source' && !previewFailed && <p role="status" style={{ color: '#854d0e', margin: '0 0 6px' }}>Source image preview — no stored thumbnail was available.</p>}
              <strong>{assetDisplayName(asset)}</strong>
              <div>{assetClassification(asset)} · {asset.type || asset.classification || 'unclassified'}</div>
              <div>page {assetSourcePage(asset) ?? 'unknown'} · {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'dimensions unavailable'}</div>
              <div>quality {qualityScore(asset) ?? 'unscored'} · {provenanceLabel(compatibility)}</div>
              <details><summary>Asset details</summary><code>{asset.id}</code><div>source: {asset.source || 'unknown'}</div><div>classification: {asset.classification || asset.category || 'other'}</div></details>
              <button type="button" aria-label={`Select ${assetDisplayName(asset)} for ${sceneId} as ${role}`} onClick={selectAsset} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAsset(); } }}>Select asset</button>
            </article>;
          })}
        </div>
        {pageCount > 1 && <div style={{ marginTop: 10 }}><button type="button" aria-label={`Previous asset page for ${sceneId}`} disabled={pageIndex === 0} onClick={() => setPageIndex((value) => value - 1)}>Previous</button> page {pageIndex + 1} of {pageCount} <button type="button" aria-label={`Next asset page for ${sceneId}`} disabled={pageIndex >= pageCount - 1} onClick={() => setPageIndex((value) => value + 1)}>Next</button></div>}
      </>}
    </>}
  </section>;
}
