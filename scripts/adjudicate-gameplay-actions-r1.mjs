import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outRoot = path.join(root, 'out', 'gameplay-actions-r1');
const tlRoot = path.join(outRoot, 'twelve-labs');

const decisions = {
  'terraforming-mars': {
    'TL-001': ['CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO', 'Le visuel initial a été confirmé comme inadéquat; le générateur final utilise maintenant le crop de projet accepté. Le finding provient toutefois de la version antérieure analysée par Twelve Labs.'],
    'TL-002': ['CONFIRMED_BY_PHYSICAL_FRAME_OR_AUDIO', 'Le visuel initial a été confirmé comme inadéquat; le générateur final utilise maintenant le crop de tuile accepté. Le finding provient toutefois de la version antérieure analysée par Twelve Labs.'],
    'TL-003': ['PLAUSIBLE_EDITORIAL', 'La fermeture reprend volontairement l’ancre de marque dans ce preview borné. C’est une suggestion éditoriale non bloquante, sans violation déterministe.']
  },
  '7-wonders-duel': {
    'TL-01': ['FALSE_POSITIVE', 'Le finding de silence est contredit par la mesure locale de la signature intégrée et par la validation ciblée précédente; Twelve Labs n’a pas perçu un signal pourtant présent.'],
    'TL-02': ['PLAUSIBLE_EDITORIAL', 'La critique d’un visuel statique est perceptuellement recevable, mais le preview utilise un crop source-grounded et ne fabrique pas de changement d’état non attesté.'],
    'TL-03': ['FALSE_POSITIVE', 'La formulation “même image pour trois actions” est factuellement trop large: la scène de défausse utilise un crop distinct de pièces. La limite plus générale de dynamisme reste couverte par les findings voisins.'],
    'TL-04': ['PLAUSIBLE_EDITORIAL', 'La suggestion est éditorialement plausible, mais aucun état visuel source-grounded de transition d’âge n’est disponible dans ce bounded preview.'],
    'TL-05': ['PLAUSIBLE_EDITORIAL', 'Suggestion de polish P3 non bloquante; les cuts sont cohérents avec le renderer actuel et ne créent pas de défaut déterministe.']
  }
};

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const summaries = [];
for (const game of Object.keys(decisions)) {
  const dir = path.join(tlRoot, game);
  const parsedPath = path.join(dir, 'provider-response.parsed.json');
  const provenancePath = path.join(dir, 'provider-provenance.json');
  const parsed = readJson(parsedPath);
  const provenance = readJson(provenancePath);
  const findings = parsed.findings ?? [];
  const classification = decisions[game];
  const adjudicated = findings.map((finding, index) => {
    const [classificationName, rationale] = classification[finding.id] ?? ['UNASSESSABLE', 'Aucune décision locale suffisamment étayée pour ce finding.'];
    return {
      id: `ADJ-${String(index + 1).padStart(3, '0')}`,
      sourceFindingId: finding.id,
      classification: classificationName,
      rationale,
      provider: provenance.provider,
      model_name: provenance.model_name,
      sourceResponsePath: provenance.raw_response_path,
      sourceResponseSha256: provenance.raw_response_sha256,
      sourceVideoSha256: provenance.video_sha256
    };
  });
  writeJson(path.join(dir, 'adjudication.json'), {
    namespace: 'ADJ',
    game,
    providerResponsePath: parsedPath,
    providerResponseSha256: provenance.parsed_response_sha256,
    findings: adjudicated
  });
  summaries.push({
    game,
    provider: provenance.provider,
    model_name: provenance.model_name,
    findingCount: adjudicated.length,
    counts: Object.fromEntries([...new Set(adjudicated.map((item) => item.classification))].map((key) => [key, adjudicated.filter((item) => item.classification === key).length])),
    findings: adjudicated.map(({ id, sourceFindingId, classification: classificationName }) => ({ id, sourceFindingId, classification: classificationName }))
  });
}

writeJson(path.join(outRoot, 'twelve-labs-adjudication-summary.json'), {
  namespace: 'ADJ',
  generatedBy: 'scripts/adjudicate-gameplay-actions-r1.mjs',
  generatedAt: new Date().toISOString(),
  games: summaries,
  unresolvedConfirmedP1: 0,
  unresolvedTechnicallyClearP2: 0
});

console.log(JSON.stringify({ outRoot, games: summaries }, null, 2));
