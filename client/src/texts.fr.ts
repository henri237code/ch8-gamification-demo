/** Textes fixes de l’interface française.
 * Modifier ce fichier pour changer les libellés sans chercher dans les composants.
 * Les noms d’équipe, objectifs, citations et défis administrables viennent du serveur :
 * ils ne doivent pas être remplacés ici par des constantes.
 */
export const COMMON_TEXT = {
  // En-tête commun aux futurs écrans publics.
  brand: "CH8",
  brandSection: "PRODUCTION",
  tagline: "Le collectif en action",
  city: "Douala",
  teamOnShift: "Équipe en poste",
  shift: "Quart",
  noPlannedShift: "Aucun quart planifié",
  shiftNames: ["Matin", "Après-midi", "Nuit"],
  // Unités partagées : une seule définition pour tous les compteurs.
  units: {
    bottles: "bouteilles",
    bottlesShort: "btl",
    points: "pts",
    bottlesPerHour: "btl/h",
    minutes: "min",
  },
  // Connexion et affichage communs aux quatre écrans.
  connection: {
    live: "En direct",
    loading: "Synchronisation…",
    stale: "Données non actualisées",
    offline: "Connexion interrompue",
    initial: "Connexion au serveur local…",
    unavailable: "Serveur indisponible. Reconnexion automatique…",
    retained:
      "Dernier état reçu conservé. Les compteurs reprendront à la reconnexion.",
  },
  fullscreen: {
    enter: "Afficher en plein écran",
    exit: "Quitter le plein écran",
    title: "Plein écran",
    unavailable: "Le plein écran est indisponible dans cette fenêtre.",
  },
  // Bandeau distinct lorsque l’horloge appartient à un scénario temporaire.
  scenario: {
    temporary: "Scénario temporaire",
    paused: "En pause",
    clock: "Horloge simulée",
    speed: "vitesse",
  },
  demo: "DÉMONSTRATION · DONNÉES SIMULÉES",
} as const;

export const SCREEN1_TEXT = {
  // Écran 1 : titre général au-dessus des cinq zones.
  heading: {
    eyebrow: "ENSEMBLE, CHAQUE BOUTEILLE COMPTE.",
    first: "Notre quart.",
    second: "Notre objectif.",
  },
  // Zone 1A : production du quart et objectif modifiable depuis l’admin.
  production: {
    code: "1A",
    title: "Challenge du poste",
    objective: "Objectif de production",
    running: "Ligne en production",
    stopped: "Ligne à l’arrêt",
    achieved: "de l’objectif atteint",
    remaining: "bouteilles restantes",
    cadence: "cadence actuelle",
    good: "conformes",
    progressLabel: "Objectif de production",
  },
  // Zone 1B : points liés aux bouteilles et détail des bonus.
  score: {
    code: "1B",
    title: "Score d’équipe",
    provisional: "Points du quart · provisoires",
    production: "Production",
    overTarget: "Surperformance",
    perfectQuality: "Qualité parfaite",
    qualityPending: "Évaluée en fin de quart",
    totalBonus: "Bonus cumulés",
    challenges: "Défis",
  },
  // Zone 1C : compte à rebours, horaire de relève et alertes.
  timer: {
    code: "1C",
    title: "Temps du poste",
    remaining: "Temps restant avant la relève",
    handover: "Relève à",
    urgent: "Dernières minutes du quart",
    soon: "La relève approche",
    normal: "Un objectif commun, jusqu’à la dernière minute.",
  },
  // Zone 1D : avancement de démonstration, jamais présenté comme un TRS.
  level: {
    code: "1D",
    title: "Performance Index",
    label: "NIVEAU",
    progress: "Avancement du quart",
    labels: {
      A: "Dans le rythme",
      B: "Proche du rythme",
      C: "Rythme à renforcer",
      start: "Début de quart",
    },
    starting: "Le rythme s’établit pendant les 15 premières minutes.",
    reference: "Référence à cette heure :",
  },
  // Zone 1E : les titres, règles et badges du défi proviennent du catalogue SQLite.
  challenge: {
    code: "1E",
    title: "Mini-défi express",
    none: "Aucun défi actif",
    start: "Début",
    end: "Fin",
    at: "à",
    statuses: {
      active: "En cours",
      ready: "À venir",
      won: "Défi réussi",
      missed: "Défi terminé",
      awaiting_validation: "Validation requise",
      cancelled: "Annulé",
    },
    unknownStatus: "Statut indisponible",
    units: {
      periods: "périodes",
      anomaly: "anomalie validée",
      idea: "idée validée",
    },
    noStops: "Sans arrêt de ligne",
    quality: "Qualité",
    badgeAlt: "Badge du défi",
    proposedBonus: "Bonus proposé",
    reach: "Atteignez",
    within: "en",
    goodBottles: "bouteilles conformes",
    reward: "Badge à gagner",
    badgeEarned: "Badge obtenu",
    badgeMissed: "Badge non obtenu",
    badgePending: "Badge en attente de validation",
    advance: "Avancement",
    progressLabel: "Progression du mini-défi",
  },
  // Pied d’écran : invitation collective fixe, sans lien avec les chiffres simulés.
  footer: {
    lead: "Produisons",
    more: "plus",
    better: "mieux",
    together: "ensemble",
    closing: "Chaque bouteille compte",
  },
} as const;

