# Parts Intelligence

Cette couche transforme une identité produit et une panne en types de pièces probables et
en requêtes de recherche. Une suggestion n’est jamais présentée comme un diagnostic confirmé.

## Providers

Un provider implémente `PartProvider.search(input, queries)` et retourne uniquement des
`PartCandidate` normalisés. Le provider manuel est disponible immédiatement. Un futur
catalogue professionnel, magasin public, API officielle ou catalogue privé peut être ajouté
sans modifier l’agrégateur.

Chaque candidat doit conserver sa source, son URL, sa date de récupération, sa qualité,
sa disponibilité, sa compatibilité et les preuves associées. Un provider inconnu ne doit
jamais fournir de prix par défaut.

## Sélection et coûts

La sélection automatique éventuelle classe d’abord la compatibilité, puis la qualité
(OEM, original démonté, compatible premium, reconditionné, compatible, inconnue), puis
le prix total. Les candidats incompatibles sont exclus.

L’agrégation financière porte exclusivement sur les candidats explicitement sélectionnés.
Si le prix unitaire, la quantité ou la livraison d’une pièce est inconnu, le total reste
`null`. Une saisie de livraison à zéro signifie que l’utilisateur a confirmé l’absence
de frais ; une case vide reste inconnue.

## Provider eBay Browse

Le provider eBay utilise exclusivement les endpoints officiels OAuth
`/identity/v1/oauth2/token` et Browse `/buy/browse/v1/item_summary/search`.
Il s’exécute uniquement dans le Route Handler serveur. Le token Application OAuth est
conservé en mémoire et renouvelé une minute avant expiration ; les résultats de recherche
sont conservés cinq minutes. Les requêtes sont dédupliquées et limitées à trois recherches
de dix résultats.

Le marketplace ciblé est `EBAY_FR`. Le filtrage exige le type de pièce et calcule une
compatibilité à partir du modèle exact, de la référence, de la marque et des contradictions.
Les accessoires, services de réparation et variantes de modèle contradictoires sont exclus.
Une sélection automatique exige au moins 85/100. Les mentions OEM restent seulement des
indices, jamais une authentification.

Le prix et la devise eBay sont conservés tels quels. Aucun taux de change n’est appliqué.
Seuls les candidats EUR avec livraison connue peuvent contribuer automatiquement au calcul ;
un candidat non EUR reste informatif. Une livraison absente ne vaut jamais livraison gratuite.

Le Sandbox eBay contient peu de données Browse et peut retourner des résultats mockés ou
