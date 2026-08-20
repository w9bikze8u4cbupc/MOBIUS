import { fireEvent, render, screen } from '@testing-library/react';
import {
  assetCompatibility,
  componentRequirementLabel,
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

test('renders loaded, loading, and explicit failed thumbnail states without changing selection behavior', () => {
  const onSelect = jest.fn();
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={onSelect}
    sceneId="scene-board"
    plan={boardPlan}
    images={[assets[0]]}
    thumbnailUrlForAsset={(asset) => `/api/projects/current/images/${asset.id}/file?variant=thumbnail`}
  />);

  const preview = screen.getByAltText('Game Board Overview thumbnail');
  expect(preview).toHaveAttribute('src', '/api/projects/current/images/board-approved/file?variant=thumbnail');
  expect(preview).toHaveStyle({ objectFit: 'contain' });
  expect(screen.getByText('Loading preview…')).toBeInTheDocument();
  fireEvent.load(preview);
  expect(screen.queryByText('Loading preview…')).not.toBeInTheDocument();

  fireEvent.error(preview);
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  expect(screen.queryByAltText('Game Board Overview thumbnail')).not.toBeInTheDocument();
  expect(screen.getByText('board · page 4 · quality 0.4')).toBeInTheDocument();
  expect(screen.getByText('1 preview unavailable.')).toBeInTheDocument();
  const select = screen.getByRole('button', { name: 'Select Game Board Overview for scene-board as primary' });
  fireEvent.keyDown(select, { key: 'Enter' });
  expect(onSelect).toHaveBeenCalledWith(assets[0], { role: 'primary', componentId: 'game-board' });
  expect(onSelect.mock.calls[0][1]).not.toHaveProperty('operatorOverride');

  fireEvent.click(screen.getByRole('button', { name: 'Retry unavailable previews' }));
  expect(screen.getByAltText('Game Board Overview thumbnail')).toBeInTheDocument();
  expect(screen.queryByText('Preview unavailable')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Close asset browser for scene-board' })).toBeInTheDocument();
});

test('labels a source-image fallback distinctly from a stored thumbnail', () => {
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={jest.fn()}
    sceneId="scene-source-fallback"
    plan={boardPlan}
    images={[{ ...assets[0], previewKind: 'source' }]}
    thumbnailUrlForAsset={() => '/api/projects/current/images/board-approved/file?variant=thumbnail'}
  />);
  fireEvent.load(screen.getByAltText('Game Board Overview thumbnail'));
  expect(screen.getByText('Source image preview — no stored thumbnail was available.')).toBeInTheDocument();
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

test('shows an explicit unavailable state without requesting a remote-only preview URL', () => {
  const thumbnailUrlForAsset = jest.fn(() => 'https://unscoped.example/image.png');
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={jest.fn()}
    sceneId="scene-unavailable"
    plan={boardPlan}
    images={[{ ...assets[0], previewKind: 'unavailable' }]}
    thumbnailUrlForAsset={thumbnailUrlForAsset}
  />);
  expect(thumbnailUrlForAsset).not.toHaveBeenCalled();
  expect(screen.queryByAltText('Game Board Overview thumbnail')).not.toBeInTheDocument();
  expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
  expect(screen.getByText('board · page 4 · quality 0.4')).toBeInTheDocument();
});


test('lets an operator map a manually reviewed asset to one explicit primary component requirement', () => {
  const onSelect = jest.fn();
  const multiComponentPlan = {
    primaryIntent: 'component_closeup',
    primaryComponentRefs: ['lords', 'locations'],
    supportingComponentRefs: ['monster-tokens'],
    componentRefMatches: [
      { componentId: 'lords', matchedToken: 'Lords' },
      { componentId: 'locations', matchedToken: 'Locations' },
      { componentId: 'monster-tokens', matchedToken: 'Monster tokens' },
    ],
    componentLabels: { lords: 'Court Lords', locations: 'Locations', 'monster-tokens': 'Monster tokens' },
    assetCandidates: [],
  };
  render(<VisualAssetBrowser
    isOpen
    onClose={jest.fn()}
    onSelect={onSelect}
    sceneId="scene-objective"
    plan={multiComponentPlan}
    images={[assets[3]]}
    thumbnailUrlForAsset={() => '/safe-thumbnail'}
  />);

  fireEvent.click(screen.getByLabelText('Only compatible assets for scene-objective'));
  expect(componentRequirementLabel(multiComponentPlan, 'lords')).toBe('Court Lords (lords)');
  expect(componentRequirementLabel(multiComponentPlan, 'locations')).toBe('Locations (locations)');
  expect(screen.getByRole('option', { name: 'Locations (locations)' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Component requirement for scene-objective'), { target: { value: 'locations' } });
  fireEvent.click(screen.getByRole('button', { name: 'Select Native card — page 5, image 42 for scene-objective as primary' }));

  expect(onSelect).toHaveBeenCalledWith(assets[3], { role: 'primary', componentId: 'locations' });
  expect(onSelect.mock.calls[0][1]).not.toHaveProperty('operatorOverride');
});
