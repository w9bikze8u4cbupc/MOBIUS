# Agent local autonome MOBIUS

## Objectif

L’agent local MOBIUS élimine les mises à jour manuelles répétées. Une fois activé, il surveille la branche `origin/main`, applique uniquement les mises à jour Git en avance rapide, reconstruit le client React lorsque nécessaire, puis redémarre exclusivement l’API MOBIUS sur le port 5001. Il attend ensuite une réponse HTTP 200 avant de marquer le déploiement comme prêt.

> L’agent ne télécharge aucun règlement, ne modifie aucun PDF de projet et ne touche jamais à une modification locale non validée. Si l’arbre Git est modifié, il se met volontairement en pause afin de protéger le travail local.

| Garantie | Comportement |
|---|---|
| Protection du travail local | Toute sortie non vide de `git status --porcelain` suspend le déploiement automatique. |
| Mise à jour déterministe | L’agent utilise `git pull --ff-only`; une fusion automatique ou un rebase implicite est donc exclu. |
| Redémarrage ciblé | Seuls les processus Node exécutant `src/api/index.js` sont arrêtés. |
| Validation après action | L’API doit répondre `HTTP 200` sur `http://127.0.0.1:5001/` avant que l’état soit `ready`. |
| Observabilité | Les journaux et le statut JSON sont enregistrés sous `C:\mobius-games-tutorial-generator\data\logs`. |
| Contrôle de Daniel | Une désinstallation propre est fournie; aucun privilège administrateur n’est nécessaire pour une tâche exécutée à l’ouverture de session. |

## Activation unique

Après avoir récupéré la version qui contient ces scripts, Daniel exécutera **une seule fois** dans Windows PowerShell :

```powershell
Set-Location 'C:\mobius-games-tutorial-generator'
.\scripts\install-mobius-local-agent.ps1
```

L’installateur crée la tâche Windows **`MOBIUS Local Agent`**, la démarre immédiatement, puis l’agent relance le contrôle toutes les 90 secondes. Les correctifs futurs ne demandent plus `git pull`, `npm run build` ni le redémarrage manuel de `node src/api/index.js`.

Les cmdlets Microsoft `Register-ScheduledTask` et `New-ScheduledTaskTrigger -AtLogOn` permettent d’enregistrer une tâche locale puis de la déclencher à la connexion.[1] [2] `Start-Process` permet au superviseur de lancer l’API locale avec un répertoire de travail et des fichiers de sortie explicites.[3]

## État et diagnostic

| Élément | Chemin complet | Utilité |
|---|---|---|
| État machine lisible | `C:\mobius-games-tutorial-generator\data\logs\mobius-local-agent.status.json` | État courant, message, commit et intervalle. |
| Journal de l’agent | `C:\mobius-games-tutorial-generator\data\logs\mobius-local-agent.log` | Décisions de mise à jour, sécurité et erreurs. |
| Journal API standard | `C:\mobius-games-tutorial-generator\data\logs\mobius-server.out.log` | Sortie de l’API MOBIUS. |
| Journal API d’erreur | `C:\mobius-games-tutorial-generator\data\logs\mobius-server.err.log` | Erreurs de démarrage ou d’exécution. |

L’état `ready` signifie que le dépôt local est aligné avec `origin/main` et que l’API a répondu au contrôle HTTP. L’état `waiting_for_clean_tree` signifie que l’agent protège volontairement un changement local. L’état `error` donne un message de diagnostic dans le fichier d’état et dans le journal.

## Désinstallation

Pour arrêter définitivement l’automatisation, exécuter :

```powershell
Set-Location 'C:\mobius-games-tutorial-generator'
.\scripts\uninstall-mobius-local-agent.ps1
```

Cela supprime la tâche Windows et arrête l’instance de l’agent, sans arrêter ni supprimer les projets MOBIUS.

## Références

[1] [Microsoft Learn — Register-ScheduledTask](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask?view=windowsserver2025-ps)

[2] [Microsoft Learn — New-ScheduledTaskTrigger](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/new-scheduledtasktrigger?view=windowsserver2025-ps)

[3] [Microsoft Learn — Start-Process](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.management/start-process?view=powershell-7.5)
