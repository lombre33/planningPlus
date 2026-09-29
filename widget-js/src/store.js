/**
 * Magasin en mémoire : tient le `Modele` décodé et notifie ses abonnés à
 * chaque mutation, comme le ferait un `grist.onRecords` côté widget réel.
 * Rien ici ne suppose une origine « démo » ou « Grist réel » — seule
 * `donnees/normaliser.js` (ou son futur équivalent branché sur
 * `window.grist.docApi`) sait d'où vient le `Modele` initial.
 */

import {sousCreneauxApplicables} from './logic/derive.js';
import {cleJourFestival, libelleHeurePlage, PAS_SECONDES} from './temps.js';

/** Levée par `EcritureGrist.remplacerSousCreneaux` quand la création des
 *  nouveaux sous-créneaux a réussi mais que la suppression des anciens a
 *  échoué ensuite : les deux jeux existent alors réellement dans le
 *  document. `idsReelsCrees` porte les ids réels des nouveaux (dans l'ordre
 *  demandé) pour que `Magasin.redecouperSousCreneaux` les ajoute localement
 *  sans retirer les anciens, plutôt que de laisser croire — comme un rejet
 *  ordinaire le ferait — que rien n'a changé dans le document. */
export class SuppressionApresCreationEchouee extends Error {
  idsReelsCrees;
  constructor(idsReelsCrees) {
    super('La suppression des anciens sous-créneaux a échoué après la création des nouveaux.');
    this.idsReelsCrees = idsReelsCrees;
    this.name = 'SuppressionApresCreationEchouee';
  }
}

function prochainId(lignes) {
  return lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;
}

/** Prochain code de binôme dans la nomenclature simplifiée voulue par
 *  Antoine (2026-09-22) : A1 à Z1, puis A2 à Z2, et ainsi de suite — une
 *  seule séquence pour tout le document, plus un préfixe par équipe.
 *  Ignore les codes déjà pris (y compris un ancien format hérité) pour ne
 *  jamais réattribuer un code existant, qu'il vienne d'une suppression ou
 *  d'une reprise sur un document déjà peuplé. */
function prochainCodeGroupe(codesExistants) {
  const pris = new Set(codesExistants);
  for (let numero = 1; ; numero++) {
    for (let lettre = 0; lettre < 26; lettre++) {
      const code = `${String.fromCharCode(65 + lettre)}${numero}`;
      if (!pris.has(code)) { return code; }
    }
  }
}

export class Magasin {
  data;
  listeners = new Set();
  ecriture = null;
  parametres;

  /** `parametresInitiales` vient de `Parametres` (`Cle`/`Valeur`), lue à part
   *  de `Modele` par `lireDocument` (`grist/lecture.js`) — cette table ne
   *  nourrit pas `Modele`, voir `main.js`. Vide en mode démo ou tant que le
   *  document n'a encore aucune ligne. */
  constructor(seed, parametresInitiales = []) {
    this.data = seed;
    this.parametres = new Map(parametresInitiales.map((p) => [p.cle, p.valeur]));
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Macro-créneau sélectionné dans le filtre global — demande d'Antoine du
   *  2026-09-23 : « un filtre macro qui va servir pour tout, les
   *  bénévoles, les artistes, les missions etc ». Porte l'id du
   *  macro-créneau, pas un jour abstrait (revu par le coordinateur le
   *  23/09 : dans l'usage d'Antoine un macro-créneau vaut un jour, mais
   *  l'entité du modèle reste le macro-créneau — le champ doit rester
   *  correct même si cette correspondance 1:1 change un jour). Vit ici,
   *  pas dans une vue, pour survivre à un changement d'onglet (`app.js` le
   *  monte au-dessus de la vue active). Pure préférence d'affichage,
   *  jamais écrite dans le document Grist : repart à zéro au rechargement. */
  macroCreneauSelectionne = null;

  selectionnerMacroCreneau(id) {
    this.macroCreneauSelectionne = id;
    this.notifier();
  }

  /** Relie ce magasin au document Grist réel (mode connecté, voir
   *  `main.js`) : voir `EcritureGrist` ci-dessus pour le contrat. */
  brancherEcriture(ecriture) {
    this.ecriture = ecriture;
  }

  notifier() {
    for (const fn of this.listeners) { fn(); }
  }

  // --- Lecture -------------------------------------------------------------

  get equipes() { return this.data.equipes; }
  get lieux() { return this.data.lieux; }
  get benevoles() { return this.data.benevoles; }
  get missions() { return this.data.missions; }
  get artistes() { return this.data.artistes; }
  get macroCreneaux() { return this.data.macroCreneaux; }
  get sousCreneaux() { return this.data.sousCreneaux; }
  get besoins() { return this.data.besoins; }
  get groupes() { return this.data.groupes; }
  get positionsGroupe() { return this.data.positionsGroupe; }
  get places() { return this.data.places; }
  get disponibilites() { return this.data.disponibilites; }
  get souhaitsMissions() { return this.data.souhaitsMissions; }
  get affinites() { return this.data.affinites; }
  get presences() { return this.data.presences; }

  /** Valeur d'un réglage scalaire de la table `Parametres` (`Cle`/`Valeur`),
   *  ou `undefined` si cette clé n'y a encore aucune ligne — à l'appelant de
   *  décider du défaut, comme `parametresAlgorithmeDepuisLignes` le fait
   *  pour les poids de l'algorithme (`grist/parametres.js`). */
  parametre(cle) {
    return this.parametres.get(cle);
  }

  /** Lit une colonne brute d'une table quelconque du document connecté —
   *  voir `EcritureGrist.valeursColonneBrute` ci-dessus. Map vide sans
   *  document connecté (démo, tests, clone de simulation) : rien à lire. */
  async valeursColonneBrute(tableId, colId) {
    return this.ecriture ? this.ecriture.valeursColonneBrute(tableId, colId) : new Map();
  }

  /** Liste les colonnes d'une table brute du document connecté — voir
   *  `EcritureGrist.colonnesTable` ci-dessus. Tableau vide sans document
   *  connecté (démo, tests, clone de simulation) : rien à lire. */
  async colonnesTable(tableId) {
    return this.ecriture ? this.ecriture.colonnesTable(tableId) : [];
  }

