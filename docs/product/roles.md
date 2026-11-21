# Les acteurs et leurs questions

> La carte de ce que Struo couvre, vue depuis les personnes qui l'utilisent.
> Chaque spec dit à quelles questions elle répond. Chaque fin de spec refait le parcours à l'écran
> des rôles touchés, avec la démo. Avant une mise en production ou une démo commerciale : tous les rôles.
>
> ✓ répondu · ✗ manque (avec la spec prévue) · — retiré volontairement

Dernier pointage : 2026-11-21 (dans le code ; parcours à l'écran à refaire après les specs 050 à 053).

## Le client (espace client, sans compte)

| Question | Où | État |
|---|---|---|
| Où en est mon chantier ? | Espace › Chantier : avancement par étape, photos validées | ✓ |
| Qu'est-ce qui est nouveau depuis ma dernière visite ? | Accueil « Nouveau depuis votre visite » | ✓ (051) |
| Qu'est-ce qu'on attend de moi ? | Accueil « À faire » : avenants, étapes à valider, factures dues | ✓ (051) |
| Que s'est-il passé cette semaine, en clair ? | Rapport client en sections, PDF | ✓ (050) |
| Où en est l'argent ? Que dois-je régler, et comment ? | Factures : le point sur l'argent, « Comment payer », « J'ai payé » | ✓ (051) — PDF de chaque facture : à faire |
| Puis-je poser une question sur ce que je vois ? | Messages, « Poser une question » depuis un rapport du terrain | ✓ (051) |
| Suis-je prévenu sans ouvrir l'espace ? | Notifications sur le téléphone + e-mail | ✓ (051) |
| Puis-je choisir ce que je reçois par e-mail ? | Accueil : « Recevoir aussi les nouvelles par e-mail » | ✓ (051) |
| Est-ce que je ne vois que ce qui a été validé ? | Photos des rapports validés uniquement | ✓ (spec 050, étape 0) |
| Payer en ligne | — | — retiré : les entreprises encaissent à leur façon |

## Le gérant (owner)

| Question | Où | État |
|---|---|---|
| Est-ce que je gagne de l'argent ? | Aujourd'hui : marge actuelle et prévue par chantier | ✓ |
| Qui me doit de l'argent ? | Aujourd'hui, Finance : créances, retards | ✓ |
| Quel chantier va mal ? | Aujourd'hui : chantiers à risque · Indicateurs | ✓ |
| Est-ce que j'ai de quoi payer dans 30, 60, 90 jours ? | Accueil « Dans 30 jours », Finance › Trésorerie | ✓ (053) |
| Combien me coûte la main-d'œuvre ? | Main-d'œuvre par chantier | ✓ |
| Qu'est-ce que je vais signer ? (devis) | — | — hors périmètre (décision du 2026-11-21) |

## L'administrateur

Les écrans du gérant, plus l'équipe et les paramètres. ✓

## Le conducteur de travaux (engineer)

| Question | Où | État |
|---|---|---|
| Qu'est-ce que je dois valider ? | Aujourd'hui : boîte des rapports | ✓ |
| Qu'est-ce qui coince ? | Imprévus ouverts, jalons et tâches en retard | ✓ |
| Qui fait quoi ? | Tâches, planning | ✓ |
| Qu'est-ce que je dis au client ? | Rapport client rédigé à partir des faits, validé | ✓ (050) |
| Que demande le terrain ? | Accueil et chantier › Demandes de matériel | ✓ (052) |
| Suis-je prévenu à temps ? | Notifications sur le téléphone (rapports, imprévus, fil, matériel) + e-mail | ✓ (052) |

## Le chef de chantier (site_lead, app terrain)

| Question | Où | État |
|---|---|---|
| Qu'est-ce que je fais aujourd'hui ? | Accueil terrain : tâches, routines | ✓ |
| Qui est là ? | Présences cochées dans le rapport | ✓ |
| Comment je signale un problème ? | Imprévu | ✓ |
| Mon rapport est-il passé ? | Motif affiché quand il est rejeté | ✓ |
| Où est le plan ? | Onglet Plans, sans réseau | ✓ |
| Comment j'écris au bureau ? | App terrain › Bureau › Fil du chantier (hors ligne aussi) | ✓ (052) |
| Comment je demande du matériel ? | App terrain › Bureau › Demander du matériel | ✓ (052) |
| Suis-je prévenu d'une tâche ? | Notification sur le téléphone + e-mail | ✓ (052) |

## Le comptable (accountant)

| Question | Où | État |
|---|---|---|
| Qui doit payer, depuis quand ? | Finance : balance âgée | ✓ |
| Qu'est-ce qui est rentré ? | Derniers encaissements | ✓ |
| Qui relancer ? | Relances préparées | ✓ |
| Les pièces sont-elles en ordre ? | Documents à corriger | ✓ |
| Quels clients disent avoir payé ? | Accueil et Finance › Paiements déclarés | ✓ (051) |
| Quelles factures fournisseurs payer, et quand ? | Finance › Trésorerie › Factures fournisseurs à payer | ✓ (053) |

## Sans compte

- **Ouvriers** : enregistrés, présence cochée par le chef de chantier, coût compté. ✓
- **Sous-traitants** : enregistrés et payés par chantier. ✓ Pas d'accès, volontairement.
