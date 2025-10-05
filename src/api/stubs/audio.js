export async function generateAudioStub({ voiceId }) {
  return {
    voiceId,
    narration: [
      { sectionId: 'intro', url: '/uploads/audio/intro.mp3', durationSeconds: 12 },
      { sectionId: 'goal', url: '/uploads/audio/goal.mp3', durationSeconds: 21 },
    ],
    backgroundMusic: {
      enabled: true,
      trackUrl: '/uploads/audio/bgm-default.mp3',
      duckingEnabled: true,
      levelDb: -18,
    },
    peakLevelDbfs: -3.1,
  };
}