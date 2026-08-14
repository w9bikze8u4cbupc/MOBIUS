import { getAiConfig, listAccessibleModelIds } from '../src/config/aiConfig.js';

const config = getAiConfig();
if (!config.apiKey) {
  console.error('Set OPENAI_API_KEY in C:\\mobius-games-tutorial-generator\\.env before listing models.');
  process.exitCode = 1;
} else {
  try {
    const ids = await listAccessibleModelIds();
    ids.forEach((id) => console.log(id));
  } catch (_error) {
    console.error('Could not list accessible AI models. Check your configured provider credentials and try again.');
    process.exitCode = 1;
  }
}