/** Administration : connexion validée, libellés partagés ordinateur/téléphone. */
export const ADMIN_TEXT = {
  eyebrow: "ESPACE ADMINISTRATION",
  lead: "Préparer le quart.",
  accent: "Faire avancer le collectif.",
  intro:
    "Les équipes, les objectifs et les messages réunis dans votre espace de travail.",
  steps: ["Planifier", "Accompagner", "Valoriser"],
  motto: "Une équipe. Un objectif commun.",
  title: "Connexion administrateur",
  description:
    "Bienvenue. Connectez-vous pour préparer les quarts et accompagner vos équipes.",
  username: "Nom d’utilisateur",
  usernamePlaceholder: "Votre nom d’utilisateur",
  password: "Mot de passe",
  passwordPlaceholder: "Votre mot de passe",
  show: "Afficher le mot de passe",
  hide: "Masquer le mot de passe",
  submit: "Se connecter",
  loading: "Connexion…",
  reserved: "Accès réservé à l’administrateur.",
  retained: "Vos contenus restent conservés entre les démonstrations.",
  // Raccourcis communs à la connexion et aux futures pages de gestion admin.
  shortcuts: {
    title: "Voir les écrans",
    screens: [
      "Écran 1 · Production",
      "Écran 2 · Performance",
      "Écran 3 · Équipe et sécurité",
      "Écran 4 · Vie de CH8",
    ],
    pilot: "Pilotage · Connexion présentateur",
    pending: "À venir",
    hint: "Un onglet par écran : les liens CH8 réutilisent celui déjà ouvert.",
  },
  back: "Voir l’écran de production",
  network: "Le serveur est inaccessible. Réessayez.",
  invalid: "Identifiants incorrects.",
  forbidden: "Ce compte ne donne pas accès à l’administration.",
  rateLimit: "Trop de tentatives. Réessayez dans dix minutes.",
  connected: "Session administrateur ouverte",
  next: "La connexion fonctionne. Les pages de gestion sont en cours de construction.",
  sessionExpired: "Votre session a expiré. Reconnectez-vous.",
  logout: "Se déconnecter",
  checking: "Vérification de votre session…",
  logoutError: "Impossible de fermer la session. Réessayez.",
};