  /** Liste les tables du document connecté — voir `EcritureGrist.tablesDocument`
   *  ci-dessus. Tableau vide sans document connecté : rien à lire. */
  async tablesDocument() {
    return this.ecriture ? this.ecriture.tablesDocument() : [];
  }

  /** Enregistre un réglage scalaire de `Parametres` (upsert par clé) — voir
   *  `EcritureGrist.definirParametre` ci-dessus. */
  async definirParametre(cle, valeur) {
    if (this.ecriture) {
      await this.ecriture.definirParametre(cle, valeur);
    }
    this.parametres.set(cle, valeur);
    this.notifier();
  }

  /** Remplace toutes les disponibilités d'un bénévole sur `[debut, fin)` —
   *  voir `EcritureGrist.remplacerDisponibilites` ci-dessus. */
  async remplacerDisponibilites(
    benevoleId, debut, fin, nouvelles,
  ) {
    if (this.ecriture) {
      await this.ecriture.remplacerDisponibilites(benevoleId, debut, fin, nouvelles);
    }
    this.data.disponibilites = this.data.disponibilites.filter(
      (d) => !(d.Benevole === benevoleId && d.Quart_heure >= debut && d.Quart_heure < fin),
    );
    this.data.disponibilites.push(...nouvelles);
    this.notifier();
  }

  /** Peuple notre table Bénévoles depuis `tableSourceId` — voir
   *  `EcritureGrist.peuplerBenevoles` ci-dessus. `{crees: 0, actualises: 0}`
   *  sans document connecté (démo, tests) : rien à peupler depuis une table
   *  qui n'existe que dans un document réel. L'équipe assignée aux
   *  nouveaux bénévoles est toujours la première équipe existante — à
   *  l'appelant (la vue) de vérifier qu'il en existe au moins une avant
   *  d'appeler cette méthode. En cas de succès, remplace entièrement le
   *  cache local des bénévoles par l'état renvoyé (jamais reconstruit à la
   *  main), pour ne jamais s'écarter du document. */
  async peuplerBenevoles(
    tableSourceId, colNomId, colContactId,
  ) {
    if (!this.ecriture) { return {crees: 0, actualises: 0}; }
    const equipeParDefautId = this.data.equipes[0]?.id;
    if (equipeParDefautId == null) { return {crees: 0, actualises: 0}; }
    const resultat = await this.ecriture.peuplerBenevoles(tableSourceId, colNomId, colContactId, equipeParDefautId);
    this.data.benevoles = resultat.benevoles;
    this.notifier();
    return {crees: resultat.crees, actualises: resultat.actualises};
  }

  /** Ajoute des affinités "Ensemble" (binôme souhaité, import) — voir
   *  `EcritureGrist.creerAffinites` ci-dessus. Rien sans document connecté
   *  (démo, tests), comme `peuplerBenevoles` : rien à créer qui persiste.
   *  L'appelant (la vue) a déjà écarté les paires déjà connues de
   *  `this.affinites`. */
  async creerAffinites(paires) {
    if (paires.length === 0 || !this.ecriture) { return; }
    const nouvelles = await this.ecriture.creerAffinites(paires);
    this.data.affinites.push(...nouvelles);
    this.notifier();
  }

  /** Pointe un bénévole présent ou absent pour un jour de festival donné —
   *  l'appel (vue Indicatifs, §8, demande d'Antoine du 2026-09-24). Upsert
   *  local par (Benevole, Jour), comme `EcritureGrist.definirPresence`
   *  ci-dessus : ne crée jamais une seconde ligne pour un couple déjà
   *  pointé, la met à jour en place. Purement un pointage — ne lit ni ne
   *  modifie jamais `places`/`groupes`, à la différence de `definirAbsence`. */
  async definirPresence(benevoleId, jour, present) {
    const existante = this.data.presences.find((p) => p.Benevole === benevoleId && p.Jour === jour);
    const id = this.ecriture
      ? await this.ecriture.definirPresence(benevoleId, jour, present, existante?.id ?? null)
      : existante?.id ?? prochainId(this.data.presences);
    if (existante) {
      existante.Present = present;
    } else {
      this.data.presences.push({id, Benevole: benevoleId, Jour: jour, Present: present});
    }
    this.notifier();
  }

  // --- Écriture : équipes ------------------------------------------------

  /** Crée une équipe (demande d'Antoine du 2026-09-22). Même discipline
   *  que `creerMission` : en mode connecté, attend l'id réel avant
   *  d'insérer localement — une équipe fraîchement créée peut aussitôt
   *  être visée par une mission. `Referent` part toujours vide : rien
   *  n'écrit encore dedans. */
  async creerEquipe(patch) {
    const id = this.ecriture ? await this.ecriture.creerEquipe(patch) : prochainId(this.data.equipes);
    this.data.equipes.push({...patch, id, Referent: null});
    this.notifier();
    return id;
  }

  // --- Écriture : référentiel missions ----------------------------------------

  /** Crée une mission dans le référentiel (§1.1 étape 2 : le "quoi" — nom,
   *  équipe, lieu, priorité — pas le "où/quand". Un besoin, qui croise une
   *  mission et un sous-créneau, est un objet différent : voir `creerBesoin`,
   *  qui suppose la mission déjà là). En mode connecté, écrit d'abord dans
   *  le document Grist réel et attend l'id qu'il attribue, pour que le
   *  référentiel local ne s'écarte jamais du document sur l'id d'une
   *  mission (une mission fraîchement créée peut aussitôt être visée par un
   *  besoin, qui référence cet id) ; en mode démo, génère un id local comme
   *  toute autre écriture de ce magasin. */
  async creerMission(patch) {
    const id = this.ecriture ? await this.ecriture.creerMission(patch) : prochainId(this.data.missions);
    this.data.missions.push({...patch, id});
    this.notifier();
    return id;
  }

  // --- Écriture : agenda -----------------------------------------------------

