// index.js  
const express = require('express');  
const cors = require('cors');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const maxTokens = process.env.CLAUDE_MAX_TOKENS ? parseInt(process.env.CLAUDE_MAX_TOKENS) : 4096;
require('dotenv').config();
  
// Initialize Anthropic client  
const anthropic = new Anthropic({  
  apiKey: process.env.ANTHROPIC_API_KEY,  
});  
  
console.log("Anthropic API Key loaded:", !!process.env.ANTHROPIC_API_KEY);  

const app = express();  
const port = 5000;

// Middleware
app.use(cors({ credentials: true, origin: 'http://localhost:3000' }));
app.use(express.json());

// Test endpoint
app.get('/test', (req, res) => {
  res.json({ message: 'Backend is working!' });
});

// Health check
app.get('/', (req, res) => res.send('Boardgame Tutorial Backend is running!'));

// Helper: Split text into section
function splitIntoSections(text) {
  // Split on Markdown headings, ALL CAPS lines, or numbered headings
  return text
    .split(/\n(?=(##? |[A-Z][A-Z\s\d\-\(\)\.]{3,}$|^\d+\.\s))/gm)
    .map(s => s.trim())
    .filter(Boolean);
}

// Helper: Summarize a chunk with Claude 3 Opus
async function summarizeChunk(chunk, language, model, retries = 3) {
  const prompt = language === 'french'
    ? `Tu es un animateur de café-jeux et vidéaste YouTube expert. Explique en détail, étape par étape, le texte suivant comme si tu guidais des joueurs autour d'une table. Sois très pédagogique, donne des exemples concrets, détaille chaque action, chaque composant (nombre, utilité, placement), la mise en place, les objectifs, et les choix possibles. Pour chaque action, explique comment la réaliser, ce qu'il faut faire, ce qu'il ne faut pas faire, et donne un exemple de situation réelle. N'hésite pas à être exhaustif, comme si tu préparais un tutoriel vidéo de 10 minutes. Si tu n'es pas certain, fais des suppositions raisonnables basées sur les mécaniques classiques des jeux de société. Utilise un ton chaleureux et vivant.Pour les pauses pédagogiques (ex: vérification de la mise en place), utilisez des formulations comme:   
     "Si vous le souhaitez, vous pouvez mettre en pause la vidéo ici le temps de compléter cette étape, ou continuer à écouter la suite."  
     Évitez les impératifs comme "Pausez ici". \n\nTexte à expliquer:\n${chunk}`
    : `You are a board game café host and YouTube presenter. Explain the following text in great detail, step by step, as if you are guiding players around a table. Be very instructive, give concrete examples, and for every action, explain how to perform it, what to do, what not to do, and give a real-life example. For every component, specify the number, its use, and where it goes. Be as exhaustive as possible. If you are unsure, make reasonable assumptions based on common board game mechanics. Be exhaustive, as if you are preparing a 10-minute video tutorial. Use a warm, lively tone. For instructional pauses (e.g., setup checks), use phrasing like:   
     "If you'd like, you can pause the video here while you complete this step, or keep listening for what's next."  
     Avoid imperative language like "Pause here."\n\nText to explain:\n${chunk}`;
  for (let attempt = 1; attempt <= retries; attempt++) {
   try {
     const message = await anthropic.messages.create({
       model: model || "claude-3-opus-20240229",
       max_tokens: maxTokens,
       system: language === 'french'
         ? "Tu es un animateur de café-jeux expert qui explique les règles de jeux de société de façon claire, chaleureuse, détaillée et vivante."
         : "You are a game café host and board game expert who explains rules in a clear, warm, detailed, and lively way.",
       messages: [
         {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7
    });

    return message.content[0].text;
  } catch (error) {
    console.error(`Attempt ${attempt} failed:`, error.message || error);  
    if (attempt === retries) throw error;  
    await new Promise(r => setTimeout(r, 1000 * attempt));
   }
  }
}

// Summarize endpoint (handles large texts)
app.post('/summarize', async (req, res) => {
  console.log('=== SUMMARIZE REQUEST STARTED ===');
  try {
    const { extractedText, language = 'english', gameName } = req.body;
    if (!extractedText) {
      return res.status(400).json({ error: 'No text provided for summarization' });
    }
    if (!gameName) {
      return res.status(400).json({ error: 'No game name provided' });
    }

    const model = process.env.OPENAI_MODEL || "gpt-3.5-turbo"; // Changed from gpt-4o to gpt-3.5-turbo

    // 1. Split into Section
    const chunks = splitIntoSections(extractedText);
    console.log('Section titles:', chunks.map(c => c.split('\n')[0]));
    console.log(`Text split into ${chunks.length} chunk(s).`);

    // 2. Summarize each chunk
    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i++) {
      console.log(`Summarizing chunk ${i + 1}/${chunks.length}...`);
      const summary = await summarizeChunk(chunks[i], language, model);
      chunkSummaries.push(summary);
    }

    // 3. Combine and summarize again for a final summary
    console.log('Creating final summary...');
    const finalPrompt = language === 'french'
  ? `À partir des résumés suivants, écris un script de tutoriel complet, convivial, très détaillé et long (vise au moins 10 minutes de vidéo) pour le jeu de société "${gameName}". Structure le tutoriel comme si tu étais un animateur de café-jeux ou un vidéaste YouTube qui explique les règles à des joueurs autour de la table. Utilise un ton chaleureux, clair et pédagogique, et donne des exemples concrets à chaque étape. Le script doit obligatoirement suivre cette structure, avec des titres markdown (##) pour chaque section :

## Introduction
Commence par la phrase d'accueil suivante : "Bonjour et bienvenue sur Mobius Game Tutorial. Aujourd'hui, nous allons apprendre à jouer à ${gameName}." Présente le jeu et son thème, mentionne le nombre de joueurs, la durée d'une partie, l'âge recommandé, et ajoute une touche d'humour liée au thème du jeu.

## Présentation des composants et mise en place
Liste tous les composants du jeu (cartes, plateaux, pions, dés, etc.), indique leur nombre exact, leur utilité, et explique précisément où chaque élément doit être placé (ex. : au centre de la table, à côté du plateau, distribué à chaque joueur, cartes mélangées et placées en pile face cachée, etc.). Décris la mise en place étape par étape, comme si tu guidais les joueurs en temps réel.

## But du jeu
Explique clairement ce que les joueurs doivent accomplir pour gagner (ex. : accumuler des points, atteindre un objectif, éliminer tous les monstres, remplir son plateau personnel, etc.).

## Déroulement du jeu et actions des joueurs
Décris en détail les différentes phases du jeu, la structure d'un tour normal et les actions possibles à chaque tour (met beaucoup d'emphase sur les actions, ex.: le joueur doit faire toutes ses actions dans l'ordre préétablie, le joueur doit choisir deux actions parmis les 5 disponibles et peut choisir dex fois la même, le joueur place un de ses ouvriers sur un espace libre et reçoit les ressources de cette case. à la fin de son tour, le joueur doit défausser pour ne garder que 'x' cartes en main, etc.). Pour chaque action, explique comment elle se déroule, ce qu'un joueur peut ou ne peut pas faire, et donne des exemples concrets (ex. : "À son tour, un joueur choisit 2 actions parmi les 4 suivantes..."). Sois très explicite sur les choix, les restrictions, et la façon de réaliser chaque action, avec des exemples de situations réelles.

## Fin de partie et déclencheur
Explique comment la partie se termine (déclencheur de fin de partie), ce qui se passe lors des derniers tours, et comment préparer la phase de décompte.

## Décompte des points et égalité
Décris étape par étape comment compter les points, quels éléments rapportent des points et combien, et comment départager les égalités si besoin.

## Conclusion
Termine par la phrase suivante : "Merci d'avoir regardé, nous espérons que vous apprécierez le jeu. Si vous avez aimé cette vidéo, mettez un pouce bleu et abonnez-vous à la chaîne pour plus de tutoriels de jeux !"

Soit le plus exhaustif possible, comme si tu préparais un tutoriel vidéo de 10 minutes. 

N'hésite pas à donner des conseils ou des astuces pour bien jouer. Le script doit être complet, facile à suivre, et donner l'impression d'une explication en direct autour d'une table de jeu.

Rédige le script pour que le narrateur parle lentement et clairement, avec des pauses naturelles entre chaque phrase ou section importante. Après chaque instruction clé (trouver un composant, réaliser une étape de mise en place, expliquer une action). Utilise des phrases courtes et claires, et encourage les joueurs à prendre leur temps.

Voici les résumés à utiliser :
${chunkSummaries.join('\n')}
`
  : `From the following summaries, write a complete, friendly, highly detailed, and long (aim for at least 10 minutes of video) tutorial script for the board game "${gameName}". Structure the tutorial as if you are a game café host or YouTube presenter explaining the rules to players sitting around the table. Use a warm, clear, and instructive tone, and give concrete examples at every step. The script must strictly follow this structure, using markdown headers (##) for each section:

## Introduction
Start with the following welcoming phrase: "Hello and welcome to Mobius Game Tutorial. Today we're going to learn how to play ${gameName}." Introduce the game and its theme, mention the player count, play time, recommended age, and add a touch of humor related to the game's theme.

## Component Presentation and Setup
List all game components (cards, boards, tokens, dice, etc.), specify the exact number of each, their use, and explain exactly where each item should be placed (e.g., in the center of the table, next to the board, given to each player, cards shuffled and placed in a face-down pile accessible to all, etc.). Describe the setup step by step, as if guiding the players in real time.

## The Goal of the Game
Clearly explain what players must accomplish to win (e.g., accumulate points, reach an objective, defeat all monsters, fill their personal board, etc.).

## Game Flow and Player Actions
Describe in detail the different phases of the game, the structure of a normal turn, and the possible actions during each turn (placing a strong emphasis on the actions, e.g., the player must perform all their actions in a predetermined order, the player must choose two actions from the 5 available and can choose the same action twice, the player places one of their workers on a free space and receives the resources of that space. At the end of their turn, the player must discard down to 'x' cards in hand, etc.)? For each action, explain how it unfolds, what a player can and cannot do, and provide concrete examples (e.g., 'On their turn, a player chooses 2 actions from the following 4...'). Please be very explicit about the choices, restrictions, and how to carry out each action, with examples of real-game situations.

## End of Game and Trigger
Explain how the game ends (end-game trigger), what happens in the final turns, and how to prepare for scoring.

## Scoring and Tie-breakers
Describe step by step how to count points, what elements score and how much they are worth, and how to break ties if needed.

## Conclusion
End with the following phrase: "Thank you for watching, we hope you enjoy the game. If you like this video, give us a thumbs up and be sure to subscribe to the channel for more game tutorials!"

Be as exhaustive as possible and try to make content for 10 minutes tutorials.

Feel free to give tips or advice for playing well. The script should be complete, easy to follow, and feel like a live explanation at the game table.

Write the script so that the narrator speaks slowly and clearly, with natural pauses between key sentences and sections. After each important instruction (such as finding a component, completing a setup step, or explaining an action). Use clear, short sentences and encourage the viewer to take their time.

Here are the summaries to use:
${chunkSummaries.join('\n')}
`;
   // Inside your /summarize endpoint, where you generate the final summary
   const message = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: maxTokens,
    system: language === 'french'
      ? "Tu es un animateur de café-jeux expert qui explique les règles de jeux de société de façon claire, chaleureuse, détaillée et vivante."
      : "You are a game café host and board game expert who explains rules in a clear, warm, detailed, and lively way.",
    messages: [
      {
        role: "user",
        content: finalPrompt
      }
    ],
    temperature: 0.7
  });
    
  const summary = message.content[0].text;  
  console.log('Summary generated successfully!');  
  res.json({ summary });

  } catch (error) {
    console.error('Summarization error:', error.error?.message || error.message || error);
    res.status(500).json({
      error: "Failed to summarize text",
      details: error.error?.message || error.message || error
    });
  }
});

// ElevenLabs TTS endpoint
app.post('/tts', async (req, res) => {
  console.log('TTS Request received:', req.body);
  let { text, voice = "EXAVITQu4vr4xnSDxMaL", language = "english" } = req.body;

  if (!text) {
    console.log('No text provided');
    return res.status(400).json({ error: "No text provided" });
  }

  try {
    console.log('Making request to ElevenLabs...');
    const apiKey = process.env.ELEVENLABS_API_KEY;
    console.log('API Key exists:', !!apiKey);
    const response = await axios({
      method: 'post',
      url: `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      data: {
        text,
        model_id: "eleven_multilingual_v2"
      },
      responseType: 'arraybuffer'
    });

    console.log('ElevenLabs response received');
    console.log('Content-Type:', response.headers['content-type']);

    if (
      response.headers['content-type'] !== 'audio/mpeg' &&
      response.headers['content-type'] !== 'audio/mp3'
    ) {
      const errorText = Buffer.from(response.data).toString();
      console.error("ElevenLabs API error:", errorText);
      return res.status(500).json({ error: "ElevenLabs API error", details: errorText });
    }

    res.set('Content-Type', 'audio/mpeg');
    res.send(response.data);
  } catch (err) {
    console.error('TTS Error:', err.response?.data || err.message);
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Failed to generate speech" });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});