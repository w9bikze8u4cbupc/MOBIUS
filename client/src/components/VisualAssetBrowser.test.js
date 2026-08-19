import { fireEvent, render, screen } from '@testing-library/react';
import {
  assetCompatibility,
  filterAndSortVisualAssets,
  roleIsValidForIntent,
  VisualAssetBrowser,
} from './VisualAssetBrowser';

const assets = [
  { id: 'board-approved', name: 'Game Board Overview', classification: 'board', page: 4, width: 1200, height: 800, quality: { score: 0.4 }, source: 'rulebook' },
  { id: 'board-linked', name: 'Board Layout', type: 'board', page: 2, width: 800, height: 600, quality: { score: 0.9 }, source: 'rulebook' },
  { id: 'monster-token', name: 'Monster token', classification: 'token', page: 4, quality: { score: 0.98 }, source: 'rulebook' },
  { id: 'native-card', label: 'Native card — page 5, image 42', type: 'card', page: 5, quality: { score: 0.5 }, source: 'rulebook' },
];

const boardPlan = {
  primaryIntent: 'board_setup', primaryComponentRefs: ['game-board'], assetCandidates: [
    { assetId: 'board-approved', componentId: 'game-board', requirementRole: 'primary', source: 'component_link', approved: true },
    { assetId: 'board-linked', componentId: 'game-board', requirementRole: 'primary', source: 'component_link', approved: false },
  ],
};

test('renders a metadata-only current-project grid with safe thumbnail fallback and accessible selection', () => {
  const onSelect = jest.fn();
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={onSelect}
    sceneId="scene-board"
    plan={boardPlan}
    images={assets}
    thumbnailUrlForAsset={(asset) => `/api/projects/current/images/${asset.id}/file?variant=thumbnail`}
  />);

  const select = screen.getByRole('button', { name: 'Select Game Board Overview for scene-board as primary' });
  expect(select.tagName).toBe('BUTTON');
  expect(screen.getByAltText('Game Board Overview thumbnail')).toHaveAttribute('src', '/api/projects/current/images/board-approved/file?variant=thumbnail');
  fireEvent.error(screen.getByAltText('Game Board Overview thumbnail'));
  expect(screen.getByText('Thumbnail unavailable')).toBeInTheDocument();
  fireEvent.keyDown(select, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledWith(assets[0], { role: 'primary', componentId: 'game-board' });
  expect(screen.getByRole('button', { name: 'Close asset browser for scene-board' })).toBeInTheDocument();
});

test('filters by type, page, provenance and compatibility while sorting deterministically', () => {
  const sorted = filterAndSortVisualAssets(assets, boardPlan, { compatibleOnly: false });
  expect(sorted.map((asset) => asset.id)).toEqual(['board-approved', 'board-linked', 'monster-token', 'native-card']);
  expect(filterAndSortVisualAssets(assets, boardPlan, { type: 'board', compatibleOnly: true }).map((asset) => asset.id)).toEqual(['board-approved', 'board-linked']);
  expect(filterAndSortVisualAssets(assets, boardPlan, { page: '4', linkStatus: 'approved', compatibleOnly: false }).map((asset) => asset.id)).toEqual(['board-approved']);
  expect(filterAndSortVisualAssets(assets, boardPlan, { qualityThreshold: '0.9', compatibleOnly: false }).map((asset) => asset.id)).toEqual(['board-linked', 'monster-token']);
  expect(assetCompatibility(assets[2], boardPlan)).toMatchObject({ compatible: false, linked: false, approved: false });
});

test('pre-filters assembled-tableau and board-setup assets only from declared metadata and links', () => {
  const tableauPlan = { primaryIntent: 'assembled_tableau', primaryComponentRefs: [], assetCandidates: [] };
  expect(filterAndSortVisualAssets(assets, tableauPlan, { compatibleOnly: true }).map((asset) => asset.id)).toEqual(['board-linked', 'board-approved']);
  expect(filterAndSortVisualAssets(assets, boardPlan, { compatibleOnly: true }).map((asset) => asset.id)).toEqual(['board-approved', 'board-linked']);
});

test('only exposes roles valid for the primary intent and selection never creates an override', () => {
  const onSelect = jest.fn();
  const brandAsset = { ...assets[0], id: 'brand-card', name: 'Abyss Brand', classification: 'brand' };
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={onSelect}
    sceneId="scene-outro"
    plan={{ primaryIntent: 'brand_outro', assetCandidates: [] }}
    images={[brandAsset]}
    thumbnailUrlForAsset={() => '/safe-thumbnail'}
  />);
  expect(roleIsValidForIntent('brand_outro', 'brand')).toBe(true);
  expect(roleIsValidForIntent('brand_outro', 'primary')).toBe(false);
  expect(screen.queryByRole('option', { name: 'primary' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Select Abyss Brand for scene-outro as brand' }));
  expect(onSelect).toHaveBeenCalledWith(brandAsset, { role: 'brand', componentId: null });
  expect(onSelect.mock.calls[0][1]).not.toHaveProperty('operatorOverride');
});

test('shows loading, empty, and unavailable inventory states without exposing another asset source', () => {
  const { rerender } = render(<VisualAssetBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} sceneId="scene-state" plan={{}} images={null} inventoryStatus="loading" />);
  expect(screen.getByText('Loading current-project assets…')).toBeInTheDocument();
  rerender(<VisualAssetBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} sceneId="scene-state" plan={{}} images={[]} inventoryStatus="ready" />);
  expect(screen.getByText(/No current-project assets match these filters/)).toBeInTheDocument();
  rerender(<VisualAssetBrowser isOpen onClose={jest.fn()} onSelect={jest.fn()} sceneId="scene-state" plan={{}} images={[]} inventoryStatus="failed" />);
  expect(screen.getByText(/Project asset inventory is unavailable/)).toBeInTheDocument();
});


test('reads nested production metadata for source-page filtering, display, and ordering', () => {
  const nestedPageAsset = { id: 'nested-page', name: 'Native board crop', page: null, metadata: { page: 7, type: 'board' }, quality: { score: 0.6 } };
  const legacyPageAsset = { id: 'legacy-page', name: 'Legacy board crop', page: 9, type: 'board', quality: { score: 0.6 } };
  expect(filterAndSortVisualAssets([legacyPageAsset, nestedPageAsset], boardPlan, { page: '7', compatibleOnly: false }).map((asset) => asset.id)).toEqual(['nested-page']);
  expect(filterAndSortVisualAssets([legacyPageAsset, nestedPageAsset], boardPlan, { type: 'board', compatibleOnly: false }).map((asset) => asset.id)).toEqual(['nested-page', 'legacy-page']);
});