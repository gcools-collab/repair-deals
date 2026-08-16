# Repair Deals

Repair Deals détecte des appareils d'occasion en panne susceptibles d'être achetés, réparés puis revendus.

## Scanner Leboncoin

La première intégration suit ce chemin :

`POST /api/scanner` (Next.js) → `POST /search` (bridge FastAPI) → client non officiel `lbc`.

Copier `.env.example` vers `.env.local`, utiliser la même clé dans l'environnement du bridge, puis lancer séparément Next.js et le bridge.

Exemple :

```bash
curl -X POST http://localhost:3000/api/scanner \
  -H "Content-Type: application/json" \
  -d '{"query":"PlayStation HDMI HS","max_price":250,"limit":20,"broken_only":true}'
```

Le scanner accepte une recherche libre, une plage de prix, une localisation avec coordonnées et rayon, une limite et le filtre `broken_only`. Les résultats incluent les informations Leboncoin normalisées et les signaux de panne détectés.

## Validation manuelle

Avec le bridge et Next.js démarrés :

1. ouvrir `http://localhost:3000/scanner` ;
2. lancer une recherche, puis vérifier les états chargement, erreur, résultat vide et résultats ;
3. relancer immédiatement une autre recherche pour vérifier l’annulation de la précédente ;
4. ouvrir une annonce avec « Analyser le deal » ;
5. vérifier que `/analyse` importe seulement le titre et le prix disponible, et laisse toutes les estimations à compléter.

Aucune annonce de démonstration n’est injectée dans le Scanner.

## Identification produit

`POST /api/analyse-product` applique localement des règles explicables de catégorie, marque, modèle, référence et panne. Le moteur se trouve dans `src/lib/product-analysis`, ne dépend d’aucun service IA et retourne ses niveaux de confiance ainsi que les preuves utilisées.

```bash
npm test
```

## Développement Next.js

```bash
npm run dev
npm run lint
npm run build
```

Le bridge et ses instructions se trouvent dans `services/leboncoin-bridge`.

## Parts Intelligence avec eBay

1. Créer un compte sur le portail eBay Developers.
2. Dans **Application Keys**, créer ou ouvrir le jeu de clés Sandbox.
3. Copier l’App ID dans `EBAY_CLIENT_ID` et le Cert ID dans
   `EBAY_CLIENT_SECRET` dans `.env.local`.
4. Configurer `EBAY_ENVIRONMENT=sandbox`, puis redémarrer Next.js.
5. Ouvrir `/analyse`, identifier un produit et une panne, puis cliquer sur
   **Rechercher automatiquement**.

```dotenv
EBAY_CLIENT_ID=
EBAY_CLIENT_SECRET=
EBAY_ENVIRONMENT=sandbox
```

Ne jamais préfixer ces variables avec `NEXT_PUBLIC_` : le secret et les tokens doivent
rester côté serveur. Sans les deux credentials, Parts Intelligence conserve l’état
`provider_required` et la saisie manuelle continue de fonctionner.

Pour tester sans appeler eBay :

```bash
npm test
```

Pour passer en production, obtenir si nécessaire l’accès Buy API Production auprès d’eBay,
créer/récupérer le jeu de clés Production dans **Application Keys**, remplacer les deux
credentials dans l’environnement de déploiement et définir
`EBAY_ENVIRONMENT=production`. Ne pas réutiliser les clés Sandbox et redémarrer le serveur
afin de recréer le client et son cache mémoire.

Limites actuelles : cache local à chaque processus, trois recherches au maximum, dix
résultats par recherche, marketplace France, aucune conversion de devise et scoring de
compatibilité fondé sur les données exposées par Browse (principalement le titre). Le
