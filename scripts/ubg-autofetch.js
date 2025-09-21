#!/usr/bin/env node
import { fetchUbgAuto } from '../src/sources/ultraBoardGames.js';

const game = process.argv.slice(2).join(' ');
if (!game) {
  console.error('Usage: node scripts/ubg-autofetch.js "Game Name"');
  process.exit(1);
}

const main = async () => {
  const res = await fetchUbgAuto(game);
  if (!res.ok) {
    console.error('UBG not found. Tried:', res.tried);
    process.exit(2);
  }
  console.log('Rules URL:', res.rulesUrl);
  console.log('Slug:', res.slug);
  console.log('Components (raw):');
  for (const item of res.components.items) console.log('-', item);
  console.log('\nTop images:');
  res.images.forEach((x, i) =>
    console.log(`${i + 1}. ${x.url} (${x.w}x${x.h}) score=${x.score} alt="${x.alt}"`),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
