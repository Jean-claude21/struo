// Struo's legal pages in French (spec 060): legal notice, privacy, cookies, terms, data processing.
// Plain HTML fragments written by us (no user input); legal.en.ts has the same pages and sections.
import type { LegalPages } from './legal.ts';

export const legalFr: LegalPages = {
  "notice": {
    "slug": "mentions-legales",
    "title": "Mentions légales",
    "lead": "Qui édite Struo, qui l’héberge, et comment nous joindre.",
    "summary": [],
    "sections": [
      {
        "id": "editeur",
        "title": "Éditeur",
        "html": "<p>Struo est un logiciel en ligne de gestion d’entreprise de construction, édité par <strong>Kete</strong> (<a href=\"https://kete.digital\">kete.digital</a>), activité exercée en indépendant.</p>\n<ul>\n  <li><strong>Contact :</strong> <a href=\"mailto:contact@kete.digital\">contact@kete.digital</a></li>\n</ul>"
      },
      {
        "id": "hebergement",
        "title": "Hébergement",
        "html": "<ul>\n  <li><strong>Serveur de l’application :</strong> Contabo GmbH, Aschauer Straße 32a, 81549 Munich, Allemagne.</li>\n  <li><strong>Base de données et fichiers :</strong> Neon, Inc. Les données sont stockées dans un centre de données situé à Francfort, en Allemagne (Union européenne).</li>\n  <li><strong>Mesure d’audience :</strong> Umami, installé et exploité par Kete sur son propre serveur.</li>\n</ul>"
      },
      {
        "id": "propriete",
        "title": "Propriété intellectuelle",
        "html": "<p>Le nom Struo, le logo, les textes, l’interface et le code du site appartiennent à Kete. Toute reproduction sans accord écrit est interdite.</p>\n<p>Les photos du site sont des illustrations. Elles ne représentent ni des clients de Struo ni des chantiers réels.</p>\n<p>Les données que nos clients enregistrent dans Struo leur appartiennent. Voir les <a href=\"/conditions\">conditions générales</a>.</p>"
      },
      {
        "id": "chiffres",
        "title": "Chiffres cités",
        "html": "<p>Les chiffres sur le temps perdu dans la construction viennent de l’étude <em>Construction Disconnected</em> (PlanGrid et FMI, 2018), menée auprès de près de 600 dirigeants. Le calculateur du site donne une estimation indicative : ce n’est ni une promesse ni une garantie de résultat.</p>"
      },
      {
        "id": "signaler",
        "title": "Signaler un contenu ou une faille",
        "html": "<p>Pour signaler un contenu illicite ou une faille de sécurité, écrivez à <a href=\"mailto:contact@kete.digital\">contact@kete.digital</a> en décrivant le problème. Merci de ne pas exploiter une faille au-delà de ce qui est nécessaire pour la démontrer.</p>"
      }
    ]
  },
  "privacy": {
    "slug": "confidentialite",
    "title": "Politique de confidentialité",
    "lead": "Quelles données Struo traite, pourquoi, combien de temps, et comment exercer vos droits. Cette politique suit le Règlement général sur la protection des données (RGPD) et s’applique dans tous les pays où Struo est utilisé.",
    "summary": [
      "Les données de vos chantiers sont à votre entreprise. Nous les traitons uniquement pour faire fonctionner Struo.",
      "Nous ne vendons aucune donnée et nous ne faisons pas de publicité.",
      "Le site public est mesuré sans cookie et sans suivi d’une personne.",
      "Vos données sont stockées dans l’Union européenne.",
      "Vous pouvez exporter toutes les données de votre entreprise en un clic, à tout moment."
    ],
    "sections": [
      {
        "id": "roles",
        "title": "Qui est responsable de vos données",
        "html": "<p>Struo est édité par Kete (<a href=\"mailto:contact@kete.digital\">contact@kete.digital</a>). Selon la donnée, notre rôle change :</p>\n<ul>\n  <li><strong>Kete est responsable du traitement</strong> pour les données des visiteurs du site, des personnes qui demandent à être rappelées, et des comptes (identité, connexion, facturation de la licence).</li>\n  <li><strong>Kete est sous-traitant</strong> pour tout ce qu’une entreprise enregistre dans Struo : ses chantiers, son équipe, ses clients, ses photos, ses documents et ses factures. L’entreprise cliente est alors responsable du traitement, et Kete agit selon ses instructions, dans le cadre de l’<a href=\"/traitement-donnees\">accord de traitement des données</a>.</li>\n</ul>\n<p>Si vous êtes client final d’une entreprise qui utilise Struo (par exemple le propriétaire d’une maison en construction), c’est cette entreprise qui décide de l’usage de vos données. Adressez-vous d’abord à elle. Si vous nous écrivez, nous lui transmettons votre demande.</p>"
      },
      {
        "id": "donnees",
        "title": "Les données que nous traitons",
        "html": "<h3>Visiteurs du site public</h3>\n<ul>\n  <li><strong>Mesure d’audience :</strong> pages vues, pays, type d’appareil et page d’origine, mesurés par Umami, installé sur notre propre serveur, sans cookie et sans identifiant personnel. Seules les pages publiques sont mesurées, jamais l’application.</li>\n  <li><strong>Demande de rappel :</strong> nom, entreprise, moyen de contact (téléphone, WhatsApp ou e-mail), nombre de chantiers et votre question si vous en posez une.</li>\n  <li><strong>Choix du pays et de la langue,</strong> pour afficher le bon prix et la bonne langue (voir <a href=\"/cookies\">cookies</a>).</li>\n</ul>\n<h3>Comptes et utilisateurs</h3>\n<ul>\n  <li>Nom, adresse e-mail, téléphone si vous le donnez, rôle dans l’entreprise, langue.</li>\n  <li>Mot de passe, conservé uniquement sous forme chiffrée irréversible (hachage). Nous ne le connaissons pas.</li>\n  <li>Journal des actions importantes (qui a validé un rapport, émis une facture, changé un droit), pour la traçabilité au sein de l’entreprise.</li>\n  <li>Connexions à des assistants (Claude, ChatGPT ou autres) et clés d’accès : nous conservons seulement une empreinte des clés, jamais la clé elle-même.</li>\n</ul>\n<h3>Données enregistrées par l’entreprise</h3>\n<ul>\n  <li><strong>Chantiers :</strong> adresse et position sur la carte, phases, planning, avancement, budget, dépenses, factures, documents.</li>\n  <li><strong>Rapports de terrain :</strong> photos avec leur date, leur heure et leur position GPS, notes écrites, notes vocales et leur transcription, signatures, checklists, présences des ouvriers.</li>\n  <li><strong>Clients finaux :</strong> nom, coordonnées, chantier concerné, factures, messages, signatures d’étapes, visites de l’espace client.</li>\n  <li><strong>Équipe et sous-traitants :</strong> nom, métier, coordonnées, présences.</li>\n</ul>\n<p>La position GPS d’une photo sert à prouver où elle a été prise. Elle n’est enregistrée qu’au moment de la prise de vue, jamais en continu : Struo ne suit pas les déplacements des personnes.</p>\n<h3>Espace client</h3>\n<ul>\n  <li>Date de la dernière visite, pour signaler ce qui est nouveau depuis.</li>\n  <li>Votre choix de recevoir ou non les e-mails, et l’abonnement aux notifications si vous l’activez sur votre téléphone.</li>\n  <li>Les déclarations de paiement que vous envoyez, avec leur justificatif. Struo n’encaisse aucun paiement : votre règlement se fait directement avec l’entreprise.</li>\n</ul>\n<h3>Paiement de la licence</h3>\n<p>Les licences Struo s’achètent sur la boutique de notre prestataire de paiement, Chariow. Kete reçoit la confirmation de l’achat (formule, durée, montant, adresse e-mail de l’acheteur). Nous ne voyons jamais vos coordonnées bancaires.</p>\n<h3>Données techniques</h3>\n<p>Adresse IP, navigateur et heure des requêtes dans les journaux du serveur ; rapports d’erreur techniques (Sentry, hébergés dans l’Union européenne), qui servent à corriger les pannes et ne contiennent pas le contenu de vos chantiers.</p>"
      },
      {
        "id": "finalites",
        "title": "Pourquoi nous les traitons",
        "html": "<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Finalité</th><th scope=\"col\">Base légale</th></tr></thead><tbody><tr><td>Fournir Struo : comptes, chantiers, rapports, factures, espace client, mode hors ligne</td><td>Exécution du contrat</td></tr><tr><td>Envoyer les e-mails et notifications utiles (invitation, rapport à valider, facture, rapport client)</td><td>Exécution du contrat</td></tr><tr><td>Assistant intégré et transcription des notes vocales, quand l’entreprise les active</td><td>Exécution du contrat, sur instruction de l’entreprise</td></tr><tr><td>Vous rappeler après une demande sur le site</td><td>Mesures précontractuelles à votre demande</td></tr><tr><td>Gérer les licences, la facturation et la comptabilité de Kete</td><td>Obligation légale et exécution du contrat</td></tr><tr><td>Mesurer l’audience du site public, sans cookie</td><td>Intérêt légitime : améliorer le site</td></tr><tr><td>Sécuriser le service, détecter les abus, corriger les erreurs</td><td>Intérêt légitime : protéger le service et ses utilisateurs</td></tr><tr><td>Vous informer d’un changement important du service ou de ces règles</td><td>Exécution du contrat</td></tr></tbody></table></div>\n<p>Nous ne faisons ni publicité, ni revente, ni profilage. Nous n’utilisons pas les données de vos chantiers pour entraîner des modèles d’intelligence artificielle.</p>"
      },
      {
        "id": "ia",
        "title": "Intelligence artificielle",
        "html": "<p>Certaines fonctions s’appuient sur un modèle d’intelligence artificielle : la rédaction des rapports client, la transcription des notes vocales, l’assistant intégré. Elles ne fonctionnent que si la formule de l’entreprise les inclut et qu’elle les utilise.</p>\n<ul>\n  <li>Seules les informations nécessaires à la demande sont envoyées au fournisseur du modèle (OpenAI), par l’interface professionnelle de celui-ci, qui n’utilise pas ces données pour entraîner ses modèles.</li>\n  <li>Une personne valide toujours ce que l’assistant propose avant qu’il ne parte à un client ou ne change une donnée.</li>\n  <li>Si l’entreprise connecte son propre assistant (Claude, ChatGPT ou autre) par MCP, les données consultées passent par le compte de l’entreprise chez ce fournisseur, sous sa responsabilité. L’entreprise peut révoquer cette connexion à tout moment.</li>\n</ul>"
      },
      {
        "id": "conservation",
        "title": "Combien de temps nous les gardons",
        "html": "<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Donnée</th><th scope=\"col\">Durée</th></tr></thead><tbody><tr><td>Données d’une entreprise cliente</td><td>Tant que l’entreprise utilise Struo. Elles sont supprimées à sa demande, après qu’elle a pu les exporter.</td></tr><tr><td>Historique de restauration de la base</td><td>Effacé automatiquement par rotation.</td></tr><tr><td>Demande de rappel sans suite</td><td>3 ans après le dernier échange.</td></tr><tr><td>Factures et preuves d’achat de licence</td><td>La durée imposée par la loi comptable applicable.</td></tr><tr><td>Mesure d’audience</td><td>Données agrégées, sans identifiant personnel.</td></tr><tr><td>Sur le téléphone, en mode hors ligne</td><td>Jusqu’à l’envoi au serveur, puis supprimées du téléphone.</td></tr></tbody></table></div>\n<p>Une entreprise peut supprimer à tout moment un chantier, un document ou un client. Pour supprimer tout son espace, elle écrit à <a href=\"mailto:contact@kete.digital\">contact@kete.digital</a>.</p>"
      },
      {
        "id": "destinataires",
        "title": "Qui y a accès",
        "html": "<ul>\n  <li><strong>Dans l’entreprise :</strong> chaque personne voit seulement ce que son rôle permet. Un client final voit son chantier, jamais les coûts ni les marges de l’entreprise.</li>\n  <li><strong>Chez Kete :</strong> seules les personnes chargées du support et de l’exploitation, lorsque c’est nécessaire pour répondre à votre demande ou corriger une panne. Elles sont tenues à la confidentialité.</li>\n  <li><strong>Nos sous-traitants techniques,</strong> pour héberger, envoyer des e-mails ou faire fonctionner les fonctions d’IA. Voir <a href=\"/traitement-donnees#sous-traitants\">la liste de nos sous-traitants</a>.</li>\n  <li><strong>Les autorités,</strong> uniquement sur demande légale et dans la limite de ce qu’elle exige.</li>\n</ul>"
      },
      {
        "id": "transferts",
        "title": "Transferts hors de l’Union européenne",
        "html": "<p>La base de données et les fichiers sont stockés dans l’Union européenne. Deux sous-traitants traitent des données aux États-Unis : l’envoi des e-mails (Resend) et les fonctions d’intelligence artificielle (OpenAI). Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne ou par le cadre de protection des données UE–États-Unis lorsque le prestataire y adhère.</p>"
      },
      {
        "id": "securite",
        "title": "Comment nous les protégeons",
        "html": "<ul>\n  <li>Chaque entreprise est isolée des autres directement dans la base de données : une requête ne peut lire que les données de l’entreprise de la personne connectée.</li>\n  <li>Toutes les connexions sont chiffrées (HTTPS). La base de données et les fichiers sont chiffrés sur les disques de Neon. Les fichiers ne sont accessibles que par des liens temporaires.</li>\n  <li>Mots de passe et clés d’accès stockés sous forme d’empreinte irréversible.</li>\n  <li>Droits par rôle, journal des actions sensibles, liens d’espace client révocables.</li>\n  <li>Toute action d’un assistant qui engage l’entreprise demande une confirmation humaine.</li>\n</ul>"
      },
      {
        "id": "droits",
        "title": "Vos droits",
        "html": "<p>Vous pouvez demander à tout moment :</p>\n<ul>\n  <li><strong>l’accès</strong> à vos données et une copie ;</li>\n  <li><strong>la rectification</strong> d’une donnée inexacte ;</li>\n  <li><strong>l’effacement</strong> de vos données ;</li>\n  <li><strong>la limitation</strong> d’un traitement, ou vous y <strong>opposer</strong> ;</li>\n  <li><strong>la portabilité</strong> : recevoir vos données dans un format lisible par une machine ;</li>\n  <li><strong>le retrait de votre consentement</strong> lorsqu’un traitement en dépend, par exemple les e-mails ou notifications de l’espace client.</li>\n</ul>\n<p>Écrivez à <a href=\"mailto:contact@kete.digital\">contact@kete.digital</a>. Nous répondons sous un mois au plus. Nous pouvons vous demander de prouver votre identité si un doute existe. Pour les données d’un chantier, nous transmettons votre demande à l’entreprise concernée, qui en décide.</p>\n<p>Si vous estimez que vos droits ne sont pas respectés, vous pouvez saisir l’autorité de protection des données de votre pays (en France, la CNIL).</p>"
      },
      {
        "id": "mineurs",
        "title": "Mineurs",
        "html": "<p>Struo est un outil professionnel. Il n’est pas destiné aux personnes de moins de 16 ans.</p>"
      },
      {
        "id": "changements",
        "title": "Changements de cette politique",
        "html": "<p>Si nous modifions cette politique de façon importante, nous prévenons les entreprises clientes par e-mail au moins 30 jours avant. La date de dernière mise à jour figure en haut de la page.</p>"
      }
    ]
  },
  "cookies": {
    "slug": "cookies",
    "title": "Cookies et stockage local",
    "lead": "Struo n’utilise aucun cookie publicitaire ni de suivi. Les seuls cookies servent à faire fonctionner le service : c’est pourquoi aucun bandeau ne vous demande votre accord.",
    "summary": [],
    "sections": [
      {
        "id": "principe",
        "title": "Le principe",
        "html": "<p>Un cookie est un petit fichier que le site dépose dans votre navigateur. La loi impose de demander votre accord avant de déposer un cookie, sauf s’il est strictement nécessaire au service que vous demandez. Struo n’utilise que des cookies de ce type.</p>\n<p>La mesure d’audience du site public (Umami) fonctionne sans cookie et sans identifiant : elle compte des visites, elle ne suit pas une personne.</p>"
      },
      {
        "id": "liste",
        "title": "Les cookies utilisés",
        "html": "<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Nom</th><th scope=\"col\">À quoi il sert</th><th scope=\"col\">Durée</th></tr></thead><tbody><tr><td><code>struo.session_token</code> et cookies de session associés</td><td>Vous garder connecté à votre compte de façon sécurisée.</td><td>La durée de la session, au plus 7 jours sans activité</td></tr><tr><td><code>struo_org</code></td><td>Retenir l’entreprise ouverte si vous en avez plusieurs.</td><td>1 an</td></tr><tr><td><code>struo_lang</code></td><td>Retenir votre langue (français ou anglais).</td><td>1 an</td></tr><tr><td><code>struo_country</code></td><td>Afficher les prix dans la devise de votre pays, sans conversion.</td><td>1 an</td></tr><tr><td><code>struo_siwc</code></td><td>Terminer la connexion à un assistant externe ou le choix d’une formule pendant l’inscription.</td><td>Quelques minutes</td></tr></tbody></table></div>"
      },
      {
        "id": "local",
        "title": "Stockage sur le téléphone",
        "html": "<p>L’application terrain fonctionne sans réseau. Pour cela, elle garde sur le téléphone les rapports, photos et notes en attente d’envoi, ainsi que les informations utiles des chantiers. Ces données partent vers le serveur dès que le réseau revient, puis sont supprimées du téléphone. Elles ne sont jamais lues par un autre site.</p>\n<p>Si vous installez Struo ou l’espace client sur l’écran d’accueil, le navigateur garde aussi une copie des fichiers de l’application pour l’ouvrir plus vite.</p>"
      },
      {
        "id": "notifications",
        "title": "Notifications",
        "html": "<p>Si vous activez les notifications, votre navigateur nous donne une adresse d’envoi propre à cet appareil. Vous pouvez les désactiver à tout moment depuis Struo ou depuis les réglages du navigateur ; l’adresse est alors supprimée.</p>"
      },
      {
        "id": "gerer",
        "title": "Gérer ou supprimer",
        "html": "<p>Vous pouvez effacer les cookies et les données du site depuis les réglages de votre navigateur. Vous serez alors déconnecté, et les rapports encore en attente sur le téléphone seront perdus : envoyez-les avant.</p>"
      }
    ]
  },
  "terms": {
    "slug": "conditions",
    "title": "Conditions générales d’utilisation et de vente",
    "lead": "Les règles entre Kete, qui édite Struo, et les entreprises qui l’utilisent. Elles s’appliquent dès la création d’un espace, y compris pendant l’essai.",
    "summary": [],
    "sections": [
      {
        "id": "definitions",
        "title": "Définitions",
        "html": "<ul>\n  <li><strong>Kete :</strong> l’activité indépendante qui édite et exploite Struo (voir les <a href=\"/mentions-legales\">mentions légales</a>).</li>\n  <li><strong>Struo :</strong> le logiciel en ligne de gestion d’entreprise de construction, avec son application terrain, son espace client et ses connexions.</li>\n  <li><strong>Client :</strong> l’entreprise qui crée un espace Struo et accepte ces conditions.</li>\n  <li><strong>Utilisateur :</strong> une personne invitée par le Client dans son espace (gérant, ingénieur, chef de chantier, comptable).</li>\n  <li><strong>Client final :</strong> le client du Client, qui suit son chantier dans l’espace client.</li>\n  <li><strong>Licence :</strong> le droit d’utiliser une formule de Struo pour une durée achetée d’avance.</li>\n</ul>"
      },
      {
        "id": "acces",
        "title": "Accès au service",
        "html": "<p>Struo est réservé aux professionnels. La personne qui crée l’espace déclare avoir le pouvoir d’engager l’entreprise.</p>\n<p><strong>Essai :</strong> 14 jours gratuits, avec toutes les fonctions, sans carte bancaire. Les règles de fin sont les mêmes que pour une licence (voir plus bas).</p>\n<p><strong>Démonstration :</strong> la démo sans compte ouvre une entreprise fictive pendant 24 heures, puis elle est effacée. N’y saisissez pas de données réelles.</p>"
      },
      {
        "id": "formules",
        "title": "Formules et prix",
        "html": "<p>Les formules (Starter, Pro, Entreprise) et leurs limites sont décrites sur la page des prix. Les prix sont affichés dans la devise du pays choisi, hors taxes, et ne sont jamais convertis. La formule Entreprise et les pays sans prix publié font l’objet d’un devis.</p>\n<p>La licence se paie d’avance, pour le nombre de mois choisi, sur la boutique de notre prestataire de paiement. Elle prolonge l’accès de cette durée. <strong>Il n’y a pas de reconduction automatique :</strong> pour continuer, le Client achète une nouvelle licence.</p>\n<p><strong>Avant et après la fin :</strong> les gérants et administrateurs sont prévenus par e-mail et par un bandeau dans Struo avant la fin de l’essai ou de la licence. Après la fin, tout reste ouvert pendant une période de grâce, dont la durée est indiquée dans ces messages. Ensuite, l’espace passe en lecture seule : les données restent consultables et exportables, mais plus rien ne peut être enregistré tant qu’une licence n’est pas saisie.</p>\n<p>Nous pouvons changer nos prix. Un changement ne s’applique jamais à une période déjà payée, et nous l’annonçons au moins 30 jours avant.</p>"
      },
      {
        "id": "mise-en-ordre",
        "title": "La mise en ordre en 30 jours",
        "html": "<p>La formule Pro comprend un accompagnement de démarrage :</p>\n<ul>\n  <li>la reprise des chantiers, clients et phases depuis le tableur du Client ;</li>\n  <li>le réglage des rôles, rapports, documents obligatoires, TVA, retenue de garantie et relances ;</li>\n  <li>la formation des chefs de chantier, à distance ou sur place selon ce qui est convenu ;</li>\n  <li>la mise en place de l’espace client ;</li>\n  <li>un point par semaine pendant les 30 premiers jours.</li>\n</ul>\n<p>Ce délai suppose que le Client fournisse ses données et se rende disponible pour les points prévus. Kete s’engage à mettre en œuvre tous les moyens nécessaires pour tenir ce calendrier. Les résultats obtenus dépendent de l’usage qu’en fait l’entreprise : ils ne sont pas garantis.</p>"
      },
      {
        "id": "engagements-client",
        "title": "Engagements du Client",
        "html": "<ul>\n  <li>Garder ses identifiants secrets et inviter uniquement les personnes qui en ont besoin, avec le bon rôle.</li>\n  <li>N’enregistrer que des données qu’il a le droit de traiter, et informer les personnes concernées (équipe, clients finaux, sous-traitants), notamment de la prise de photos datées et situées sur les chantiers.</li>\n  <li>Obtenir l’accord des personnes reconnaissables sur les photos lorsque la loi l’exige.</li>\n  <li>Ne pas utiliser Struo pour une activité illégale, ni tenter d’accéder aux données d’une autre entreprise, ni perturber le service.</li>\n  <li>Vérifier les montants, factures et documents avant de les envoyer : Struo calcule, le Client reste responsable de ce qu’il émet.</li>\n</ul>"
      },
      {
        "id": "engagements-kete",
        "title": "Engagements de Kete",
        "html": "<ul>\n  <li>Fournir Struo avec soin et le maintenir à jour.</li>\n  <li>Protéger les données du Client comme décrit dans la <a href=\"/confidentialite\">politique de confidentialité</a> et l’<a href=\"/traitement-donnees\">accord de traitement des données</a>.</li>\n  <li>Répondre au support par e-mail, à <a href=\"mailto:contact@kete.digital\">contact@kete.digital</a>.</li>\n</ul>\n<p>Kete est tenu à une obligation de moyens. Le service peut être interrompu pour une maintenance, une panne d’un prestataire ou un cas de force majeure. Le mode hors ligne de l’application terrain permet de continuer les rapports pendant une coupure.</p>"
      },
      {
        "id": "donnees",
        "title": "Données du Client",
        "html": "<p>Les données enregistrées dans Struo appartiennent au Client. Kete ne les utilise que pour fournir le service. Le Client peut les exporter en entier, à tout moment, en un clic.</p>\n<p>Pour ces données, Kete agit comme sous-traitant au sens du RGPD. L’<a href=\"/traitement-donnees\">accord de traitement des données</a> fait partie de ces conditions.</p>"
      },
      {
        "id": "ia",
        "title": "Assistant et intelligence artificielle",
        "html": "<p>Les textes, résumés et propositions produits par l’assistant sont des suggestions. Une personne de l’entreprise les relit et les valide avant tout envoi à un client ou toute modification. Kete n’est pas responsable des décisions prises à partir de ces suggestions.</p>"
      },
      {
        "id": "propriete",
        "title": "Propriété intellectuelle",
        "html": "<p>Struo reste la propriété de Kete. La licence donne au Client un droit d’utilisation, personnel et non transférable, pour la durée payée. Le Client ne peut ni copier, ni revendre, ni décompiler le logiciel.</p>"
      },
      {
        "id": "responsabilite",
        "title": "Responsabilité",
        "html": "<p>Kete répond des dommages directs causés par un manquement prouvé à ses obligations. Sa responsabilité totale est limitée aux sommes payées par le Client pendant les 12 mois précédant le fait en cause. Kete ne répond pas des dommages indirects, comme une perte de chiffre d’affaires ou de clientèle. Ces limites ne s’appliquent pas en cas de faute lourde ou intentionnelle, ni lorsque la loi l’interdit.</p>"
      },
      {
        "id": "fin",
        "title": "Fin du contrat",
        "html": "<ul>\n  <li><strong>Par le Client :</strong> à tout moment, sans frais. Il suffit de ne pas renouveler sa licence. La période déjà payée n’est pas remboursée, sauf si le service a été indisponible de façon durable par la faute de Kete.</li>\n  <li><strong>Par Kete :</strong> en cas de manquement grave du Client (impayé, usage illégal, atteinte à la sécurité), après une mise en demeure restée sans effet pendant 15 jours, ou immédiatement en cas de danger pour le service ou d’autres clients.</li>\n  <li><strong>Après la fin :</strong> l’espace passe en lecture seule après la période de grâce, et le Client peut toujours exporter ses données. À sa demande, Kete supprime l’espace et ses données, sauf ce que la loi oblige à conserver.</li>\n</ul>"
      },
      {
        "id": "modifications",
        "title": "Modification des conditions",
        "html": "<p>Kete peut faire évoluer ces conditions. Toute modification importante est annoncée par e-mail au moins 30 jours avant. Si le Client la refuse, il peut arrêter le service avant son entrée en vigueur ; la période payée restante lui est alors remboursée au prorata.</p>"
      },
      {
        "id": "droit",
        "title": "Droit applicable et litiges",
        "html": "<p>Ces conditions sont régies par le droit du pays où Kete exerce son activité, sous réserve des règles impératives du pays du Client. En cas de désaccord, les parties cherchent d’abord une solution amiable pendant 30 jours. À défaut, le litige est porté devant les tribunaux compétents du lieu d’activité de Kete.</p>"
      }
    ]
  },
  "dpa": {
    "slug": "traitement-donnees",
    "title": "Accord de traitement des données",
    "lead": "Le contrat qui encadre la façon dont Kete traite les données que votre entreprise enregistre dans Struo, conformément à l’article 28 du RGPD. Il fait partie des conditions générales et s’applique sans signature séparée.",
    "summary": [],
    "sections": [
      {
        "id": "parties",
        "title": "Parties et rôles",
        "html": "<p>L’entreprise cliente est <strong>responsable du traitement</strong> des données qu’elle enregistre dans Struo. Kete est son <strong>sous-traitant</strong> : il ne traite ces données que pour fournir Struo, selon les instructions du Client données par l’utilisation du service, ses réglages et ses demandes écrites.</p>\n<p>Si une instruction semble contraire à la loi, Kete en informe le Client sans attendre.</p>"
      },
      {
        "id": "objet",
        "title": "Description du traitement",
        "html": "<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\"></th><th scope=\"col\"></th></tr></thead><tbody><tr><td><strong>Objet</strong></td><td>Fournir le logiciel Struo : gestion des chantiers, rapports de terrain, finances, documents, planning, espace client, assistant et connexions.</td></tr><tr><td><strong>Durée</strong></td><td>La durée du contrat, puis jusqu’à la suppression demandée par le Client après son export.</td></tr><tr><td><strong>Opérations</strong></td><td>Collecte, enregistrement, stockage, consultation, mise en forme, transmission aux personnes choisies par le Client, transcription et rédaction assistée si activées, suppression.</td></tr><tr><td><strong>Personnes concernées</strong></td><td>Utilisateurs du Client, ouvriers et sous-traitants, clients finaux, contacts des fournisseurs.</td></tr><tr><td><strong>Données</strong></td><td>Identité et coordonnées, rôles, photos avec date, heure et position, notes écrites et vocales, signatures, présences, documents, montants, factures, messages, historique des actions.</td></tr><tr><td><strong>Données sensibles</strong></td><td>Aucune n’est demandée. Le Client s’engage à ne pas en enregistrer (santé, opinions, etc.) sauf si la loi le permet et qu’il a pris les mesures nécessaires.</td></tr></tbody></table></div>"
      },
      {
        "id": "obligations",
        "title": "Engagements de Kete",
        "html": "<ul>\n  <li><strong>Confidentialité :</strong> seules les personnes qui en ont besoin accèdent aux données, et elles sont tenues au secret.</li>\n  <li><strong>Sécurité :</strong> Kete applique les mesures décrites plus bas et les maintient à jour.</li>\n  <li><strong>Aide au Client :</strong> Kete l’aide à répondre aux demandes des personnes (accès, rectification, effacement, portabilité), à réaliser une analyse d’impact si nécessaire, et à répondre à une autorité de contrôle.</li>\n  <li><strong>Violation de données :</strong> Kete prévient le Client sans retard injustifié après en avoir eu connaissance, avec les informations disponibles : nature, données et personnes concernées, conséquences probables, mesures prises.</li>\n  <li><strong>Fin du contrat :</strong> le Client exporte ses données ; Kete les supprime à sa demande, sauf obligation légale de conservation. L’historique de restauration de la base s’efface ensuite par rotation automatique.</li>\n  <li><strong>Preuve :</strong> Kete fournit sur demande les informations nécessaires pour démontrer le respect de cet accord. Un audit peut être mené une fois par an, aux frais du Client, avec un préavis de 30 jours et un auditeur tenu au secret.</li>\n</ul>"
      },
      {
        "id": "sous-traitants",
        "title": "Sous-traitants ultérieurs",
        "html": "<p>Le Client autorise Kete à recourir aux prestataires suivants. Kete leur impose par contrat des obligations de protection équivalentes à celles de cet accord. Pour ajouter ou remplacer un prestataire, Kete prévient le Client par e-mail au moins 30 jours avant. Le Client peut s’y opposer pour un motif légitime ; si aucune solution n’est trouvée, il peut arrêter le service et être remboursé de la période non utilisée.</p>\n<div class=\"table-wrap\"><table><thead><tr><th scope=\"col\">Prestataire</th><th scope=\"col\">Rôle</th><th scope=\"col\">Quand</th></tr></thead><tbody><tr><td>Neon, Inc.</td><td>Base de données et stockage des fichiers, à Francfort (Union européenne)</td><td>Toujours</td></tr><tr><td>Contabo GmbH (Allemagne)</td><td>Serveur de l’application</td><td>Toujours</td></tr><tr><td>Resend</td><td>Envoi des e-mails (invitations, rapports, factures, relances), aux États-Unis</td><td>Toujours</td></tr><tr><td>Functional Software, Inc. (Sentry)</td><td>Rapports d’erreur techniques, sans contenu de chantier, hébergés dans l’Union européenne</td><td>Toujours</td></tr><tr><td>OpenAI</td><td>Transcription des notes vocales, rédaction assistée, assistant intégré, aux États-Unis</td><td>Si la formule l’inclut et que l’entreprise utilise ces fonctions</td></tr><tr><td>Chariow</td><td>Vente des licences et paiement</td><td>À l’achat d’une licence</td></tr></tbody></table></div>\n<p>La mesure d’audience Umami est installée sur le serveur de Kete et ne porte que sur le site public, sans cookie ni donnée personnelle : elle ne concerne pas les données du Client.</p>\n<p>Les assistants que le Client connecte lui-même par MCP (Claude, ChatGPT ou autre) ne sont pas des sous-traitants de Kete : le Client les choisit et en répond.</p>"
      },
      {
        "id": "transferts",
        "title": "Transferts hors de l’Union européenne",
        "html": "<p>Lorsque des données sont traitées hors de l’Union européenne par un prestataire listé ci-dessus, le transfert est encadré par les clauses contractuelles types de la Commission européenne, ou par le cadre de protection des données UE–États-Unis lorsque le prestataire y adhère.</p>"
      },
      {
        "id": "mesures",
        "title": "Mesures de sécurité",
        "html": "<ul>\n  <li><strong>Isolation :</strong> chaque entreprise est cloisonnée dans la base de données par des règles de sécurité au niveau des lignes ; une session ne peut lire que les données de son entreprise.</li>\n  <li><strong>Chiffrement :</strong> toutes les connexions passent en HTTPS ; la base de données et les fichiers sont chiffrés sur les disques de Neon.</li>\n  <li><strong>Accès :</strong> droits par rôle dans l’entreprise ; mots de passe et clés d’accès conservés sous forme d’empreinte ; connexions des assistants révocables ; liens d’espace client révocables.</li>\n  <li><strong>Fichiers :</strong> photos et documents servis uniquement par des liens temporaires, après vérification des droits.</li>\n  <li><strong>Traçabilité :</strong> journal des actions sensibles (validations, factures, droits, gestes des assistants).</li>\n  <li><strong>Confirmation humaine :</strong> toute action d’un assistant qui engage l’entreprise demande l’accord d’une personne.</li>\n  <li><strong>Hors ligne :</strong> les données en attente sur un téléphone sont supprimées dès leur envoi.</li>\n  <li><strong>Restauration :</strong> historique de restauration automatique de la base, effacé par rotation.</li>\n  <li><strong>Développement :</strong> revue du code, tests automatiques et recherche automatique de secrets avant chaque mise en ligne.</li>\n</ul>"
      }
    ]
  }
};
