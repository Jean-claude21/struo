# Struo — Vision

> *Struo* : « je construis » en latin. Nom de travail, il pourra changer.

## Le problème

Les entreprises de BTP d'Afrique de l'Ouest (architecture, ingénierie, construction, rénovation)
pilotent leurs chantiers avec un fichier Excel, des appels et des messages WhatsApp. Les mêmes
problèmes reviennent :

| Problème | Conséquence |
|---|---|
| Pas d'outil terrain, réseau instable hors des grandes villes | L'avancement arrive en retard ou pas du tout ; aucune preuve photo datée |
| Impayés détectés trop tard | Chantiers suspendus, trésorerie tendue |
| Pas d'alerte sur les documents | Assurances ou permis expirés sans que personne ne le voie |
| Pas de suivi des coûts | Impossible de connaître la marge réelle d'un chantier ou d'un segment |
| Pas de portail client | Les clients (souvent de la diaspora) appellent pour savoir où en est leur maison |

## La promesse

**Pilotez tous vos chantiers, même sans réseau.** Une seule plateforme pour le terrain, le bureau
et le client, conçue pour le réseau, les moyens de paiement et les usages d'Afrique de l'Ouest.

## Pour qui

Les PME du BTP de 5 à 200 personnes. Le premier client (client pilote) est un cabinet
d'architecture et d'ingénierie de Lomé ; son nom et ses données ne figurent pas dans ce dépôt public.

## Les applications

Une seule application web (TanStack Start), plusieurs portes :

| Porte | Pour qui | Ce qu'elle fait |
|---|---|---|
| **Site** (`/`) | Prospects | Présentation, tarifs en FCFA, inscription, essai |
| **Bureau** (`/app`) | Gérant·e, ingénieur·e, comptable, admin | Projets, terrain, finances, dépenses, documents, planning, clients, alertes, paramètres |
| **Terrain** (`/field`) | Chefs de chantier | PWA installable, hors-ligne : rapport photo géolocalisé, avancement par phase, imprévus, synchronisation |
| **Portail client** (`/portal`) | Clients finaux | Avancement, photos, documents, situations à régler, paiement, messages, validation des jalons |
| **Console** (`/console`) | L'éditeur de Struo | Entreprises clientes, formules, usage |
| **API et MCP** (`/api`, `/mcp`) | Intégrations, Claude, ChatGPT | Les mêmes services que l'interface, par groupes d'outils |

## Principes produit

1. **Le terrain d'abord.** Si le chef de chantier ne saisit pas, tout le reste est vide : un
   rapport en moins de deux minutes, des photos, la voix, et ça marche sans réseau.
2. **Le métier est une configuration.** Types de projets, phases, documents obligatoires, TVA,
   retenue de garantie, seuils d'alerte : réglés par chaque entreprise.
3. **L'argent est exact.** Montants entiers en FCFA (ou autre devise), calculés par la base.
4. **Les alertes viennent à vous.** Impayés, documents qui expirent, jalons en retard, écart entre
   avancement et encaissement : sur le tableau de bord et par courriel ou WhatsApp.
5. **Le client voit son chantier.** Un lien sécurisé, sans compte à créer.
6. **L'IA travaille sur des données vraies.** Par le MCP, avec les droits de la personne, sans
   jamais inventer un chiffre.

## Ce que Struo n'est pas

- Un logiciel de comptabilité générale (on exporte vers le logiciel du comptable).
- Un outil de dessin ou de métré (on attache les plans).
- Un outil de vision par ordinateur (détection de fissures) : écarté, peu fiable et non demandé.

## Personas et verdict

| Persona | Utiliserait ? | Condition indispensable |
|---|---|---|
| Gérant·e / architecte | Oui | Alertes et synthèse sans ouvrir l'application tous les jours |
| Ingénieur·e génie civil | Oui | Valider un rapport en moins de 30 secondes |
| Chef de chantier | Oui, sous conditions — **le risque principal** | Rapport en moins de 2 minutes, hors-ligne, photos compressées |
| Comptable | Oui | Pas de double saisie ; export vers son logiciel |
| Client de la diaspora | Oui, très fort | Photos au moins hebdomadaires ; paiement à distance |
| Client institutionnel | Peu | Recevoir les PDF par courriel |
| Autre PME BTP (prospect) | Oui à partir d'environ 10 salariés | Prix en FCFA, import des données existantes, essai gratuit |

Hypothèse à valider avant tout le reste : **un chef de chantier envoie au moins trois rapports par
semaine pendant un mois** sans relance du bureau.