/** Tableau admin : navigation et première tranche (planning, objectif 1A). */
export const ADMIN_DASHBOARD_TEXT = {
  actionRequired:"Action requise",attentionReports:"signalement(s)",attentionStops:"arrêt(s) à reprendre",
  title: "Administration",
  today: "Aujourd’hui",
  planning: "Planning et objectifs",
  welcome: "Préparer le travail des équipes",
  intro: "Retrouvez le quart en cours et préparez les prochaines relèves.",
  normal: "Planning normal",
  doualaClock: "Heure de Douala",
  baseTitle: "Objectif de base · 1A",
  baseHint:
    "Appliqué aux prochains quarts planifiés, tant qu’aucun objectif particulier ne le remplace. Modifier cette valeur ne planifie pas de travail et ne change pas le quart en cours. Ce réglage reste en vigueur jusqu’à sa prochaine modification.",
  baseValue: "Bouteilles par quart",
  baseEffective: "À partir du",
  baseCurrent: "Base actuelle",
  baseFuture: "Base des prochains quarts",

  scenario: "Scénario temporaire affiché",
  contextWarning:
    "Un scénario temporaire est affiché sur les écrans. Le calendrier ci-dessous reste celui du mode normal.",
  connection: "Connexion",
  account: "Connecté en tant que",
  logout: "Se déconnecter",
  loading: "Chargement…",
  error: "Impossible de joindre le serveur.",
  expired: "Votre session a expiré. Reconnectez-vous.",
  team: "Équipe",
  target: "Objectif du quart",
  produced: "Bouteilles produites",
  waiting: "Défis à valider",
  contributionsWaiting: "Signalements à traiter",
  openStops: "Arrêts à reprendre",
  messageAction: "Publier un message · 3E",
  shortcuts: "Actions rapides",
  planAction: "Préparer les prochains quarts",
  targetAction: "Modifier l’objectif · 1A",
  modulesTitle: "Les rubriques de votre administration",
  pending: "Formulaires à construire",
  modules: [
    {
      id: "contents",
      title: "Messages et contenus",
      zones: "3E · 4B · 4C",
      detail: "Messages, citations, événements et résultats sportifs.",
    },
    {
      id: "people",
      title: "Équipes et employés",
      zones: "2C · 4B",
      detail: "Profils, anniversaires et photos facultatives.",
    },
    {
      id: "distinctions",
      title: "Défis et distinctions",
      zones: "1E · 2C · 3C",
      detail: "Mini-défis, opérateur du mois et badges.",
    },
    {
      id: "operations",
      title: "Signalements et arrêts",
      zones: "2D · 3A · 1E",
      detail: "Kaizen, anomalies, sécurité et reprises de machines.",
    },
    {
      id: "indicators",
      title: "Météo et énergie",
      zones: "3D · 4D",
      detail: "Moral et fatigue par équipe, mission mensuelle et énergie.",
    },
  ],
  planningIntro:
    "Choisissez une case future pour affecter une équipe ou annuler le travail prévu. Les quarts commencés sont protégés.",
  from: "À partir du",
  weeks: "Semaines affichées",
  refresh: "Afficher",
  noTeam: "Sans travail planifié",
  locked: "Quart commencé · lecture seule",
  shifts: ["Matin · 06 h–14 h", "Après-midi · 14 h–22 h", "Nuit · 22 h–06 h"],
  editTitle: "Affecter une équipe",
  save: "Enregistrer",
  saving: "Enregistrement…",
  cancel: "Fermer",
  remove: "Annuler ce quart",
  removeConfirm:
    "Confirmer : aucune équipe ni production ne sera prévue sur ce quart.",
  confirmRemove: "Confirmer l’annulation",
  saved: "Planning enregistré.",
  removed: "Quart annulé. Aucun travail ne sera généré sur cette période.",
  targetTitle: "Objectif de production · Section 1A",
  targetHint:
    "Cette modification concerne le quart normal en cours. La production déjà réalisée reste conservée.",
  targetUnavailable:
    "Un quart normal planifié doit être affiché pour modifier son objectif ici.",
  targetSaved: "Objectif enregistré · Section 1A.",
  targetLabel: "Objectif en bouteilles",
  zone: "Sections concernées",
  planningZones: "1A–1E · contexte partagé des quatre écrans",
  targetZones: "1A · objectif du quart et bonus de surperformance",
  view: "Voir l’écran 1 · 1A",
  close: "Retour à l’accueil",
  menu: "Menu",
  closeMenu: "Fermer le menu",
  open: "Ouvrir",
  programming: "Programmer un objectif ou un défi · 24 h",
  programPending:
    "La programmation des objectifs futurs viendra avec les formulaires de programmation sur 24 heures.",
};