  /** Crée ou modifie un macro-créneau (§8 point 1 : positionner un
   *  macro-créneau, et son édition ultérieure — nom, glisser-déposer,
   *  redimensionnement). En mode connecté, écrit d'abord dans le document
   *  Grist réel et attend confirmation avant de toucher l'état local, pour
   *  la même raison que `creerMission` : un échec d'écriture ne doit jamais
   *  ressembler à un succès à l'écran. */
  async enregistrerMacroCreneau(patch) {
    if (patch.id != null) {
      const idx = this.data.macroCreneaux.findIndex((m) => m.id === patch.id);
      if (idx >= 0) {
        if (this.ecriture) {
          await this.ecriture.modifierMacroCreneau(patch.id, {nom: patch.Nom, debut: patch.Debut, fin: patch.Fin});
        }
        this.data.macroCreneaux[idx] = {...this.data.macroCreneaux[idx], ...patch, id: patch.id};
        this.notifier();
        return patch.id;
      }
    }
    const id = this.ecriture
      ? await this.ecriture.creerMacroCreneau({nom: patch.Nom, debut: patch.Debut, fin: patch.Fin})
      : prochainId(this.data.macroCreneaux);
    this.data.macroCreneaux.push({...patch, id});
    this.notifier();
    return id;
  }

  // --- Écriture : artistes ------------------------------------------------

  /** Crée ou modifie un passage d'artiste (nom, lieu, horaires — demande
   *  d'Antoine du 2026-09-22 : les mêmes gestes que macro-créneaux/
   *  sous-créneaux, sur des horaires libres plutôt qu'un découpage en
   *  quart d'heure). Même discipline que `enregistrerMacroCreneau` :
   *  écrit d'abord dans le document Grist réel et attend confirmation
   *  avant de toucher l'état local. */
  async enregistrerArtiste(patch) {
    if (patch.id != null) {
      const idx = this.data.artistes.findIndex((a) => a.id === patch.id);
      if (idx >= 0) {
        if (this.ecriture) {
          await this.ecriture.modifierArtiste(patch.id, {nom: patch.Nom, lieuId: patch.Lieu || null, debut: patch.Debut, fin: patch.Fin});
        }
        this.data.artistes[idx] = {...this.data.artistes[idx], ...patch, id: patch.id};
        this.notifier();
        return patch.id;
      }
    }
    const id = this.ecriture
      ? await this.ecriture.creerArtiste({nom: patch.Nom, lieuId: patch.Lieu || null, debut: patch.Debut, fin: patch.Fin})
      : prochainId(this.data.artistes);
    this.data.artistes.push({...patch, id});
    this.notifier();
    return id;
  }

  enregistrerSousCreneau(patch) {
    if (patch.id != null) {
      const idx = this.data.sousCreneaux.findIndex((s) => s.id === patch.id);
      if (idx >= 0) {
        this.data.sousCreneaux[idx] = {...this.data.sousCreneaux[idx], ...patch, id: patch.id};
        this.notifier();
        return patch.id;
      }
    }
    const id = prochainId(this.data.sousCreneaux);
    this.data.sousCreneaux.push({...patch, id});
    this.notifier();
    return id;
  }

  supprimerSousCreneau(id) {
    this.data.sousCreneaux = this.data.sousCreneaux.filter((s) => s.id !== id);
    this.notifier();
  }

