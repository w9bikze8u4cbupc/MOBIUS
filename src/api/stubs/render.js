export async function renderPreviewStub({ durationSeconds }) {
  return {
    previewType: durationSeconds <= 10 ? 'short' : 'long',
    durationSeconds,
    status: 'complete',
    mp4Url: `/output/example-preview-${durationSeconds}s.mp4`,
  };
}

export async function renderFullStub() {
  return {
    status: 'complete',
    mp4Url: '/output/example-full.mp4',
    durationSeconds: 780,
  };
}