/** Formulaires admin : libellés communs et correspondance avec les vingt zones. */
export const ADMIN_FORMS_TEXT = {
  save: "Enregistrer",
  saving: "Enregistrement…",
  saved: "Enregistré. Les écrans se mettent à jour.",
  error: "Le serveur est inaccessible. Réessayez.",
  new: "Ajouter",
  edit: "Modifier",
  close: "Fermer",
  empty: "Aucun élément enregistré.",
  all: "Tous / non renseigné",
  body: "Texte",
  title: "Titre",
  name: "Nom",
  team: "Équipe",
  person: "Employé",
  status: "Statut",
  reason: "Motif",
  note: "Commentaire",
  kind: "Type",
  from: "Début · heure de Douala",
  until: "Fin · heure de Douala",
  now: "Maintenant",
  month: "Mois",
  choose: "Choisir",
  duration: "Durée",
  bonus: "Bonus proposé",
  target: "Objectif",
  archive: "Archiver",
  archived: "Archivé",
  draft: "Brouillon",
  published: "Publié",
  contentTitle: "Messages et contenus",
  contentIntro:
    "Créez un contenu ou modifiez un élément existant. Les messages peuvent commencer dans les 24 prochaines heures. Les dates sont celles de Douala.",
  kinds: {
    message: "Message superviseur · 3E",
    quote: "Citation · 4C",
    event: "Événement · 4B",
    sports: "Résultat sportif · 4B",
  },
  icons: {
    message: "Message",
    calendar: "Calendrier",
    cake: "Anniversaire",
    trophy: "Trophée",
    football: "Football",
    star: "Étoile",
    megaphone: "Annonce",
    quote: "Citation",
  },
  icon: "Icône",
  author: "Auteur de la citation",
  shift: "Quart ciblé",
  quoteTitle: "Citation affichée · 4C",
  quoteMode: "Mode de sélection",
  manual: "Sélection manuelle",
  automatic: "Rotation à chaque quart",
  quote: "Citation",
  selectedBy: "Équipe ayant choisi la citation",
  quoteHint:
    "Les citations programmées restent prioritaires pendant leur plage. La sélection habituelle reprend ensuite.",
  profileTitle: "Équipes et employés · 4B / 2C",
  profileIntro:
    "Les anniversaires du mois sont détectés automatiquement. Aucune photo n’est obligatoire ; la silhouette est utilisée par défaut.",
  birthdayMonth: "Mois de naissance",
  birthdayDay: "Jour de naissance",
  enabled: "Profil actif",
  photo: "Photo locale · JPEG, PNG ou WebP · 5 Mo maximum",
  photoSave: "Enregistrer la photo",
  photoRemove: "Retirer la photo",
  photoHint: "Enregistrez d’abord le profil, puis ajoutez sa photo.",
  photoError: "Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.",
  rename: "Renommer une équipe",
  profiles: "Employés enregistrés",
  searchPeople: "Rechercher un employé par son nom",
  noPeople: "Aucun employé ne correspond à votre recherche.",
  peoplePage: "Page",
  previous: "Précédente",
  next: "Suivante",
  totalPeople: "employés",
  totalPerson: "employé",
  responsePlaceholder: "Exemple : equipe-matin ou reponse-01",
  emptyEvents: "Aucun événement enregistré",
  emptySports: "Aucun résultat sportif enregistré",

  programs: "Programmations · prochaines 24 heures",
  programHint:
    "Objectifs et mini-défis nécessitent un quart planifié. Le mini-défi garde sa durée de catalogue. Les programmes commencés conservent leur historique.",
  programTarget: "Objectif · 1A",
  programChallenge: "Mini-défi · 1E",
  preset: "Mini-défi",
  cancelProgram: "Annuler la programmation",
  cancelled: "Annulée",
  active: "En cours",
  finished: "Terminée",
  future: "À venir",
  challengeTitle: "Mini-défis et distinctions",
  challengeHint:
    "Les cinq modèles sont prédéfinis. Les bonus sont attribués à la clôture, une seule fois, dans le plafond de 100 points par quart.",
  launch: "Lancer dans le quart affiché · 1E",
  review: "Valider le résultat du défi",
  approved: "Décision",
  approve: "Approuver",
  refuse: "Refuser",
  individual: "Distinction individuelle · 2C / 3C",
  operator: "Opérateur du mois",
  badge: "Badge de sécurité",
  badgeCode: "Badge",
  teamBadge: "Badge pour une équipe · 3C",
  revoke: "Révoquer",
  revoked: "Révoquée",
  recognitions: "Distinctions enregistrées",
  templates: "Félicitations · 3E",
  template: "Modèle",
  templateHint:
    "Le marqueur {team} sera remplacé par le nom de l’équipe. Vous pouvez personnaliser le texte.",
  operations: "Signalements et arrêts",
  kaizenList: "Idées Kaizen",
  anomalyList: "Anomalies",
  safetyHistory: "Historique de sécurité",
  details: "Voir les détails",
  contributionReview: "Étudier cette contribution",
  // Parcours piloté « Interruption et anomalie » : traitement dans le panneau admin.
  guidedAnomalyReview:
    "Pour ce parcours : validez d’abord le signalement, puis choisissez « Résolue ». La résolution relance la ligne du scénario.",
  occurredAt: "Enregistré le",
  contributionIndependent:
    "Une idée d’amélioration de CH8 peut être enregistrée même sans quart planifié. Elle reste proposée jusqu’à sa validation explicite. Les compteurs distinguent les idées enregistrées ce mois et celles validées ce mois.",
  weatherProgramTitle: "Programmer la météo d’équipe · 3D",
  weatherProgramHint:
    "Choisissez un début dans les prochaines 24 heures, dans un quart déjà planifié. L’équipe est celle du planning. Cette appréciation du superviseur est affichée pendant sa plage ; les réponses du quart reprennent ensuite. La fin vide correspond à la fin du quart.",
  weatherPrograms: "Météos programmées",
  weatherForecast: "Appréciation du superviseur programmée",

  contributions: "Kaizen et anomalies · 2D / 1E",
  contributionHint:
    "Une idée proposée et une idée validée sont comptées séparément. Une résolution ne remplace pas la validation. Une déclaration seule ne rapporte aucun point.",
  description: "Description",
  contributionKinds: { kaizen: "Idée Kaizen", anomaly: "Anomalie" },
  transitions: {
    submitted: "Proposée",
    acknowledged: "Prise en compte",
    in_progress: "En traitement",
    validated: "Validée",
    resolved: "Résolue",
    rejected: "Refusée",
  },
  changeStatus: "Traitement",
  stops: "Historique des arrêts · mode normal",
  restart: "Relancer les machines",
  openStop: "En cours",
  closedStop: "Terminé",
  minutes: "min",
  safety: "Sécurité · 3A",
  accident: "Accident",
  nearMiss: "Presque-accident",
  safetyHint:
    "Un accident remet le compteur à zéro. Un presque-accident peut suspendre un bonus pour validation.",
  indicators: "Météo, énergie et mission mensuelle",
  monthly: "Objectif mensuel · 4A",
  energy: "Puissance cible fictive · 4D",
  value: "Valeur",
  weather: "Météo d’équipe · 3D",
  teamWeatherTitle: "Définir la météo d’une équipe · 3D",
  teamWeatherHint:
    "Choisissez l’équipe, puis son moral et sa fatigue. Ces valeurs restent valables jusqu’à votre prochaine modification et s’affichent chaque fois que cette équipe travaille, quel que soit son quart. Vous pouvez les définir même sans quart actif. Les scénarios conservent ces réglages.",
  teamWeatherList: "Météo enregistrée pour chaque équipe",
  weatherInitial: "Valeurs initiales de démonstration · modifiables",
  weatherUpdated: "Actualisée le",

  mood: "Moral · 1 à 5",
  fatigue: "Fatigue · 1 à 5",
  machine: "Machine concernée",
  submittedCount: "Idées enregistrées ce mois",
  validatedCount: "Idées validées ce mois",
  scope: "Contexte des commandes de quart",
  normal: "Normal",
  scenario: "Scénario temporaire",
  unplanned: "Aucun quart planifié",
  view: "Voir l’écran",
  zone: "Sections",
  refresh: "Actualiser",
  confirm: "Confirmer",
  cancel: "Annuler",
  confirmHint: "Vérifiez cette action avant de confirmer.",
};

