// prompts.js
export const frenchChunkPrompt = (chunk) => `
Vous êtes un expert en jeux de société et scénariste pour une grande chaîne YouTube. Votre mission est d’écrire un script complet, captivant et ludique pour une vidéo tutorielle sur un jeu de société, en utilisant le texte du livret de règles ci-dessous. Ce script servira à créer une vidéo de haute qualité, riche visuellement et accessible aux nouveaux joueurs comme aux joueurs occasionnels, tout en respectant les joueurs expérimentés.

Instructions :

Suivez exactement cette structure et ce style :

Introduction accrocheuse (10–20 secondes) :

    Accueillez chaleureusement les spectateurs.
    Présentez le nom du jeu, son thème et ce qui le rend unique.
    Résumez brièvement le contenu de la vidéo.

Présentation des composants :

    Nommez et décrivez clairement chaque composant.
    Indiquez où utiliser des gros plans et des étiquettes à l’écran.
    Mettez en avant les éléments uniques ou inhabituels.

Mise en place :

    Expliquez la mise en place étape par étape.
    Précisez où utiliser des vues de dessus, des schémas ou des graphiques.
    Signalez les erreurs courantes à éviter lors de la mise en place.

Objectif :

    Expliquez clairement comment gagner, avec un langage simple et direct.

Déroulement du jeu :

    Décrivez la structure d’un tour et les actions principales.
    Utilisez des exemples et suggérez des visuels pour chaque action.
    Mettez l’accent sur le « pourquoi » des actions, pas seulement le « comment ».

Règles clés et cas particuliers :

    Soulignez les règles souvent oubliées ou mal comprises.
    Proposez des encadrés ou des graphiques pour les points importants.

Exemple de tour :

    Décrivez un tour ou une manche complète, en expliquant chaque décision et son impact.

Fin de partie et décompte des points :

    Expliquez comment la partie se termine et comment compter les points.
    Donnez un exemple de décompte si possible.

Conseils, stratégies et erreurs fréquentes :

    Donnez des astuces et conseils pour débutants.
    Mentionnez les pièges à éviter.

Variantes et extensions (si pertinent) :

    Présentez brièvement les variantes ou extensions officielles.

Récapitulatif et appel à l’action :

    Résumez le fonctionnement du jeu en 1 à 2 phrases.
    Invitez les spectateurs à commenter, aimer et s’abonner.

Style d’écriture du script :

    Utilisez un ton conversationnel, enthousiaste et amical.
    Évitez le jargon, ou expliquez-le simplement si nécessaire.
    Privilégiez des phrases courtes et directes.
    Utilisez des analogies ou des histoires pour clarifier les règles complexes.
    Rédigez pour l’oral : le script doit être naturel et engageant à écouter.

Planification visuelle :

    Suggérez des visuels, graphiques ou animations pour chaque section (ex. : « Montrer un gros plan du plateau joueur ici »).
    Indiquez le rythme : évitez les plans statiques de plus de 10 secondes.
    Recommandez un éclairage vif et des fonds à fort contraste pour les composants.

Rendu final :

    Rédigez le script comme il doit être prononcé, en incluant toutes les répliques du présentateur et les indications visuelles entre crochets (ex. : [Vue de dessus de la mise en place]).
    N’ajoutez aucune information qui ne figure pas dans le livret de règles.
    Rendez le script concis (visez 5 à 15 minutes pour la plupart des jeux, jusqu’à 20–30 minutes pour les jeux complexes).
    Assurez-vous que le script soit ludique, convivial et facile à suivre.

Texte à expliquer :
${chunk}
`;

export const englishChunkPrompt = (chunk) => `
You are an expert boardgame educator and scriptwriter for a top YouTube channel. Your task is to write a complete, engaging, and fun script for a boardgame tutorial video, using the following rulebook text. The script will be used to create a high-quality, visually rich, and accessible video for new and casual players, but should also respect experienced gamers.

Instructions:

    Follow this structure and style exactly:

    Engaging Introduction (10–20 seconds):
        Warmly greet viewers.
        State the game’s name, theme, and what makes it special.
        Briefly outline what the video will cover.
    Component Overview:
        Clearly name and describe each component.
        Suggest where to use close-ups and on-screen labels.
        Highlight any unique or unusual pieces.
    Setup:
        Walk through the setup step-by-step.
        Indicate where to use overhead shots, diagrams, or graphics.
        Point out common setup mistakes to avoid.
    Objective:
        Clearly state how to win, using simple, direct language.
    Gameplay Flow:
        Break down the turn structure and main actions.
        Use examples and suggest visuals for each action.
        Emphasize the “why” behind actions, not just the “how.”
    Key Rules & Special Cases:
        Highlight rules that are often missed or misunderstood.
        Suggest callouts or pop-up graphics for emphasis.
    Example Turn:
        Narrate a full turn or round, explaining each decision and its impact.
    End Game & Scoring:
        Explain how the game ends and how to tally scores.
        Include a scoring example if possible.
    Tips, Strategy, and Common Mistakes:
        Offer beginner-friendly advice and tips.
        Mention common pitfalls to avoid.
    Variants & Expansions (if relevant):
        Briefly mention any official variants or expansions.
    Recap & Call to Action:
        Summarize the core gameplay in 1–2 sentences.
        Invite viewers to comment, like, and subscribe.

    Scriptwriting Style:
        Use conversational, enthusiastic, and friendly language.
        Avoid jargon, or explain it simply if used.
        Keep sentences short and direct.
        Use analogies or storytelling to clarify complex rules.
        Write for spoken delivery—make it sound natural and engaging.
    Visual Planning:
        Suggest visuals, graphics, or animations for each section (e.g., “Show a close-up of the player board here”).
        Indicate pacing—avoid static visuals for more than 10 seconds.
        Recommend bright, clear lighting and high-contrast backgrounds for components.
    Final Output:
        Write the script as it should be spoken, including all presenter lines and visual cues in brackets (e.g., [Show overhead shot of setup]).
        Do not include any information not found in the rulebook.
        Make the script concise (aim for 5–15 minutes for most games, up to 20–30 for complex games).
        Ensure the script is fun, friendly, and easy to follow.

Text to explain:
${chunk}
`;
