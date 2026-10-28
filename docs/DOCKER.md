# Déploiement local avec Docker Desktop

Le conteneur sert uniquement les fichiers statiques de l’application avec Nginx. Il ne contient ni API, ni base de données. Dans Chrome ou Edge, les checklists peuvent être enregistrées automatiquement dans `Documents/QAChecklist/checklists.json` sur le PC où le navigateur est ouvert, après sélection et autorisation du dossier.

## Prérequis

- Windows PowerShell 5.1 ou PowerShell 7, Git et Docker Desktop.
- Docker Desktop configuré pour les conteneurs Linux, généralement avec WSL 2.
- Les fichiers de l’application, y compris `package-lock.json`, commités dans la branche **locale `master`**. Le script ne crée aucun commit et ne récupère pas automatiquement une branche distante.
- Un accès Internet pour télécharger les images Docker et les dépendances npm lors du premier build.

## Lancer le déploiement

Depuis la racine du dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-docker.ps1 -OpenBrowser
```

Avec PowerShell 7 :

```powershell
pwsh -File .\scripts\deploy-docker.ps1 -OpenBrowser
```

L’application sera disponible à **http://localhost:8080**. Pour choisir un autre port :

```powershell
pwsh -File .\scripts\deploy-docker.ps1 -Port 8081 -OpenBrowser
```

`-ImageName` et `-ContainerName` permettent de changer les noms, tous deux `qa-checklist` par défaut. L’application est exposée seulement sur la boucle locale de la machine.

## Fonctionnement du script

1. Vérifier Git, Docker et les fichiers commités sur `master`.
2. Démarrer Docker Desktop si son moteur ne répond pas et si une installation système ou utilisateur est détectée ; attendre au maximum 180 secondes.
3. Exporter le commit de `master` dans un dossier temporaire avec `git archive`.
4. Construire l’image avec `npm ci` puis `npm run build`. La branche active et les fichiers de travail ne sont jamais modifiés.
5. Après un build réussi, remplacer le conteneur créé par ce script et vérifier `/health`. Un conteneur existant sans l’étiquette de gestion de l’application est conservé et le script s’arrête avec une erreur.
6. Si le démarrage échoue, tenter de restaurer le conteneur précédent. Supprimer l’ancien conteneur seulement après une vérification réussie, puis nettoyer le dossier temporaire.

La politique `unless-stopped` permet le redémarrage automatique avec Docker, sauf si le conteneur a été arrêté manuellement. Les anciennes images ne sont pas supprimées automatiquement.

## Sauvegarde et transfert des checklists

Après le premier déploiement, ouvrir l’application dans Chrome ou Edge puis cliquer sur **Choisir le dossier Documents**. Sélectionner Documents (ou directement son sous-dossier QAChecklist) et autoriser l’accès. Aucun volume Docker n’est nécessaire : c’est le navigateur qui écrit le fichier sur son PC, sans passer par Nginx.

Le navigateur distingue `http://127.0.0.1:5173`, `http://localhost:8080` et `http://127.0.0.1:8080`. Leurs caches et autorisations sont séparés. Pour passer du développement à Docker, sélectionner le même dossier de sauvegarde à la nouvelle adresse : l’application relit le JSON existant. Si les données affichées et le fichier diffèrent, choisir explicitement de charger le fichier ou de fusionner les checklists. L’export/import manuel reste disponible.

La suppression du conteneur et l’effacement des données du navigateur ne suppriment pas les fichiers JSON externes. Après un nettoyage des données du site, reconnecter le dossier pour retrouver les checklists. Le fichier `checklists.previous.json` conserve la version précédente. Attendre l’indication d’enregistrement réussi avant de fermer la page. Dans un navigateur sans accès direct aux fichiers ou avant la connexion du dossier, seuls le cache et les exports manuels sont utilisés.

## Diagnostic

```powershell
docker logs qa-checklist
docker inspect qa-checklist
```

Si le port est déjà utilisé, libérer le port ou relancer avec `-Port`. Si le commit de `master` ne contient pas encore l’application, commiter manuellement les changements avant de relancer.

Le script peut être vérifié sans démarrer Docker avec le parseur PowerShell :

```powershell
$tokens = $null
$parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile(
    (Join-Path $PWD 'scripts\deploy-docker.ps1'), [ref]$tokens, [ref]$parseErrors
) | Out-Null
$parseErrors
```

Une sortie vide signifie qu’aucune erreur de syntaxe n’a été détectée. Cela ne remplace pas la vérification d’un build et d’un démarrage réels avec Docker Desktop.
