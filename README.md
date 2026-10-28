# QA Checklist

Application locale de checklists de test, en français, construite avec Vue 3, TypeScript, Vite, Vuetify 3, Pinia et Vue Router. Aucun backend, aucune base de données métier et aucun service externe. Les icônes et styles sont inclus dans le build.

## Développement

Prérequis : Node.js 22.12 ou plus récent (Node.js 24 recommandé) et npm.

```powershell
npm install
npm run dev
```

Ouvrir l’adresse affichée par Vite, par défaut [http://127.0.0.1:5173](http://127.0.0.1:5173). Le port est fixe : si 5173 est déjà utilisé, Vite le signale plutôt que de changer silencieusement l’origine de stockage. Les modifications des composants se rechargent automatiquement.

## Utilisation

- Trois catégories initiales : **Opération**, **Facturation**, **Maison funéraire**. Utiliser le bouton dossier « + » pour ajouter une catégorie et le crayon pour la renommer.
- Le bouton **Créer une checklist**, en bas du menu latéral, ouvre un formulaire avec un titre, un parent obligatoire et une description facultative. Les options de la checklist permettent de la modifier, de la déplacer vers une autre catégorie, de l’exporter ou de la supprimer.
- **Ajouter un cas de test** permet de saisir un titre, une description et les résultats attendus, un par ligne. Ils apparaissent sous forme de puces dans le tableau. Le menu de chaque cas permet de le modifier ou de le supprimer.
- Les trois boutons de résultat correspondent à **Non exécuté**, **Réussi** (crochet vert) et **Échoué** (croix rouge). Les nouveaux cas sont non exécutés. **Réinitialiser les résultats**, sous le tableau à droite, remet tous les cas de la checklist à cet état après confirmation.
- Sur mobile, le menu latéral devient un tiroir et les lignes du tableau se présentent verticalement.

## Sauvegarde locale et JSON

### Fichiers dans Documents

Dans **Chrome ou Edge**, cliquer sur **Choisir le dossier Documents**, sélectionner son dossier Documents et autoriser l’accès en lecture et écriture. L’application crée le sous-dossier `QAChecklist` si nécessaire. Il est également possible de sélectionner directement un dossier `QAChecklist` déjà créé dans Documents.

L’application enregistre ensuite automatiquement chaque modification dans **`Documents/QAChecklist/checklists.json`**. Le fichier contient les catégories, les checklists, les cas de test et leurs résultats. Une copie de la version précédente est conservée dans `checklists.previous.json`. Attendre l’état **Enregistré** avant de fermer la page; une écriture en cours ou en échec est indiquée dans le panneau de sauvegarde.

L’emplacement dépend du dossier choisi : le navigateur ouvre le sélecteur vers Documents, mais ne peut pas imposer silencieusement un chemin absolu. Les fichiers sont écrits sur le PC où le navigateur est ouvert, y compris lorsque l’application est servie par Docker.

Effacer le localStorage ou toutes les données du site ne supprime pas ces fichiers. Après un effacement, cliquer à nouveau sur **Choisir le dossier Documents** pour reconnecter le même dossier. L’application lit le JSON existant et restaure les checklists. Si des données différentes sont déjà affichées, elle propose de charger le fichier ou de fusionner les checklists avant toute écriture.

La référence au dossier peut être mémorisée dans IndexedDB, uniquement pour retrouver l’autorisation : les checklists restent dans le JSON externe. Le navigateur peut demander de reconnecter le dossier à une prochaine ouverture. Si cette mémorisation n’est pas disponible, la sauvegarde fonctionne pendant la session et le dossier devra être choisi à nouveau.

L’accès direct aux dossiers nécessite un navigateur compatible avec File System Access et un contexte sécurisé; `localhost` et `127.0.0.1` conviennent en développement et avec Docker. Firefox et Safari ne proposent pas cette sélection de dossier en écriture. Dans ces navigateurs, utiliser l’export JSON manuel ou ouvrir l’application dans Chrome/Edge pour activer la sauvegarde automatique sur disque. Voir la [documentation officielle de l’accès aux fichiers](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).

### Cache du navigateur et exports

Le `localStorage`, sous `qa-checklist.workspace.v1`, reste un cache immédiat. La checklist sélectionnée est conservée séparément sous `qa-checklist.selection.v1`. **Tant qu’aucun dossier n’est connecté, seul ce cache et les exports manuels conservent les données.** Le panneau le signale.

**Exporter cette checklist**, dans ses options, produit un fichier JSON avec sa catégorie. **Exporter tout en JSON**, dans le menu supérieur, produit une sauvegarde complète. **Importer** accepte ces deux exports (maximum 5 Mo) : l’ajout conserve les données existantes et crée une copie des checklists importées; le remplacement demande une confirmation. Les catégories de même nom sont réutilisées lors de l’ajout.

Le cache et l’autorisation du dossier restent propres au navigateur et à l’adresse utilisée (protocole, hôte et port). Pour passer de `127.0.0.1:5173` à `localhost:8080`, reconnecter le même dossier afin de retrouver le JSON sur disque, ou utiliser l’export/import manuel. Éviter d’éditer simultanément le même fichier depuis plusieurs fenêtres : une modification externe détectée suspend la sauvegarde et demande une reconnexion.

Si le cache est illisible, l’application suspend ses écritures et permet d’exporter la copie originale avant de réactiver ce cache. Cela ne bloque pas une sauvegarde disque valide. Si un fichier sur disque est illisible, il reste intact; le panneau signale le problème. La copie `checklists.previous.json` peut être importée manuellement pour récupérer la version précédente. Si le disque ou le stockage du navigateur est inaccessible, un message persistant l’indique; les modifications restent dans la page et peuvent être exportées avant sa fermeture.

Le format versionné est défini par les modèles dans `src/models/checklists/` et validé par `src/services/checklistJsonSerializer.ts`. Les champs sont en `camelCase` et seuls les statuts `notRun`, `passed` et `failed` sont acceptés.

Le stockage et les imports sont limités à 5 Mo de JSON UTF-8. Un export d’urgence reste possible si l’espace dépasse cette taille; exporter ensuite les checklists individuellement pour obtenir des fichiers réimportables. Une écriture trop volumineuse conserve la dernière sauvegarde lisible et affiche une erreur.

## Vérifications

```powershell
npm run lint
npm run type-check
npm run test
npm run build
npm run format:check
```

Les tests Vitest ciblent les fonctions critiques : import/export, intégrité des relations, persistance, remise à zéro, sauvegarde sur disque, reconnexion après effacement du cache et conservation des données en cas d’erreur de stockage. Les accès au navigateur et aux fichiers sont simulés en mémoire pour ces tests.

Pour prévisualiser le build de production :

```powershell
npm run build
npm run preview
```

## Docker Desktop

Aucun déploiement n’est nécessaire pour développer. Lorsque les fichiers seront commités sur la branche locale `master` :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\deploy-docker.ps1 -OpenBrowser
```

Le script construit et lance l’application sur [http://localhost:8080](http://localhost:8080) depuis le dernier commit local de `master`, sans changer la branche de travail ni commiter. Les modifications non commitées ne sont pas déployées. Voir [le guide Docker](docs/DOCKER.md) pour les paramètres, la restauration en cas d’échec et le transfert des données entre développement et Docker.

## Organisation

- `src/views/ChecklistWorkspaceView.vue` : composition de la page et orchestration des actions.
- `src/components/` : formulaires et tableau des cas de test.
- `src/store/checklistStore.ts` : état partagé et actions métier.
- `src/models/checklists/` : contrats typés, un modèle par fichier.
- `src/services/` : sérialisation, persistance locale et échanges de fichiers.
- `tests/` : tests des données et du stockage.
- `Dockerfile`, `docker/nginx.conf`, `scripts/deploy-docker.ps1` : build statique et déploiement local.

Axios n’est pas installé : cette application n’effectue aucune requête API.
