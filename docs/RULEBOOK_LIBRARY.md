# Bibliothèque locale de règlements MOBIUS

La bibliothèque de règlements est une **réserve locale de sources** destinée au pipeline MOBIUS. Elle ne fait pas partie du dépôt Git et ne doit jamais contenir de clés, de médias générés, ni de fichiers dont la provenance n’est pas clairement documentée.

> La collecte est volontairement désactivée au départ. MOBIUS doit d’abord connaître le disque Windows choisi, l’espace libre disponible et l’URL publique directe de chaque règlement provenant de l’éditeur ou du détenteur de droits.

## Emplacement local

Par défaut, les fichiers de bibliothèque sont créés ici :

```text
C:\mobius-games-tutorial-generator\data\rulebook-library\
```

| Sous-dossier | Rôle |
|---|---|
| `rules\` | PDF validés provenant d’une source officielle. |
| `manifest\rulebook-queue.json` | File de jeux, rang, langue préférée, source, statut et hash. |
| `logs\collection-events.jsonl` | Journal append-only des importations et futures tentatives. |
| `quarantine\` | Fichiers incomplets, non-PDF ou présentant une incohérence de validation. |

## Principes de provenance

La file de 2 000 jeux peut contenir les identifiants et rangs, mais un PDF ne peut être ajouté que si sa source est un lien public direct fourni par un éditeur, un studio ou un détenteur de droits vérifié. Le lien, la langue, la date, le hash SHA-256 et le résultat de validation doivent être conservés dans le manifeste.

Les pages de fichiers communautaires, les liens nécessitant un contournement de connexion, les copies non attribuées, les fichiers protégés par mot de passe ou les pages HTML déguisées en PDF sont exclus. Cette règle protège MOBIUS contre des données fragiles, des doublons et des problèmes de droits.

## Vérifier l’espace avant collecte

Avant tout téléchargement réel, exécuter dans **Windows PowerShell** :

```powershell
Get-PSDrive -PSProvider FileSystem |
    Select-Object Name, Root,
        @{Name='FreeGB'; Expression = { [math]::Round($_.Free / 1GB, 2) }},
        @{Name='UsedGB'; Expression = { [math]::Round($_.Used / 1GB, 2) }} |
    Format-Table -AutoSize
```

MOBIUS doit conserver une marge de sécurité : le collecteur sera configuré pour refuser tout nouveau téléchargement si l’espace libre passe sous le seuil que l’opérateur choisira.

## Initialiser et importer le classement

Après avoir obtenu un CSV de rangs que l’opérateur est autorisé à utiliser, initialiser la bibliothèque puis importer au maximum 2 000 jeux :

```powershell
Set-Location 'C:\mobius-games-tutorial-generator'
node .\scripts\rulebook-library.mjs init
node .\scripts\rulebook-library.mjs import-ranking --csv 'C:\Users\<TON_UTILISATEUR>\Downloads\bg_ranks.csv' --limit 2000
node .\scripts\rulebook-library.mjs status
```

L’import ne télécharge aucun PDF. Il produit une file reprenable dont chaque entrée est en statut `pending_source`. L’étape suivante sera un collecteur qui accepte uniquement des manifestes de liens officiels prévalidés et qui applique la limite d’espace libre.

## Prochain jalon

Le prochain correctif ajoutera un manifeste de sources officiel, la vérification de type PDF et de hash, les limites de taille et le mécanisme de reprise. Aucun fichier de règle ne sera ajouté à Git.
