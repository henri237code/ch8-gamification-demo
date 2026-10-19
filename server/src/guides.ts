export const GUIDES=[
 {id:1,title:'Objectif et record d’équipe',summary:'Observer l’objectif, terminer le quart puis consulter les résultats calculés.',offsetMinutes:360,
  steps:[{action:'observe',title:'Présenter l’objectif et les bonus',instruction:'Montrer la progression, le défi et le record comparable. Le manager peut appliquer un objectif.'},
   {action:'advance-twenty',title:'Avancer de vingt minutes et observer',instruction:'Un clic avance immédiatement de vingt minutes. Suivre le mini-défi applicable et ses conditions ; les paramètres du manager restent prioritaires.'},
   {action:'finish-shift',title:'Terminer le quart simulé',instruction:'Avancer jusqu’à la relève ; les compteurs déterminent la réussite et les bonus.'},
   {action:'results',title:'Consulter le bilan',instruction:'Lire le résultat du quart terminé et les records. Aucun record n’est garanti artificiellement.'}]},
 {id:2,title:'Interruption et anomalie',summary:'Arrêt, signalement, validation par le manager et reprise de la production.',offsetMinutes:60,
  steps:[{action:'stop',title:'Déclencher un arrêt de ligne',instruction:'La soutireuse s’arrête et les bouteilles cessent de progresser.'},
   {action:'anomaly',title:'Signaler l’anomalie',instruction:'Un clic avance immédiatement de deux minutes puis crée un signalement lié à cette exécution.'},
   {action:'validation',title:'Faire valider et résoudre par le manager',instruction:'Dans l’espace admin : prendre en compte, valider puis résoudre le signalement. La résolution relance la ligne du scénario.'},
   {action:'restart',title:'Vérifier la relance',instruction:'Confirmer que la ligne est revenue en production. Cette commande de reprise reste disponible si un autre arrêt temporaire est ouvert.'},
   {action:'advance-five',title:'Observer la reprise',instruction:'Un clic avance immédiatement de cinq minutes ; observer le retour de production.'}]},
 {id:3,title:'Progression collective',summary:'Faire remonter une idée Kaizen et montrer sa reconnaissance et les cumuls.',offsetMinutes:180,
  steps:[{action:'kaizen',title:'Proposer une idée Kaizen',instruction:'Créer une idée fictive liée à l’équipe active.'},
   {action:'validation',title:'Faire valider l’idée',instruction:'Le manager prend en compte et valide l’idée ; il peut publier son propre encouragement.'},
   {action:'advance-twenty',title:'Observer les contributions collectives',instruction:'Avancer de vingt minutes et consulter les tendances, la mission mensuelle et la reconnaissance.'}]},
 {id:5,title:'Passage de quart',summary:'Voir la dernière minute du quart puis la relève de l’équipe suivante.',offsetMinutes:478,
  steps:[{action:'approach-boundary',title:'Présenter la fin du quart',instruction:'Avancer d’un clic jusqu’à une minute avant la relève et observer les compteurs de l’équipe sortante.'},
   {action:'boundary',title:'Passer à l’heure de relève',instruction:'Avancer jusqu’à l’heure de relève : clôturer le quart et ouvrir le suivant à zéro, sans modifier le planning normal.'},
   {action:'next-ten',title:'Avancer de dix minutes',instruction:'Un clic avance immédiatement de dix minutes. Le nouveau quart a ses propres bouteilles ; les cumuls conservent les deux périodes.'},
   {action:'results',title:'Contrôler la continuité',instruction:'Consulter le résultat de l’équipe sortante et les compteurs de la nouvelle équipe.'}]}
] as const;

// Lecture seule des anciennes exécutions : aucune nouvelle session ne peut utiliser ce parcours.
// Sa ligne SQLite reste nécessaire aux clés étrangères des historiques enregistrés.
export const LEGACY_GUIDE_4={id:4,title:'Dépasser le quart précédent',summary:'Ancien parcours conservé dans l’historique.',offsetMinutes:440,
 steps:[{action:'reference',title:'Présenter la référence à battre',instruction:'Ancienne étape de présentation.'},
  {action:'finish-shift',title:'Terminer la tentative',instruction:'Ancienne étape de présentation.'},
  {action:'results',title:'Afficher le bilan du défi',instruction:'Ancienne étape de présentation.'}]} as const;
export const guideForSession=(id:number)=>GUIDES.find(g=>g.id===id)??(id===4?LEGACY_GUIDE_4:undefined);