/** Pilotage : connexion dédiée et conduite de la démo ; repères des écrans 1–4. */
export const PILOT_TEXT = {
 title:'Pilotage',eyebrow:'ESPACE PRÉSENTATEUR',lead:'Une démonstration.',accent:'Quatre situations à raconter.',intro:'Choisissez une équipe, guidez le scénario et retrouvez le planning normal à tout moment.',motto:'Montrer le quotidien de CH8, étape par étape.',
 loginTitle:'Connexion présentateur',loginDescription:'Connectez-vous pour conduire les scénarios de démonstration.',reserved:'Accès réservé au présentateur.',presenterOnly:'Utilisez le compte présentateur pour ouvrir cet espace.',checking:'Vérification de votre session…',account:'Connecté en tant que',logout:'Se déconnecter',expired:'Votre session présentateur a expiré. Reconnectez-vous ; la démo conserve son état.',
 heading:'La démo, à votre rythme.',subtitle:'Le planning normal et les contenus administrateur restent conservés.',normal:'Planning normal',temporary:'Scénario temporaire',realClock:'Heure réelle de Douala',simulatedClock:'Horloge du scénario',paused:'En pause',running:'En cours',speed:'Vitesse',bottles:'Bouteilles du quart',target:'Objectif',machine:'Soutireuse',machineStates:{running:'En production',stopped:'À l’arrêt',unplanned:'Sans production planifiée'},
 guides:'Parcours guidés',selectGuide:'Choisir ce parcours',selected:'Parcours sélectionné',team:'Équipe du scénario',chooseTeam:'Choisir une équipe',startMode:'Point de départ',adapted:'Moment adapté au parcours',adaptedPassage:'Heure actuelle · puis saut guidé',now:'Heure réelle actuelle',custom:'Date et heure au choix',customDate:'Départ · heure de Douala',nightVariant:'Variante nuit · ce soir à 23 h 59',start:'Lancer le parcours',startHint:'La simulation démarre et continue à avancer entre les étapes. Elle ne modifie pas le planning.',
 activeGuide:'Parcours en cours',step:'Étape',next:'Exécuter l’étape',complete:'Parcours terminé',completeHint:'Consultez le bilan, puis revenez au planning normal ou recommencez.',awaiting:'En attente de validation admin',waitingHint:'L’administrateur doit ouvrir le signalement dans son espace, puis le valider. Le présentateur ne peut pas le valider à sa place.',admin:'Ouvrir l’administration',restart:'Recommencer le parcours',restartHint:'Une nouvelle exécution reprend les choix de départ. Les contenus et le planning admin sont conservés.',normalReturn:'Revenir au planning normal',normalHint:'Le planning reprend à l’heure réelle de Douala, avec la production et les arrêts enregistrés. Si le quart a changé, la nouvelle équipe est affichée.',nextTeam:'Équipe entrante · relève simulée',automaticTeam:'Rotation du scénario',
 result:'Bilan de l’équipe sortante',resultHint:'Le score est définitif après la fin du quart. La réussite et les records dépendent des résultats calculés.',score:'Score du quart',good:'Bouteilles conformes',challenge:'Défis du quart',
 skipTitle:'Avancer instantanément',skipHint:'Ajoute la durée à l’horloge du scénario et calcule la production, les arrêts et les défis traversés. Le planning normal reste à l’heure réelle.',skip:'Passer',
 free:'Commandes de la simulation temporaire',freeHint:'Ces commandes agissent sur le scénario uniquement. Avancer librement peut dépasser une étape du parcours ; il faudra alors le recommencer.',pause:'Mettre en pause',resume:'Reprendre',applySpeed:'Appliquer la vitesse',nextShift:'Passer au quart suivant · +10 min',simStop:'Déclencher un arrêt temporaire',simRestart:'Reprendre les arrêts déclenchés',simStopHint:'La reprise ferme les arrêts de ligne temporaires du scénario. Les arrêts du planning normal restent gérés par l’administrateur.',onlyScenario:'Lancez un scénario pour utiliser ces commandes. Le temps du planning normal reste à vitesse réelle.',
 normalStop:'Arrêt persistant du planning',normalStopHint:'Simuler un arrêt naturel sur le quart planifié. Il reste enregistré, même après un scénario ou un redémarrage. Seul l’administrateur peut relancer les machines.',normalStopUnavailable:'Un quart normal planifié doit être affiché pour déclencher cet arrêt.',machineChoice:'Machine concernée',affectsLine:'Cet arrêt suspend la production de la ligne',reason:'Motif de l’arrêt',stopButton:'Déclencher l’arrêt du planning',stopConfirmation:'Cet arrêt sera conservé dans le planning normal jusqu’à la reprise par l’administrateur.',confirm:'Confirmer',cancel:'Annuler',pending:'Commande en cours…',done:'Commande appliquée. Les écrans se synchronisent.',error:'Impossible d’appliquer la commande.',offline:'Connexion interrompue : les commandes sont désactivées jusqu’à la reconnexion.',openStops:'Arrêts manuels du planning encore ouverts',noStops:'Aucun arrêt manuel ouvert dans le planning normal.',normalStopOngoing:'La reprise se fait depuis l’administration, rubrique Signalements et arrêts.',stopsError:'Le suivi des arrêts est indisponible. Réessayez.',refresh:'Actualiser',minutes:'min',choose:'Choisir',launchConfirm:'Un scénario est déjà actif. Lancer ce parcours remplacera sa simulation temporaire.',
};

