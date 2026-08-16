# Market Intelligence

Le fournisseur construit d’abord la requête la plus précise disponible : référence fiable,
marque et modèle, modèle à marque implicite, puis titre nettoyé en dernier recours.
Les termes de panne ne sont jamais conservés dans la requête de repli.

Chaque annonce est rejetée avant le calcul si elle décrit une panne, une réparation,
un accessoire seul, un lot, un autre modèle ou une catégorie contradictoire.
Le seuil de correspondance est centralisé dans `MARKET_MATCH_THRESHOLD`.

Les prix retenus sont triés. À partir de quatre valeurs, les observations hors des bornes
`Q1 - 1,5 × IQR` et `Q3 + 1,5 × IQR` sont retirées. Le prix bas, la médiane et le prix
haut correspondent ensuite respectivement à Q1, Q2 et Q3.

La confiance sur 100 est la somme de quatre composantes déterministes :

- taille de l’échantillon : 40 points, saturés à 15 comparables ;
- qualité moyenne du match : 35 points ;
- faible dispersion relative `IQR / médiane` : 15 points ;
- précision de l’identité utilisée pour la requête : 10 points.

Moins de trois comparables, une identité trop vague ou une dispersion relative supérieure
à 0,75 ne produit aucun prix. Les seuils sont exportés et peuvent être configurés dans les tests
ou par un futur fournisseur.