  /** Redécoupe automatiquement les sous-créneaux d'un macro-créneau existant
   *  sur toute sa plage, par pas de `dureeMinutes` (§8 point 3 : « une option
   *  pour que ça les place tout seul »). Remplace entièrement les
   *  sous-créneaux actuels du macro-créneau — utile après une création à la
   *  volée, ou pour changer la durée après coup, mais jamais quand l'un
   *  d'eux porte déjà une mission : un besoin positionné dessus, ou un
   *  créneau propre à une mission (`Sous_creneau.Mission`, §8 grille
   *  Missions, qui n'a pas forcément de `Besoin`) — on refuse dans les deux
   *  cas plutôt que d'orpheliner ou d'effacer silencieusement ce travail. */
  async redecouperSousCreneaux(macroId, dureeMinutes) {
    const macro = this.data.macroCreneaux.find((m) => m.id === macroId);
    if (!macro) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }
    const actuels = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroId);
    const aUneMission = actuels.some((s) => s.Mission != null || this.data.besoins.some((b) => b.Sous_creneau === s.id));
    if (aUneMission) {
      return {
        ok: false,
        raison: 'Des missions sont déjà positionnées sur ces sous-créneaux : le redécoupage automatique n\'est pas possible sans risquer de perdre ce travail. Cette interface ne permet pas encore de les retirer.',
      };
    }
    const idsASupprimer = actuels.map((s) => s.id);
    const dureeSec = dureeMinutes * 60;
    const plages = [];
    for (let t = macro.Debut; t < macro.Fin; t += dureeSec) {
      const fin = Math.min(t + dureeSec, macro.Fin);
      plages.push({libelle: libelleHeurePlage(t, fin), debut: t, fin});
    }
    let idsReels;
    if (this.ecriture) {
      try {
        idsReels = await this.ecriture.remplacerSousCreneaux(
          idsASupprimer,
          plages.map((p) => ({macroCreneauId: macroId, missionId: null, libelle: p.libelle, debut: p.debut, fin: p.fin})),
        );
      } catch (erreur) {
        if (erreur instanceof SuppressionApresCreationEchouee) {
          // Les nouveaux sous-créneaux existent réellement dans le document
          // (la création a réussi) ; on les ajoute localement SANS retirer
          // les anciens, pour que l'écran reflète l'état réel de Grist —
          // un doublon visible, jamais une perte que rien ne signale.
          plages.forEach((p, i) => {
            this.data.sousCreneaux.push({
              id: erreur.idsReelsCrees[i], Macro_creneau: macroId, Mission: null,
              Libelle: p.libelle, Debut: p.debut, Fin: p.fin,
            });
          });
          this.notifier();
          return {
            ok: false,
            raison: 'Les nouveaux sous-créneaux ont bien été créés dans le document, mais les anciens n\'ont pas pu être retirés : supprimez-les manuellement dans Grist.',
          };
        }
        return {ok: false, raison: 'Échec de l\'écriture dans le document Grist : le redécoupage a été annulé.'};
      }
    } else {
      const baseId = prochainId(this.data.sousCreneaux);
      idsReels = plages.map((_, i) => baseId + i);
    }
    this.data.sousCreneaux = this.data.sousCreneaux.filter((s) => s.Macro_creneau !== macroId);
    plages.forEach((p, i) => {
      this.data.sousCreneaux.push({
        id: idsReels[i], Macro_creneau: macroId, Mission: null,
        Libelle: p.libelle, Debut: p.debut, Fin: p.fin,
      });
    });
    this.notifier();
    return {ok: true};
  }

  /** Supprime un macro-créneau et ses sous-créneaux (Grist ne cascade pas —
   *  demande du fil Agenda, 2026-09-22, pour le bouton de suppression de la
   *  vue Agenda). Même garde-fou que `redecouperSousCreneaux` (aligné le
   *  2026-09-23, écart repéré par le fil Cahier des charges) : refuse par
   *  défaut si l'un des sous-créneaux porte déjà une mission — un besoin
   *  positionné dessus, ou un créneau propre à une mission
   *  (`Sous_creneau.Mission`) qui n'a pas forcément de `Besoin` — plutôt
   *  que d'orpheliner ou d'effacer silencieusement ce travail.
   *
   *  `forcer` (retour d'Antoine du 2026-09-23, geste posé par la vue
   *  Agenda) passe outre ce refus : les positions de groupe (binômes) sur
   *  les besoins de ces sous-créneaux, ces besoins, puis les sous-créneaux
   *  eux-mêmes (communs et propres) partent avec le macro-créneau. Les
   *  missions et les groupes (binômes, avec leurs places) ne sont jamais
   *  touchés : un groupe positionné ici redevient seulement libre — sa
   *  ligne `Groupe` et son roster `Places` vivent indépendamment de
   *  `PositionGroupe`, qui est tout ce qui le rattachait à ces besoins. */
  async supprimerMacroCreneau(macroId, forcer = false) {
    const macro = this.data.macroCreneaux.find((m) => m.id === macroId);
    if (!macro) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }
    const sousCreneauxDuMacro = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroId);
    const sousCreneauIds = sousCreneauxDuMacro.map((s) => s.id);
    const besoinsDuMacro = this.data.besoins.filter((b) => sousCreneauIds.includes(b.Sous_creneau));
    const aUneMission = sousCreneauxDuMacro.some((s) => s.Mission != null) || besoinsDuMacro.length > 0;
    if (aUneMission && !forcer) {
      return {
        ok: false,
        raison: 'Des missions sont déjà positionnées sur ce macro-créneau : la suppression n\'est pas possible sans risquer de perdre ce travail.',
      };
    }
    const besoinIds = besoinsDuMacro.map((b) => b.id);
    const positionIds = this.data.positionsGroupe.filter((p) => besoinIds.includes(p.Besoin)).map((p) => p.id);
    if (this.ecriture) {
      try {
        await this.ecriture.supprimerMacroCreneau(macroId, sousCreneauIds, besoinIds, positionIds);
      } catch {
        return {ok: false, raison: 'Échec de l\'écriture dans le document Grist : la suppression a été annulée.'};
      }
    }
    this.data.positionsGroupe = this.data.positionsGroupe.filter((p) => !positionIds.includes(p.id));
    this.data.besoins = this.data.besoins.filter((b) => !besoinIds.includes(b.id));
    this.data.sousCreneaux = this.data.sousCreneaux.filter((s) => s.Macro_creneau !== macroId);
    this.data.macroCreneaux = this.data.macroCreneaux.filter((m) => m.id !== macroId);
    this.notifier();
    return {ok: true};
  }

  /** Donne à une mission un sous-créneau propre à elle sur un macro-créneau
   *  (§6.2, « communs, avec exceptions » — option retenue par Antoine le
   *  2026-09-22 pour les missions dont les horaires ou les pauses sortent
   *  de la trame commune). Dès qu'une mission a un sous-créneau à elle sur
   *  un macro-créneau, ses sous-créneaux communs cessent de s'y appliquer,
   *  remplacés par les siens — c'est la vue (`grille.js`) qui applique
   *  cette règle à l'affichage, cette méthode ne fait qu'ajouter la ligne.
   *  Réutilise le pont de `redecouperSousCreneaux` (`remplacerSousCreneaux`)
   *  avec une liste de suppression vide : une création pure, un seul
   *  aller-retour, sans nouveau chemin d'écriture. */
  async creerSousCreneauMission(
    macroId, missionId, plage,
  ) {
    const nouveau = {macroCreneauId: macroId, missionId, libelle: plage.libelle, debut: plage.debut, fin: plage.fin};
    let id;
    if (this.ecriture) {
      try {
        id = (await this.ecriture.remplacerSousCreneaux([], [nouveau]))[0];
      } catch (erreur) {
        if (!(erreur instanceof SuppressionApresCreationEchouee)) { throw erreur; }
        id = erreur.idsReelsCrees[0];
      }
    } else {
      id = prochainId(this.data.sousCreneaux);
    }
    this.data.sousCreneaux.push({
      id, Macro_creneau: macroId, Mission: missionId, Libelle: plage.libelle, Debut: plage.debut, Fin: plage.fin,
    });
    this.notifier();
    return id;
  }

  /** Copie sur un autre jour les créneaux qu'une ou plusieurs missions ont
   *  déjà construits sur un jour source — demande d'Antoine du 2026-09-23 :
   *  « une fois que j'ai créé les éléments pour un jour, les importer/copier
   *  sur un autre », étendue le jour même à la copie des indicatifs déjà
   *  positionnés, « le cas échéant ».
   *
   *  Un sous-créneau COMMUN partagé par plusieurs missions n'est répliqué
   *  qu'UNE seule fois (`Mission` conservé tel quel, jamais forcé « propre » —
   *  point relevé par le fil Indicatifs : c'est le même défaut de structure
   *  qui a fait exploser sa propre vue le 2026-09-23), via une table de
   *  correspondance ancien id → nouvel id partagée par toutes les missions
   *  qui s'y rattachent. Purement additif : ne modifie, ne réordonne ni ne
   *  supprime jamais rien côté jour source ou côté existant du jour cible.
   *
   *  Idempotent bloc par bloc : rejouer la copie retrouve, pour un
   *  sous-créneau donné, une copie déjà là au même horaire relatif et avec
   *  le même `Mission` plutôt que d'en recréer une, et un besoin déjà
   *  présent pour cette mission sur cette copie n'est jamais recréé — une
   *  copie relancée après un premier passage partiel reprend juste là où
   *  elle s'était arrêtée, jamais en double.
   *
   *  Un indicatif déjà positionné sur un besoin copié est repositionné sur
   *  sa copie via `ajouterPosition` — même `Groupe`, donc mêmes bénévoles
   *  déjà affectés qui le suivent automatiquement : un binôme reste la même
   *  entité sur tout le festival (modèle confirmé par le fil Indicatifs),
   *  la copie ne crée jamais un nouveau `Groupe`. */
  async copierCreneauxJour(
    macroSourceId, macroCibleId,
  ) {
    if (macroSourceId === macroCibleId) {
      return {ok: false, raison: 'Le jour source et le jour cible sont identiques.'};
    }
    const macroSource = this.data.macroCreneaux.find((ma) => ma.id === macroSourceId);
    const macroCible = this.data.macroCreneaux.find((ma) => ma.id === macroCibleId);
    if (!macroSource || !macroCible) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }

    const sousCreneauxSource = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroSourceId);
    const aCopier = [];
    for (const mission of this.data.missions) {
      for (const sc of sousCreneauxApplicables(mission, sousCreneauxSource)) {
        const besoin = this.data.besoins.find((b) => b.Mission === mission.id && b.Sous_creneau === sc.id);
        if (besoin) { aCopier.push({mission, sc, besoin}); }
      }
    }
    if (aCopier.length === 0) {
      return {ok: false, raison: "Rien à copier : aucune mission n'a de besoin construit sur le jour source."};
    }

    // Sous-créneaux distincts à répliquer, dédupliqués par id (un commun
    // partagé par plusieurs missions n'apparaît qu'une fois dans `aCopier`
    // mais ne doit être copié qu'une fois).
    const distincts = new Map();
    for (const {sc} of aCopier) { distincts.set(sc.id, sc); }

    const correspondance = new Map();
    const aCreer = [];
    for (const sc of distincts.values()) {
      const debut = macroCible.Debut + (sc.Debut - macroSource.Debut);
      const fin = macroCible.Debut + (sc.Fin - macroSource.Debut);
      const dejaLa = this.data.sousCreneaux.find(
        (c) => c.Macro_creneau === macroCibleId && c.Mission === sc.Mission && c.Debut === debut && c.Fin === fin,
      );
      if (dejaLa) { correspondance.set(sc.id, dejaLa.id); continue; }
      aCreer.push({source: sc, missionId: sc.Mission, libelle: sc.Libelle, debut, fin});
    }

    if (aCreer.length > 0) {
      let idsReels;
      if (this.ecriture) {
        try {
          idsReels = await this.ecriture.remplacerSousCreneaux(
            [],
            aCreer.map((n) => ({macroCreneauId: macroCibleId, missionId: n.missionId, libelle: n.libelle, debut: n.debut, fin: n.fin})),
          );
        } catch (erreur) {
          if (!(erreur instanceof SuppressionApresCreationEchouee)) {
            return {ok: false, raison: "Échec de l'écriture dans le document Grist : la copie a été annulée."};
          }
          idsReels = erreur.idsReelsCrees;
        }
      } else {
        const baseId = prochainId(this.data.sousCreneaux);
        idsReels = aCreer.map((_, i) => baseId + i);
      }
      aCreer.forEach((n, i) => {
        const id = idsReels[i];
        correspondance.set(n.source.id, id);
        this.data.sousCreneaux.push({id, Macro_creneau: macroCibleId, Mission: n.missionId, Libelle: n.libelle, Debut: n.debut, Fin: n.fin});
      });
      this.notifier();
    }

    let besoinsCrees = 0;
    let indicatifsRepositionnes = 0;
    for (const {mission, sc, besoin} of aCopier) {
      const sousCreneauCibleId = correspondance.get(sc.id);
      const dejaCopie = this.data.besoins.some((b) => b.Mission === mission.id && b.Sous_creneau === sousCreneauCibleId);
      if (dejaCopie) { continue; }

      let besoinCibleId;
      try {
        besoinCibleId = this.ecriture
          ? await this.ecriture.creerBesoin({
            missionId: mission.id, sousCreneauId: sousCreneauCibleId,
            effectifMin: besoin.Effectif_min, effectifMax: besoin.Effectif_max, tailleGroupe: besoin.Taille_groupe,
          })
          : prochainId(this.data.besoins);
      } catch {
        this.notifier();
        return {
          ok: false,
          raison: `Échec de l'écriture dans le document Grist pour la mission « ${mission.Nom} » : la copie s'est arrêtée là. Ce qui a déjà été copié avant (${besoinsCrees} besoin(s), ${indicatifsRepositionnes} indicatif(s)) est conservé ; relancez la copie pour continuer, elle ne redouble jamais ce qui est déjà là.`,
        };
      }
      this.data.besoins.push({
        id: besoinCibleId, Mission: mission.id, Sous_creneau: sousCreneauCibleId,
        Effectif_min: besoin.Effectif_min, Effectif_max: besoin.Effectif_max, Taille_groupe: besoin.Taille_groupe,
      });
      besoinsCrees += 1;

      const positions = this.data.positionsGroupe.filter((p) => p.Besoin === besoin.id);
      for (const position of positions) {
        let positionId;
        try {
          positionId = this.ecriture
            ? await this.ecriture.ajouterPosition(position.Groupe, besoinCibleId)
            : prochainId(this.data.positionsGroupe);
        } catch {
          this.notifier();
          return {
            ok: false,
            raison: `Échec du repositionnement d'un indicatif pour la mission « ${mission.Nom} » : la copie s'est arrêtée là. Ce qui a déjà été copié avant (${besoinsCrees} besoin(s), ${indicatifsRepositionnes} indicatif(s)) est conservé ; relancez la copie pour continuer, elle ne redouble jamais ce qui est déjà là.`,
          };
        }
        this.data.positionsGroupe.push({id: positionId, Groupe: position.Groupe, Besoin: besoinCibleId});
        indicatifsRepositionnes += 1;
      }
    }

    this.notifier();
    return {ok: true, sousCreneauxCrees: aCreer.length, besoinsCrees, indicatifsRepositionnes};
  }

  /** Convertit en créneaux à `missionId` tous les créneaux communs qu'elle
   *  voit actuellement ce jour-là (§6.2, « communs, avec exceptions ») —
   *  mêmes horaires, mêmes libellés —, repointe SES besoins sur ces
   *  créneaux-là vers leurs nouvelles copies (ceux des autres missions
   *  restent sur les communs d'origine, jamais touchés), et rend la
   *  correspondance ancien id → nouveau id. Ne matérialise rien si la
   *  mission a déjà au moins un créneau à elle ce jour-là (rien à
   *  convertir : ses communs ne comptent alors déjà plus pour elle).
   *
   *  Retour d'Antoine du 2026-09-23 : glisser ou redimensionner depuis la
   *  ligne d'une mission un créneau qu'elle partage encore avec d'autres
   *  le rend sien en premier, sans jamais bouger les autres missions qui
   *  le partagent toujours. */
  async materialiserCreneauxPropres(
    missionId, sousCreneauDeReferenceId,
  ) {
    const reference = this.data.sousCreneaux.find((s) => s.id === sousCreneauDeReferenceId);
    if (!reference) { return {ok: false, raison: 'Sous-créneau introuvable.'}; }
    const cle = cleJourFestival(reference.Debut);
    const macrosDuJour = this.data.macroCreneaux.filter((ma) => cleJourFestival(ma.Debut) === cle);
    const sousCreneauxDuJour = this.data.sousCreneaux.filter((s) => macrosDuJour.some((ma) => ma.id === s.Macro_creneau));
    const propresExistants = sousCreneauxDuJour.filter((s) => s.Mission === missionId);
    if (propresExistants.length > 0) {
      return {ok: true, correspondance: new Map(propresExistants.map((s) => [s.id, s.id]))};
    }

    const communs = sousCreneauxDuJour.filter((s) => s.Mission === null);
    const nouveaux = communs.map((c) => (
      {macroCreneauId: c.Macro_creneau, missionId, libelle: c.Libelle, debut: c.Debut, fin: c.Fin}
    ));
    let idsReels;
    if (this.ecriture) {
      try {
        idsReels = await this.ecriture.remplacerSousCreneaux([], nouveaux);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist : la conversion a été annulée."};
      }
    } else {
      const baseId = prochainId(this.data.sousCreneaux);
      idsReels = communs.map((_, i) => baseId + i);
    }

    const correspondance = new Map();
    communs.forEach((c, i) => {
      const id = idsReels[i];
      correspondance.set(c.id, id);
      this.data.sousCreneaux.push({
        id, Macro_creneau: c.Macro_creneau, Mission: missionId, Libelle: c.Libelle, Debut: c.Debut, Fin: c.Fin,
      });
    });

    const besoinsARepointer = this.data.besoins.filter((b) => b.Mission === missionId && correspondance.has(b.Sous_creneau));
    if (besoinsARepointer.length > 0) {
      const patches = besoinsARepointer.map((b) => ({id: b.id, sousCreneauId: correspondance.get(b.Sous_creneau)}));
      if (this.ecriture) {
        try {
          await this.ecriture.repointerBesoins(patches);
        } catch {
          // Les nouveaux créneaux existent déjà réellement dans le document
          // (la création a réussi) : on ne les retire pas, pour la même
          // raison que `SuppressionApresCreationEchouee` ailleurs dans ce
          // fichier — un doublon visible et récupérable (les besoins
          // restent pointés sur les communs), jamais une perte que rien ne
          // signale.
          this.notifier();
          return {
            ok: false,
            raison: 'Les nouveaux créneaux ont bien été créés dans le document, mais ses besoins n\'ont pas pu être repointés dessus : ajustez-les manuellement dans Grist.',
          };
        }
      }
      for (const patch of patches) {
        this.data.besoins.find((b) => b.id === patch.id).Sous_creneau = patch.sousCreneauId;
      }
    }

    this.notifier();
    return {ok: true, correspondance};
  }

  /** Déplace le créneau d'une mission de `deltaSecondes`, avec tous ceux de
   *  la même mission qui le suivent dans le temps — « une suite de
   *  créneaux » qu'on pousse depuis un bord, geste par défaut du glisser
   *  dans la grille Missions (demande d'Antoine du 2026-09-22). Toujours en
   *  place, même id : `redimensionnerCreneauMission` et cette méthode
   *  partagent la même raison de ne jamais supprimer-recréer que
   *  `EcritureGrist.modifierSousCreneaux`. Un créneau encore commun est
   *  d'abord rendu sien par `materialiserCreneauxPropres` (retour
   *  d'Antoine du 2026-09-23) — la « suite » qui suit s'appuie ensuite sur
   *  `missionId`, qui couvre aussi bien ses créneaux déjà siens que ceux
   *  tout juste matérialisés. */
  async deplacerCreneauxMission(
    sousCreneauId, missionId, deltaSecondes,
  ) {
    if (deltaSecondes === 0) { return {ok: true}; }
    const sc = this.data.sousCreneaux.find((s) => s.id === sousCreneauId);
    if (!sc) { return {ok: false, raison: 'Sous-créneau introuvable.'}; }
    if (sc.Mission == null) {
      const materialise = await this.materialiserCreneauxPropres(missionId, sousCreneauId);
      if (!materialise.ok) { return materialise; }
    }
    const suite = this.data.sousCreneaux.filter((s) => s.Mission === missionId && s.Debut >= sc.Debut);
    const patches = suite.map((s) => {
      const debut = s.Debut + deltaSecondes;
      const fin = s.Fin + deltaSecondes;
      return {id: s.id, debut, fin, libelle: libelleHeurePlage(debut, fin)};
    });
    if (this.ecriture) {
      try {
        await this.ecriture.modifierSousCreneaux(patches);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    for (const patch of patches) {
      const s = this.data.sousCreneaux.find((x) => x.id === patch.id);
      s.Debut = patch.debut;
      s.Fin = patch.fin;
      s.Libelle = patch.libelle;
    }
    this.notifier();
    return {ok: true};
  }

  /** Redimensionne le créneau d'une mission (glisser en maintenant ALT,
   *  demande d'Antoine du 2026-09-22) : `depuisDebut` indique le bord
   *  tiré, la borne opposée ne bouge jamais. En place, même id (voir
   *  `deplacerCreneauxMission`, y compris pour la conversion d'un créneau
   *  encore commun). Refuse de descendre sous un quart d'heure. */
  async redimensionnerCreneauMission(
    sousCreneauId, missionId, depuisDebut, deltaSecondes,
  ) {
    if (deltaSecondes === 0) { return {ok: true}; }
    const sc = this.data.sousCreneaux.find((s) => s.id === sousCreneauId);
    if (!sc) { return {ok: false, raison: 'Sous-créneau introuvable.'}; }
    let cible = sc;
    if (sc.Mission == null) {
      const materialise = await this.materialiserCreneauxPropres(missionId, sousCreneauId);
      if (!materialise.ok) { return materialise; }
      cible = this.data.sousCreneaux.find((s) => s.id === materialise.correspondance.get(sousCreneauId));
    }
    const debut = depuisDebut ? cible.Debut + deltaSecondes : cible.Debut;
    const fin = depuisDebut ? cible.Fin : cible.Fin + deltaSecondes;
    if (fin - debut < PAS_SECONDES) {
      return {ok: false, raison: "Un créneau ne peut pas durer moins d'un quart d'heure."};
    }
    const libelle = libelleHeurePlage(debut, fin);
    if (this.ecriture) {
      try {
        await this.ecriture.modifierSousCreneaux([{id: cible.id, debut, fin, libelle}]);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    cible.Debut = debut;
    cible.Fin = fin;
    cible.Libelle = libelle;
    this.notifier();
    return {ok: true};
  }

  // --- Écriture : affectations ------------------------------------------------

  /** Affecte (ou vide) une place. Une place appartient à un indicatif : ceci
   *  vaut donc pour tous les besoins sur lesquels l'indicatif est positionné
   *  (§6.3). Verrouille toujours la place quand l'origine est manuelle, y
   *  compris en la vidant — même contrat que `corrigerPlace` du moteur
   *  (`moteur/affectation.js`) : un recalcul algorithmique ne doit jamais
   *  reprendre la main sur une correction humaine sans déverrouillage
   *  explicite. Une proposition d'algorithme (origine `'Algorithme'`) ne
   *  verrouille jamais — voir `appliquerPropositionsAlgorithme`. */
  async assignerPlace(
    placeId, benevoleId, origine = 'Manuel',
  ) {
    const place = this.data.places.find((p) => p.id === placeId);
    if (!place) { return {ok: false, raison: 'Place introuvable.'}; }
    const score = benevoleId != null ? 1 : 0;
    const verrouillee = origine === 'Manuel' ? true : place.Verrouillee;
    if (this.ecriture) {
      try {
        await this.ecriture.modifierPlaces([{id: placeId, benevoleId, origine, verrouillee, score}]);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    place.Benevole = benevoleId;
    place.Origine = origine;
    place.Score = score;
    place.Verrouillee = verrouillee;
    this.notifier();
    return {ok: true};
  }

  async basculerVerrouillage(placeId) {
    const place = this.data.places.find((p) => p.id === placeId);
    if (!place) { return {ok: false, raison: 'Place introuvable.'}; }
    const verrouillee = !place.Verrouillee;
    if (this.ecriture) {
      try {
        await this.ecriture.modifierPlaces([{
          id: placeId, benevoleId: place.Benevole, origine: place.Origine, verrouillee, score: place.Score,
        }]);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    place.Verrouillee = verrouillee;
    this.notifier();
    return {ok: true};
  }

  /** Marque un bénévole absent ou de retour. Une absence libère ses places à
   *  venir (décision Antoine, §7.4) : on renvoie leurs identifiants pour que
   *  la vue jour J puisse proposer des remplaçants immédiatement. Une place
   *  verrouillée n'est jamais touchée par l'algorithme (§7.1) : on la laisse
   *  en anomalie plutôt que de la vider silencieusement. */
  async definirAbsence(
    benevoleId, absent,
  ) {
    const benevole = this.data.benevoles.find((b) => b.id === benevoleId);
    if (!benevole) { return {ok: false, raison: 'Bénévole introuvable.'}; }
    const liberees = absent
      ? this.data.places.filter((p) => p.Benevole === benevoleId && !p.Verrouillee)
      : [];
    const placeIds = liberees.map((p) => p.id);
    if (this.ecriture) {
      try {
        await this.ecriture.definirAbsence(benevoleId, absent, placeIds);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    benevole.Statut = absent ? 'Absent' : 'Actif';
    for (const place of liberees) {
      place.Benevole = null;
      place.Origine = 'Manuel';
      place.Score = 0;
    }
    this.notifier();
    return {ok: true, placesLiberees: placeIds};
  }

  /** Déplace un positionnement d'indicatif vers un autre besoin : ne touche
   *  qu'une ligne `PositionGroupe`, jamais le reste du planning (contrainte C).
   *  `positionId`/`nouveauBesoinId` doivent déjà être réels en mode connecté
   *  (créés par ce magasin, donc via `EcritureGrist` — voir son en-tête) :
   *  une position tout juste créée dans cette même session n'est déplaçable
   *  qu'après rechargement du document. */
  async deplacerPosition(positionId, nouveauBesoinId) {
    const position = this.data.positionsGroupe.find((p) => p.id === positionId);
    if (!position) { return; }
    if (this.ecriture) { await this.ecriture.deplacerPosition(positionId, nouveauBesoinId); }
    position.Besoin = nouveauBesoinId;
    this.notifier();
  }

  async ajouterPosition(groupeId, besoinId) {
    const id = this.ecriture ? await this.ecriture.ajouterPosition(groupeId, besoinId) : prochainId(this.data.positionsGroupe);
    this.data.positionsGroupe.push({id, Groupe: groupeId, Besoin: besoinId});
    this.notifier();
    return id;
  }

  /** Crée un nouveau besoin (mission × sous-créneau), sans aucun indicatif
   *  dessus (revirement d'Antoine du 2026-09-22 : il pose ses besoins
   *  d'abord, puis crée et positionne ses binômes lui-même depuis la vue
   *  Indicatifs — l'ancienne règle, un binôme par défaut posé aussitôt,
   *  tombe). `tailleGroupe` ne dimensionne donc plus rien ici ; il ne reste
   *  que pour donner à `Effectif_max` une valeur par défaut cohérente tant
   *  qu'aucun binôme n'existe. Ne rien créer sur une case reste le geste
   *  pour une zone volontairement non couverte : cette méthode n'est
   *  jamais appelée automatiquement. */
  async creerBesoin(
    missionId, sousCreneauId, params = {},
  ) {
    const tailleGroupe = params.tailleGroupe ?? 2;
    const effectifMin = params.effectifMin ?? tailleGroupe;
    const effectifMax = Math.max(tailleGroupe, effectifMin);
    const id = this.ecriture
      ? await this.ecriture.creerBesoin({missionId, sousCreneauId, effectifMin, effectifMax, tailleGroupe})
      : prochainId(this.data.besoins);
    this.data.besoins.push({
      id, Mission: missionId, Sous_creneau: sousCreneauId,
      Effectif_min: effectifMin, Effectif_max: effectifMax, Taille_groupe: tailleGroupe,
    });
    this.notifier();
    return id;
  }

  /** Crée un nouvel indicatif (un `Groupe` de `taille` places vides) et le
   *  positionne sur `besoinId` : c'est le « + binôme » d'un besoin, qu'il en
   *  ait déjà un ou aucun — depuis que `creerBesoin` n'en pose plus
   *  automatiquement, ce geste explicite est désormais le seul moyen d'en
   *  poser un premier. L'équipe du nouvel indicatif reprend celle de la
   *  mission du besoin. */
  async creerGroupeSurBesoin(besoinId, taille = 2) {
    const besoin = this.data.besoins.find((b) => b.id === besoinId);
    if (!besoin) { return -1; }
    const mission = this.data.missions.find((mi) => mi.id === besoin.Mission);
    const equipeId = mission?.Equipe ?? this.data.equipes[0]?.id ?? 0;
    const code = prochainCodeGroupe(this.data.groupes.map((g) => g.Code));

    // Trois allers-retours liés (`EcritureGrist`, voir son en-tête) : le
    // groupe doit exister côté Grist avant de pouvoir le positionner, qui
    // doit lui-même exister avant que ses places aient un sens.
    const groupeId = this.ecriture
      ? await this.ecriture.creerGroupe({code, taille, equipeId})
      : prochainId(this.data.groupes);
    this.data.groupes.push({id: groupeId, Code: code, Taille: taille, Equipe: equipeId, Notes: ''});

    if (this.ecriture) { await this.ecriture.positionnerGroupe(groupeId, besoinId); }
    this.data.positionsGroupe.push({id: prochainId(this.data.positionsGroupe), Groupe: groupeId, Besoin: besoinId});

    if (this.ecriture) { await this.ecriture.definirPlaces(groupeId, taille); }
    for (let rang = 1; rang <= taille; rang++) {
      this.data.places.push({
        id: prochainId(this.data.places), Groupe: groupeId, Rang: rang,
        Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0,
      });
    }

    this.notifier();
    return groupeId;
  }

  /** Retire une position (panneau « Trajectoire du jour », bouton
   *  Supprimer, demande d'Antoine du 2026-09-23 : jusqu'ici on ne pouvait
   *  que déplacer). Ne touche jamais `Groupe`/`Places` : le binôme garde
   *  ses bénévoles déjà affectés, seule cette étape de sa trajectoire du
   *  jour disparaît — à la différence d'une suppression de sous-créneau ou
   *  de macro-créneau, qui elles retirent le binôme lui-même. */
  async supprimerPosition(positionId) {
    const position = this.data.positionsGroupe.find((p) => p.id === positionId);
    if (!position) { return {ok: false, raison: 'Position introuvable.'}; }
    if (this.ecriture) {
      try {
        await this.ecriture.supprimerPosition(positionId);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    this.data.positionsGroupe = this.data.positionsGroupe.filter((p) => p.id !== positionId);
    this.notifier();
    return {ok: true};
  }

  /** Applique le résultat d'un calcul d'algorithme (§7.5.1) : chaque place du
   *  périmètre reçoit l'occupant proposé, verrouillée seulement si le moteur
   *  l'a demandé (jamais le cas pour une proposition d'algorithme — seule
   *  une correction manuelle verrouille, voir `logic/moteur-pont.js`). */
  async appliquerPropositionsAlgorithme(propositions) {
    if (propositions.length === 0) { return {ok: true}; }
    const patches = propositions.map((p) => ({
      id: p.placeId, benevoleId: p.benevoleIdApres, origine: p.origineApres,
      verrouillee: p.verrouilleeApres, score: p.score ?? 0,
    }));
    if (this.ecriture) {
      try {
        await this.ecriture.modifierPlaces(patches);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    for (const patch of patches) {
      const place = this.data.places.find((p) => p.id === patch.id);
      if (!place) { continue; }
      place.Benevole = patch.benevoleId;
      place.Origine = patch.origine;
      place.Verrouillee = patch.verrouillee;
      place.Score = patch.score;
    }
    this.notifier();
    return {ok: true};
  }

  /** Réinitialise complètement les affectations (bouton « Réinitialiser »,
   *  demande d'Antoine du 2026-09-23) : vide ET déverrouille CHAQUE place, y
   *  compris une place verrouillée déjà vide — sinon le solveur (§7.1) l'ignore
   *  pour toujours (voir l'en-tête d'`assignerPlace`), et un « rerun complet »
   *  ne repartirait pas d'une ardoise vraiment vierge. Détruit sans recours
   *  les corrections manuelles existantes : à l'appelant de faire confirmer
   *  ce geste avant d'appeler cette méthode (pas fait ici, pour rester une
   *  opération pure comme le reste de ce fichier). */
  async reinitialiserAffectations() {
    const patches = this.data.places
      .filter((p) => p.Benevole != null || p.Verrouillee)
      .map((p) => ({id: p.id, benevoleId: null, origine: 'Manuel', verrouillee: false, score: 0}));
    if (patches.length === 0) { return {ok: true}; }
    if (this.ecriture) {
      try {
        await this.ecriture.modifierPlaces(patches);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    for (const patch of patches) {
      const place = this.data.places.find((p) => p.id === patch.id);
      if (!place) { continue; }
      place.Benevole = patch.benevoleId;
      place.Origine = patch.origine;
      place.Verrouillee = patch.verrouillee;
      place.Score = patch.score;
    }
    this.notifier();
    return {ok: true};
  }

  // --- Simulation ------------------------------------------------------------

  /** Clone profond et indépendant, pour simuler une modification (aperçu
   *  avant validation, §7.3) sans jamais toucher au magasin réel : les
   *  mutations faites sur le clone n'appellent pas ses abonnés. */
  cloner() {
    const clone = new Magasin(structuredClone(this.data));
    clone.parametres = new Map(this.parametres);
    return clone;
  }
}