/** Écrans publics 2–4 : titres par zone ; contenus administrables fournis par le serveur. */
export const PUBLIC_TEXT = {
  headings: {
    2: { section: 'PERFORMANCE', eyebrow: 'LES RÉSULTATS SE CONSTRUISENT ENSEMBLE.', first: 'Nos équipes.', second: 'Nos réussites.' },
    3: { section: 'ÉQUIPE & SÉCURITÉ', eyebrow: 'PRENDRE SOIN DU COLLECTIF, CHAQUE JOUR.', first: 'Bien travailler.', second: 'Ensemble.' },
    4: { section: 'VIE DE CH8', eyebrow: 'UNE CHAÎNE. DES PERSONNES. UNE AMBITION.', first: 'La vie de CH8.', second: 'Notre collectif.' },
  },
  // Zone 2A : moyenne des scores finaux comparables, jamais les points d’un quart en cours.
  podium: { title: 'Podium des équipes', week: 'Cette semaine', rule: 'Moyenne des scores finaux · quarts de même objectif', shifts: 'quarts terminés', shift: 'quart terminé', none: 'Aucun quart comparable terminé', pending: 'En attente de résultat', noResult: 'Aucun quart comparable terminé cette semaine', target: 'Objectif de comparaison' },
  // Zone 2B : meilleur score enregistré, équipe et date du quart.
  record: { title: 'Record d’équipe', label: 'Meilleur score de quart enregistré', none: 'Le premier record reste à écrire', footer: 'Objectif à battre !', team: 'Équipe' },
  // Zone 2C : désignation volontaire de l’admin, portrait réel ou silhouette.
  operator: { title: 'Opérateur du mois', none: 'Aucune distinction attribuée ce mois', congratulations: 'Un engagement qui fait la différence' },
  // Zone 2D : deux compteurs mensuels indépendants ; fonctionnement sans quart.
  kaizen: { title: 'Nos idées Kaizen', submitted: 'idées enregistrées', validated: 'idées validées', submittedOne: 'idée enregistrée', validatedOne: 'idée validée', period: 'Ce mois-ci', footer: 'Chaque idée peut faire avancer CH8.' },
  // Zone 2E : résultats enregistrés sur sept jours, trous conservés si aucun quart terminé.
  trends: { title: 'Notre tendance · 7 jours', label: 'Score moyen par jour · quarts terminés', none: 'La tendance apparaîtra avec les premiers résultats', gaps: 'Une interruption du tracé indique une journée sans résultat.', chart: 'Évolution des scores des équipes sur sept jours' },
  // Zones 3A/3B : compteur sécurité indépendant ; qualité liée au quart actif.
  safety: { title: 'La sécurité, chaque jour', days: 'jours sans accident', none: 'Référence sécurité non renseignée', footer: 'Vigilance et entraide, à chaque poste.', milestone: 'Palier atteint' },
  quality: { title: 'La qualité de notre production', label: 'Bouteilles conformes', target: 'Objectif qualité', threshold: 'Seuil d’alerte de démonstration : 98 %', none: 'Aucune production à évaluer', alert: 'Qualité à surveiller', good: 'Qualité maîtrisée', rejected: 'rejets', compliant: 'conformes' },
  // Zone 3C : distinction mensuelle attribuée par l’admin, indépendante du score industriel.
  badge: { title: 'Le badge sécurité du mois', none: 'Aucun badge attribué ce mois', team: 'Équipe distinguée', person: 'Une attention reconnue' },
  // Zone 3D : appréciation persistante de l’équipe en poste.
  weather: { title: 'La météo de notre équipe', mood: 'Moral', fatigue: 'Fatigue', note: 'Appréciation du superviseur', labels: { sun: 'Excellent moral', 'partly-cloudy': 'Moral positif', cloud: 'Moral mitigé', rain: 'Moral à accompagner' } },
  // Zone 3E : message ciblé, dates et contenu administrés.
  message: { title: 'Le mot du superviseur', none: 'Aucun message du superviseur pour le moment', signature: 'Pour notre équipe' },
  // Zone 4A : volumes mensuels partagés, sans contribution individuelle inventée.
  mission: { title: 'Notre mission du mois', achieved: 'de l’objectif collectif', remaining: 'bouteilles pour atteindre la cible', team: 'Contribution des équipes', chart: 'Progression de la mission mensuelle' },
  // Zone 4B : anniversaires masqués s’ils sont absents ; événements et sport ont un état vide.
  life: { title: 'Mural des anniversaires & événements', birthdays: 'Anniversaires du mois', events: 'Événements', sports: 'Résultats sportifs', noEvents: 'Aucun événement enregistré', noSports: 'Aucun événement sportif enregistré', birthday: 'Joyeux anniversaire' },
  // Zone 4C : texte et attribution de la citation choisie ou automatique.
  quote: { title: 'Une pensée pour le collectif', none: 'Aucune citation disponible', selected: 'Sélectionnée par', automatic: 'Rotation des citations', manual: 'Sélection du superviseur' },
  // Zone 4D : courbes superposées, unités explicites dans la légende.
  resources: {title:'Consommations · CO₂, eau & air',month:'Total du mois',curve:'6 dernières heures · volumes horaires et totaux du mois',chart:'Consommations horaires superposées · unités précisées dans la légende',lastHour:'Heure en cours',note:'Simulation · unités de la légende · heure courante partielle',names:{co2:'CO₂',water:'Eau · H₂O',air:'Air'}},
  // Zone 4E : records physiques et rendement provisoire, distinct du TRS métier.
  hall: { title: 'Les records de notre chaîne', cadence: 'Meilleure cadence observée', continuous: 'Plus longue production sans arrêt', efficiency: 'Record mensuel de rendement simulé', noHistory: 'Historique encore insuffisant', noMonth: 'Aucun mois complet comparable', note: 'Mesures simulées · Meilleur TRP mensuel', hours: 'h', minutes: 'min' },
  footer: 'Chaque contribution compte.', month: 'Mois', notAvailable: 'Non renseigné', noMeasurements: 'Aucune mesure enregistrée', pages: 'Page', portrait: 'Portrait de', mosaic: 'Les quatre écrans', back: 'Ouvrir cet écran',
} as const;

