export async function generateCaptionsStub({ language }) {
  return {
    language,
    items: [
      {
        start: 0,
        end: 4,
        text: 'Bienvenue sur Les Jeux Mobius Game!',
      },
      {
        start: 4,
        end: 12,
        text: "Aujourd'hui, nous vous montrons comment jouer à Example Game.",
      },
    ],
    export: {
      srt: '/uploads/captions/example.srt',
      vtt: '/uploads/captions/example.vtt',
    },
    burnInAvailable: true,
  };
}