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
| Qu'est-ce qui est nouveau depuis ma dernière visite ? | Accueil « Nouveau » | ✗ spec 051 |
| Qu'est-ce qu'on attend de moi ? | Avenant à accepter, jalon à signer | ✓ · regroupé dans « À faire » : spec 051 |
| Que s'est-il passé cette semaine, en clair ? | Rapport client | ✓ · en sections rédigées : spec 050 |
| Où en est l'argent ? Que dois-je régler, et comment ? | Factures (lecture) | ✓ partiel · point sur l'argent, « Comment payer », « J'ai payé » : spec 051 |
| Puis-je poser une question sur ce que je vois ? | Messages | ✓ · depuis un rapport ou une photo : spec 051 |
| Suis-je prévenu sans ouvrir l'espace ? | E-mail (rapport, avenant) | ✓ · sur le téléphone : spec 051 |
| Puis-je choisir ce que je reçois par e-mail ? | — | ✗ spec 051 |
| Est-ce que je ne vois que ce qui a été validé ? | Photos des rapports validés uniquement | ✓ (spec 050, étape 0) |
| Payer en ligne | — | — retiré : les entreprises encaissent à leur façon |

## Le gérant (owner)

| Question | Où | État |
|---|---|---|
| Est-ce que je gagne de l'argent ? | Aujourd'hui : marge actuelle et prévue par chantier | ✓ |
| Qui me doit de l'argent ? | Aujourd'hui, Finance : créances, retards | ✓ |
| Quel chantier va mal ? | Aujourd'hui : chantiers à risque · Indicateurs | ✓ |
| Est-ce que j'ai de quoi payer dans 30, 60, 90 jours ? | Trésorerie et autonomie au rythme des dépenses | ✗ prévision : spec 053 |
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
| Qu'est-ce que je dis au client ? | Rapport client | ✓ · rédigé par l'IA, validé : spec 050 |
| Que demande le terrain ? | — | ✗ demande de matériel : spec 052 |
| Suis-je prévenu à temps ? | E-mail | ✗ sur le téléphone : spec 052 |

## Le chef de chantier (site_lead, app terrain)

| Question | Où | État |
|---|---|---|
| Qu'est-ce que je fais aujourd'hui ? | Accueil terrain : tâches, routines | ✓ |
| Qui est là ? | Présences cochées dans le rapport | ✓ |
| Comment je signale un problème ? | Imprévu | ✓ |
| Mon rapport est-il passé ? | Motif affiché quand il est rejeté | ✓ |
| Où est le plan ? | Onglet Plans, sans réseau | ✓ |
| Comment j'écris au bureau ? | — | ✗ fil du chantier : spec 052 |
| Comment je demande du matériel ? | — | ✗ spec 052 |
| Suis-je prévenu d'une tâche ? | E-mail | ✗ sur le téléphone : spec 052 |

## Le comptable (accountant)

| Question | Où | État |
|---|---|---|
| Qui doit payer, depuis quand ? | Finance : balance âgée | ✓ |
| Qu'est-ce qui est rentré ? | Derniers encaissements | ✓ |
| Qui relancer ? | Relances préparées | ✓ |
| Les pièces sont-elles en ordre ? | Documents à corriger | ✓ |
| Quels clients disent avoir payé ? | — | ✗ file « paiements déclarés » : spec 051 |
| Quelles factures fournisseurs payer, et quand ? | Dépenses (enregistrées une fois payées) | ✗ factures fournisseurs à payer : spec 053 |

## Sans compte

- **Ouvriers** : enregistrés, présence cochée par le chef de chantier, coût compté. ✓
- **Sous-traitants** : enregistrés et payés par chantier. ✓ Pas d'accès, volontairement.
