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

## Temps de rendu et observabilité

Le système doit mesurer séparément l’ingestion, l’extraction d’assets, l’écriture du script, la synthèse vocale, le rendu et le QA. Un rendu long est acceptable s’il est reproductible, résumable, observable et proportionné à la durée et à la complexité de la vidéo. MOBIUS doit afficher ou enregistrer les étapes et leurs durées afin que l’opérateur puisse savoir où le temps est passé.

## Garde de livraison

Avant une livraison, MOBIUS vérifie au minimum : résolution 1080p ou plus, présence et décodage valide de l’audio, durée de chaque segment audio, sous-titres français, niveau sonore de programme, absence de chevauchement critique entre texte et zone de démonstration, présence des chapitres, intro et outro, source des assets, manifeste et checksums. Une scène sans image pertinente, une narration manquante ou une page de livret masquée par du texte volumineux doit être signalée comme une exception à réviser, pas considérée automatiquement conforme.
