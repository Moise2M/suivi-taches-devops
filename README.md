# 📋 Suivi Tâches DevOps - Application NestJS

Application complète de suivi des tâches DevOps avec backend NestJS et frontend React, incluant l'export professionnel avec amélioration IA via l'API Claude d'Anthropic.

## 🚀 Fonctionnalités

### ✅ Gestion des tâches
- Ajout, modification, suppression de tâches
- Suivi du temps (heure de début et de fin)
- Marquage des tâches comme complétées
- Organisation par date et par projet

### 📊 Projets personnalisables
- Gestion des projets (ajout/suppression)
- Projets par défaut : Voyage, xflow/mcacl, djanta/odoo, Infrastructure, Autre

### 📈 Statistiques
- Nombre total de tâches
- Tâches complétées
- Jours actifs
- Projets actifs

### 📥 Export des rapports
- **Export simple** : Génération de rapport texte brut
- **Export professionnel (IA)** : Amélioration automatique des descriptions via l'API Claude
  - Correction orthographique
  - Formulation professionnelle
  - Ton technique adapté

## 🛠️ Architecture

```
suivi-taches-devops/
├── src/
│   ├── controllers/       # Contrôleurs REST API
│   │   └── tasks.controller.ts
│   ├── database/          # Persistance SQLite
│   │   ├── database.module.ts
│   │   └── database.service.ts
│   ├── services/          # Logique métier
│   │   └── tasks.service.ts
│   ├── modules/           # Modules NestJS
│   │   └── tasks.module.ts
│   ├── dto/               # Data Transfer Objects
│   │   └── task.dto.ts
│   ├── app.module.ts      # Module principal
│   └── main.ts            # Point d'entrée
├── data/
│   └── tasks.db           # Base de données SQLite (créée au 1er démarrage)
├── public/
│   └── index.html         # Frontend React
├── .env                   # Variables d'environnement
├── package.json
├── tsconfig.json
└── nest-cli.json
```

## 📦 Installation

### Prérequis
- Node.js >= 18
- npm ou yarn

### 1. Cloner et installer les dépendances

```bash
cd suivi-taches-devops
npm install
```

### 2. Configuration des variables d'environnement

Copier le fichier `.env.example` vers `.env` :

```bash
cp .env.example .env
```

Éditer le fichier `.env` et configurer votre clé API Anthropic :

```env
PORT=3000
NODE_ENV=development

# Configuration Anthropic API pour l'export IA
ANTHROPIC_API_KEY=sk-ant-your-api-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
ANTHROPIC_MAX_TOKENS=4000

CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

**🔑 Obtenir une clé API Anthropic :**
1. Aller sur https://console.anthropic.com/
2. Créer un compte ou se connecter
3. Aller dans "API Keys"
4. Créer une nouvelle clé
5. Copier la clé dans `.env`

## 🚀 Démarrage

### Mode développement (avec rechargement automatique)

```bash
npm run start:dev
```

### Mode production

```bash
npm run build
npm run start:prod
```

### Mode production avec PM2 (recommandé en serveur)

PM2 maintient l'application en vie et la redémarre automatiquement en cas de crash.

**Installation de PM2 (une seule fois) :**
```bash
npm install -g pm2
```

**Démarrer l'application :**
```bash
npm run build
pm2 start dist/main.js --name suivi-taches-devops
```

**Commandes PM2 utiles :**
```bash
pm2 status                          # Voir l'état des processus
pm2 logs suivi-taches-devops        # Voir les logs en direct
pm2 restart suivi-taches-devops --update-env  # Redémarrer (recharge le .env)
pm2 stop suivi-taches-devops        # Arrêter
pm2 delete suivi-taches-devops      # Supprimer du gestionnaire
```

**Démarrage automatique au boot du système :**
```bash
pm2 startup          # Génère la commande à exécuter (suivre les instructions)
pm2 save             # Sauvegarde la liste des processus actifs
```

L'application sera disponible sur :
- **Frontend** : http://localhost:3000
- **API** : http://localhost:3000/api

## 📡 API REST

### Endpoints des tâches

#### GET /api/tasks
Récupère toutes les tâches

#### POST /api/tasks
Crée une nouvelle tâche

Body :
```json
{
  "date": "2026-04-20",
  "project": "Voyage",
  "description": "Mise à jour de prod",
  "startTime": "09:00",
  "status": "active"
}
```

`status` accepte : `"template"` (planifiée), `"active"` (en cours), `"done"` (terminée manuelle)

#### PUT /api/tasks/:id
Met à jour une tâche existante

#### DELETE /api/tasks/:id
Supprime une tâche

#### POST /api/tasks/:id/toggle
Bascule le statut complété/non complété

#### POST /api/tasks/:id/start
Démarre une tâche planifiée — capture `startTime` = heure actuelle

#### POST /api/tasks/:id/stop
Termine une tâche en cours — capture `endTime` = heure actuelle, marque comme complétée

#### POST /api/tasks/export/weekly
Génère un rapport hebdomadaire simple

Body :
```json
{
  "weekStart": "2026-04-14"
}
```

#### POST /api/tasks/export/professional
Génère un rapport hebdomadaire professionnel avec amélioration IA

Body :
```json
{
  "weekStart": "2026-04-14"
}
```

⚠️ **Nécessite une clé API Anthropic valide**

### Endpoints des projets

#### GET /api/projects
Récupère tous les projets

#### POST /api/projects
Ajoute un nouveau projet

Body :
```json
{
  "name": "Nouveau Projet"
}
```

#### DELETE /api/projects/:name
Supprime un projet

## 🧪 Tests

```bash
# Tests unitaires
npm run test

# Tests e2e
npm run test:e2e

# Couverture de code
npm run test:cov
```

## 🎨 Frontend

Le frontend est une Single Page Application (SPA) React servie directement par NestJS.

### Caractéristiques :
- React 18 avec Hooks
- Tailwind CSS pour le styling
- Intégration complète avec l'API backend
- Interface responsive
- Pas de build nécessaire (CDN)

### Personnalisation :

Pour modifier le frontend, éditer `/public/index.html`

## 🔧 Développement avec Claude Code

Cette application est conçue pour être facilement étendue avec Claude Code :

### Améliorations suggérées :

1. **Persistence des données**
   - ✅ SQLite intégré (`data/tasks.db`)
   - Migration possible vers PostgreSQL via TypeORM

2. **Authentification**
   - Ajouter JWT
   - Gestion des utilisateurs multi-tenant

3. **Fonctionnalités avancées**
   - Calendrier interactif
   - Graphiques de productivité
   - Notifications par email
   - Export PDF/DOCX

4. **Optimisations**
   - Cache Redis
   - WebSockets pour temps réel
   - Queue pour les exports IA (Bull)

## 🐛 Débogage

### Problème : Export IA ne fonctionne pas

Vérifier :
1. La clé API Anthropic est correctement configurée dans `.env`
2. La clé est valide et a des crédits
3. Vérifier les logs du serveur : `LOG_LEVEL=debug npm run start:dev`

### Problème : Port déjà utilisé

Changer le port dans `.env` :
```env
PORT=3001
```

## 📝 Licence

MIT

## 👤 Auteur

Moise - DevOps Engineer

## 🤝 Contribution

Les contributions sont les bienvenues ! N'hésitez pas à ouvrir une issue ou une pull request.

---

**Note** : Cette application utilise l'API Claude d'Anthropic pour l'amélioration des descriptions de tâches. L'utilisation de l'API est soumise aux tarifs d'Anthropic.
