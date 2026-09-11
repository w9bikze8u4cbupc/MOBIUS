# Standard de production — Tutoriels Les Jeux Mobius

## Objectif produit

MOBIUS produit par défaut un **tutoriel vidéo de jeu de société chaleureux, rigoureux et facile à suivre pour le public québécois**. Un rendu ne constitue pas une livraison acceptable s’il n’est qu’une succession de pages de livret avec du texte superposé. Chaque étape doit enseigner une action identifiable, montrer l’élément de jeu pertinent et guider le débutant sans cacher l’information visuelle utile.

## Exigences de langue et de narration

| Sujet | Exigence d’acceptation |
| --- | --- |
| Langue par défaut | Français canadien (`fr-CA`). L’anglais est une option explicite, jamais le défaut. |
| Voix | Utiliser la voix de production configurée **Amélie** lorsque l’intégration de synthèse approuvée est disponible. La voix, l’identifiant fournisseur, la langue et le hash du texte doivent être persistés par scène. |
| Ton | Chaleureux, accueillant, clair, patient et légèrement ludique. Une référence ou une blague discrète est permise si elle ne nuit ni à l’exactitude ni au rythme. |
| Continuité | Chaque scène ayant une narration doit posséder un asset audio prêt, mappé à la scène et d’une durée mesurée. Une scène silencieuse non intentionnelle est un échec de rendu. |
| Fin de vidéo | La narration doit couvrir l’outro. Toute absence de voix, erreur de décodage ou dégradation détectée après le début de l’outro bloque la livraison. |

## Habillage Les Jeux Mobius

Le montage commence par une introduction générique courte de la chaîne : la bannière ou l’identité visuelle de **Les Jeux Mobius**, une ambiance douce de café ludique (conversations indistinctes, dés, jeu de table; jamais une voix concurrente) et la formule : « Bienvenue sur la chaîne Mobius. »

Le montage se termine par une outro française conviviale qui invite à aimer la vidéo, à s’abonner, à proposer des jeux ou poser des questions en commentaire, puis remercie le public d’avoir regardé Les Jeux Mobius. L’intro et l’outro sont des scènes identifiables, audibles, révisables et incluses dans les chapitres.

## Grammaire visuelle obligatoire

> Le texte explique; le visuel démontre. Ils ne doivent pas se battre pour le même espace.

| Élément | Règle de placement et d’usage |
| --- | --- |
| Repère d’étape | Petit badge persistant en haut à gauche, par exemple « Étape 1 · Mélanger le paquet ». Il sert aussi de base aux chapitres YouTube. |
| Image principale | Occupe la zone centrale ou latérale sans être masquée par un grand texte. Un plan de plateau, une carte ou un composant est privilégié sur une page complète de livret. |
| Texte explicatif | Placé dans la colonne opposée à l’image, à droite ou à gauche selon la scène; texte court, à fort contraste, à l’intérieur de la zone sûre. |
| Référence de règle | Petite référence discrète en bas à droite ou bas à gauche, par exemple « Livret p. 8 ». Elle ne doit jamais dominer la scène. |
| Mise en place | Ordre cumulatif visible : étape courante, coche des étapes terminées, numéro, flèche et/ou pastille pointant le composant ou l’emplacement exact. |
| Flèches et numéros | Les appeler seulement lorsqu’ils désignent une action, une zone du plateau ou un composant. Une apparition simple, un surlignage et un fondu suffisent; aucune animation décorative ne doit détourner l’attention. |
| Source rulebook | Une page de livret est une source ou une référence, pas le visuel principal par défaut. Préférer les composants extraits, recadrés et liés à la règle expliquée. |

## Pédagogie et structure

La vidéo doit être organisée en chapitres utiles : introduction, objectif, matériel/mise en place, déroulement d’une ronde, actions principales, actions secondaires, fin de manche, fin de partie et calcul des points, puis outro. Les chapitres doivent être exportés dans un fichier de métadonnées YouTube exploitable.

Pour une mise en place, le tutoriel explique une étape à la fois. Il montre d’abord le paquet, le jeton ou l’emplacement; il annonce ensuite l’action; il conserve la confirmation visuelle des étapes terminées. Il ne remplace pas cette démonstration par un paragraphe statique.

## Assets et qualité d’image

Les assets destinés à la démonstration sont des composants extraits ou des recadrages de grande qualité, avec leur source et leur hash. MOBIUS sélectionne l’asset correspondant à l’action et peut utiliser un recadrage de livret comme solution de repli explicitement identifiée. Les pages entières de PDF pixelisées ou miniaturisées ne satisfont pas le niveau de production premium lorsque l’élément de jeu concerné peut être extrait.

### Verrous de précision visuelle et parlée