/** Rapport historique admin, et indicateur provisoire 1D. */
export const REPORT_TEXT={open:'Voir le rapport',title:'Rapport de fin de quart',close:'Fermer',loading:'Chargement du rapport…',error:'Rapport indisponible.',simulation:'Données simulées · rapport calculé à partir des événements enregistrés',production:'Production',volume:'Volume',target:'Objectif',score:'Score final',stops:'Arrêts majeurs enregistrés',downtime:'Temps d’arrêt de ligne (sans double comptage)',anomalies:'Anomalies',none:'Aucun élément enregistré',hourly:'Production par heure',time:'Plage',bottles:'Bouteilles',yield:'Rendement estimé',provisional:'Estimation provisoire, formule TRP et seuils vert/bleu à confirmer',legacy:'Ancien modèle de simulation · barème historique conservé',mechanics:'Mécaniciens : non renseignés',scoreKinds:{production_final:'Production',over_target_bonus:'Surperformance',quality_bonus:'Qualité parfaite',challenge_bonus:'Mini-défis réussis'}};
export const PERFORMANCE_TEXT={title:'Performance Index',label:'ESTIMATION',nominal:'Cadence nominale',formula:'Production / capacité théorique écoulée',pending:'Début de quart',provisional:'Provisoire · seuils vert/bleu à confirmer',progressKey:'Couleur · objectif atteint',scoreRate:'Production · 1 pt / 100 btl',colors:{red:'Sous 60 %',yellow:'À partir de 60 %',green:'À partir de 75 %*',blue:'À partir de 90 %*',unknown:'Début de quart'}};

// Volumes calculés selon la contenance des produits dans les ordres de fabrication.
export const VOLUME_TEXT={label:'Volume',unit:'hL',target:'Objectif',mixed:'Objectif en bouteilles · formats multiples',equivalent:'Équivalent volume'};
