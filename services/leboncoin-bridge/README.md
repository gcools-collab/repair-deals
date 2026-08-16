# Repair Deals — Leboncoin Bridge

Microservice FastAPI interne qui isole l'accès non officiel à Leboncoin. Le Route Handler Next.js `/api/scanner` l'appelle côté serveur ; la clé partagée n'est jamais exposée au navigateur.

## Installation et lancement

Python 3.10 ou plus récent est requis.

```bash
python -m venv .venv
. .venv/bin/activate
python -m pip install -e ".[dev]"
export LEBONCOIN_BRIDGE_API_KEY="un-secret-long-et-aleatoire"
uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8080
```

## API

Toutes les routes exigent `X-Internal-Api-Key`.

```bash
curl -X POST http://127.0.0.1:8080/search \
  -H "Content-Type: application/json" \
  -H "X-Internal-Api-Key: $LEBONCOIN_BRIDGE_API_KEY" \
  -d '{"query":"MacBook écran cassé","min_price":20,"max_price":300,"limit":20,"broken_only":true}'
```

Critères acceptés : `query`, `min_price`, `max_price`, `postal_code`, `latitude`, `longitude`, `radius_km`, `limit` (1 à 35) et `broken_only`. Le rayon nécessite les coordonnées, conformément au contrat du client `lbc`.

Les annonces sont recherchées dans `TOUTES_CATEGORIES`, puis normalisées avec : identifiant, titre, description, prix, URL, images, marque, modèle/référence, localisation, date, attributs, mots-clés de panne et `likelyBroken`. `broken_only` filtre localement les annonces sans signal de panne.

La route `/listing` charge aussi une annonce précise à partir de son URL Leboncoin. La route `/health` expose l'état du service.

## Tests

```bash
python -m pytest
```

Les tests utilisent un faux gateway et n'appellent pas Leboncoin.

## Limites

- `lbc` dépend d'une API Leboncoin non documentée ; des changements, réponses 403 ou challenges Datadome restent possibles.
- La géolocalisation nécessite latitude et longitude : un code postal seul est conservé mais ne filtre pas la recherche.
- `broken_only` agit après la page de résultats retournée par Leboncoin ; il peut donc renvoyer moins que `limit` éléments.
- L'identification marque/modèle dépend des attributs disponibles dans chaque catégorie et peut rester vide.