- Des cartes présentées comme exemples équivalents doivent provenir des meilleurs maîtres autorisés disponibles et conserver une définition effective, une échelle et un cadrage comparables. Un petit XObject agrandi échoue si un maître officiel ou exact-édition plus détaillé est disponible.
- Une carte présentée comme objet physique doit conserver sa silhouette complète, ses quatre limites, son rapport d’aspect et l’absence de composant voisin. Un recadrage accidentellement incomplet ne représente pas une carte complète.
- Une structure de cartes superposées doit reproduire les états qui gouvernent la règle : face visible, face cachée, recouvrement et accessibilité. Une démonstration entièrement face visible est interdite lorsque l’orientation fait partie du mécanisme.
- Un plateau montré en situation de jeu doit être physiquement cohérent : marqueurs et jetons occupent les emplacements et orientations vérifiés par la source. Un marqueur à déclenchement unique disparaît de l’état suivant après consommation et ne se redéclenche pas lors d’un retour.
- Les nombres romains restent canoniques à l’écran (`Âge I`, `Âge II`, `Âge III`). Dans le texte transmis à Amélie, un contexte d’âge, de phase, de chapitre ou de paquet les transforme en nombres naturels (`âge un`, `âge deux`, `âge trois`; `un, deux et trois`). Une lettre `I` hors de ces contextes n’est pas réécrite.

## Temps de rendu et observabilité

Le système doit mesurer séparément l’ingestion, l’extraction d’assets, l’écriture du script, la synthèse vocale, le rendu et le QA. Un rendu long est acceptable s’il est reproductible, résumable, observable et proportionné à la durée et à la complexité de la vidéo. MOBIUS doit afficher ou enregistrer les étapes et leurs durées afin que l’opérateur puisse savoir où le temps est passé.

## Garde de livraison

Avant une livraison, MOBIUS vérifie au minimum : résolution 1080p ou plus, présence et décodage valide de l’audio, durée de chaque segment audio, sous-titres français, niveau sonore de programme, absence de chevauchement critique entre texte et zone de démonstration, présence des chapitres, intro et outro, source des assets, manifeste et checksums. Une scène sans image pertinente, une narration manquante ou une page de livret masquée par du texte volumineux doit être signalée comme une exception à réviser, pas considérée automatiquement conforme.
## Generator productization and Autopilot convergence (2026-09-07)

- Normal production compiles `Rulebook Knowledge → VisualRequirements → physical game state → canonical source resolution → VisualPlan → Cockpit review/acceptance → storyboard → narration → render → production QA`.
- A physical instructional RuleAtom must derive its visual requirements from source-grounded knowledge. Missing or ambiguous evidence becomes a Cockpit review item; it must never silently become a decorative or weak page fallback.
- Source selection considers authority and true detail at intended display size. Exact-edition publisher/press masters outrank authorized BGG originals, which outrank native PDF objects and clean PDF crops when identity and provenance are otherwise equivalent.
- Physical state includes location, orientation, face state, visibility, ownership, quantity, covered/accessible relationships, track position, and consumed/removed transitions where applicable.
- Equivalent instructional assets share peer scale and source-quality expectations. Mobile composition enlarges meaningful evidence before leaving dead space or shrinking text.
- The canonical teaching delivery is `AMELIE_TEACHING_WARM_R10`, with natural fr-CA display/spoken separation, contextual Roman-numeral normalization, transcript/performance QA, and selective cache-aware regeneration.
- The canonical signature keeps the approved banner, café-room ambience, continuous coffee pour, and dice cue, with no narration during the signature.
- Iteration-specific 7 Wonders Duel builders and publishability QA scripts are benchmark/history fixtures only. They are not normal production dependencies.
- `CODEX_REQUIRED_FOR_NORMAL_PRODUCTION = FALSE`: uncertainty is resolved by the normal Cockpit workflow, not bespoke engineering intervention.

## Rulebook Knowledge and Cockpit evidence contract (2026-09-11)

- Before a RuleAtom is synthesized, production creates a canonical one-based PDF document map: page, detected heading, normalized source span, source hash, extraction confidence, content kind and provenance. Parser-internal page zero is never a learner-facing or Cockpit citation.
- Coverage is evidence-driven. Missing applicable high-priority domains trigger bounded retrieval and domain-specific source synthesis before a human review item is created; absent evidence remains absent rather than being invented.
- Domain synthesis is provider-backed structured extraction, not a summary shortcut: each request contains only the requested generic domains and retrieved official excerpts, and every returned RuleAtom citation must resolve to a supplied one-based evidence packet. The cache key includes the source SHA, document-map/evidence hash, RuleAtom contract, and provider/model contract.
- Knowledge, identity, coverage and rule-review contracts are dependency-aware. A compatible source/HEPHAESTUS extraction is reused, while an upgraded knowledge or identity contract archives its prior artifact and invalidates only dependent knowledge-through-QA stages for canonical rebuilding.
- A Cockpit rule-review item is actionable on its own: stable ID, domain, severity, affected atoms, missing or contradictory fields, cited excerpts, confidence, automatic attempts, grounded candidates when available, and a recommended operator action are persisted in project state.
- Rule review declares its scope explicitly: `RULE_ATOM`, `DOMAIN`, or `CROSS_DOMAIN`. A genuinely missing domain may have no RuleAtom ID, but it must retain its retrieved evidence (when any), automatic attempts, exact acceptance failure, and operator action.
- Filename and intake labels are hints only. Verified source content or authoritative metadata wins over a technical batch prefix; an unverified edition remains `UNKNOWN_REVIEW_REQUIRED`.
