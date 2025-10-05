export async function generateScriptStub({ language, detailBoost }) {
  return {
    language,
    detailBoost,
    sections: [
      {
        id: 'intro',
        title: 'Introduction',
        markdown: `Bienvenue! Aujourd'hui, nous allons apprendre à jouer à **Example Game**. Préparez-vous pour une expérience de 45 à 90 minutes pleine de stratégie.`,
      },
      {
        id: 'goal',
        title: 'Goal of the Game',
        markdown: `Le but est d'accumuler le plus grand nombre de points de prestige en construisant votre cité et en satisfaisant vos citoyens.`,
      },
      {
        id: 'setup',
        title: 'Setup',
        markdown: `1. Installez le plateau.\n2. Mélangez les cartes Action.\n3. Distribuez les ressources initiales à chaque joueur.`,
      },
      {
        id: 'turns',
        title: 'Turn Structure',
        markdown: `Chaque tour comporte trois phases : Préparation, Action, Résolution.`,
      },
      {
        id: 'scoring',
        title: 'Scoring',
        markdown: `Les points proviennent des bâtiments, des objectifs publics et des collections de ressources.`,
      },
      {
        id: 'outro',
        title: 'Outro',
        markdown: `Merci d'avoir regardé! Abonnez-vous à Les Jeux Mobius Game pour d'autres tutoriels.`,
      },
    ],
  };
}