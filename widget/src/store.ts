/**
 * Magasin en mémoire : tient le `Modele` décodé et notifie ses abonnés à
 * chaque mutation, comme le ferait un `grist.onRecords` côté widget réel.
 * Rien ici ne suppose une origine « démo » ou « Grist réel » — seule
 * `donnees/normaliser.ts` (ou son futur équivalent branché sur
 * `window.grist.docApi`) sait d'où vient le `Modele` initial.
 */

import type {
  Affinite, Artiste, Benevole, Besoin, Disponibilite, Epoch, Equipe, Groupe, Id, Lieu, MacroCreneau,
  Mission, Modele, OriginePlace, Place, PositionGroupe, SouhaitMission, SousCreneau,
} from './domain/types';
import {libelleHeurePlage, PAS_SECONDES} from './temps';

type Listener = () => void;

/**
 * Le pont générique entre le `Magasin` et le document Grist réel :
 * une seule interface, une seule méthode `brancherEcriture` pour la
 * relier, quelle que soit la vue ou le fil à l'origine de la mutation.
 * Sans écriture branchée (mode démo, ou tant qu'une méthode donnée n'a
 * pas encore son constructeur d'actions côté `grist/ecriture.ts`), la
 * mutation correspondante du `Magasin` reste purement locale, exactement
 * comme aujourd'hui.
 *
 * Chaque méthode ici doit écrire réellement dans le document (via
 * `grist/ecriture.ts` + `appliquerActions`) et ne résoudre qu'une fois
 * l'écriture confirmée — jamais de succès optimiste : une mutation qui a
 * l'air d'avoir marché à l'écran mais que Grist a refusée est pire que
 * pas d'écriture du tout. La méthode du `Magasin` qui l'appelle attend
 * cette promesse avant de toucher l'état local (voir `creerMission`) ;
 * si elle rejette, l'appelant (la vue) affiche l'échec au lieu de
 * l'avaler — voir `views/grille.ts` `ouvrirCreationMission`.
 *
 * Nouvelle mutation qui doit persister (macro-créneaux, sous-créneaux,
 * indicatifs…) : ajouter sa méthode ici plutôt qu'un nouveau champ/
 * `brancherXxx` séparé, pour ne jamais avoir plusieurs ponts divergents.
 *
 * Chaque méthode correspond à un seul aller-retour Grist, jamais à une
 * séquence complète : `creerGroupeSurBesoin` (§6.3, un indicatif) est
 * trois allers-retours liés (`creerGroupe` → `positionnerGroupe` →
 * `definirPlaces`), parce qu'un identifiant créé par un appel
 * `applyUserActions` ne peut pas être référencé par une action du même
 * appel (contrainte Grist, vérifiée en vrai — voir
 * `scripts/verifier-ecritures-v01.ts`) ; c'est la méthode `Magasin` qui
 * orchestre la séquence, jamais l'implémentation de `EcritureGrist`.
 */
export interface EcritureGrist {
  /** Écrit une équipe et rend l'id que Grist lui attribue — voir
   *  `Magasin.creerEquipe`, qui l'attend avant d'insérer localement, pour
   *  la même raison que `creerMission`. */
  creerEquipe(equipe: Omit<Equipe, 'id' | 'Referent'>): Promise<Id>;
  /** Écrit une mission et rend l'id que Grist lui attribue — voir
   *  `Magasin.creerMission`, qui l'attend avant d'insérer localement,
   *  pour que le référentiel ne s'écarte jamais du document sur l'id
   *  d'une mission (un besoin peut aussitôt la référencer). */
  creerMission(mission: Omit<Mission, 'id'>): Promise<Id>;
  /** Écrit un macro-créneau et rend l'id que Grist lui attribue — voir
   *  `Magasin.enregistrerMacroCreneau`, qui l'attend avant d'insérer
   *  localement, pour la même raison que `creerMission`. */
  creerMacroCreneau(macro: {nom: string; debut: Epoch; fin: Epoch}): Promise<Id>;
  /** Modifie un macro-créneau déjà réel : nom et horaires, toujours fournis
   *  ensemble (voir `Magasin.enregistrerMacroCreneau`, qui ne les sépare
   *  jamais côté appelant). */
  modifierMacroCreneau(id: Id, macro: {nom: string; debut: Epoch; fin: Epoch}): Promise<void>;
  /** Supprime un macro-créneau déjà réel et les sous-créneaux donnés (les
   *  siens) en un seul aller-retour (`RemoveRecord` + `BulkRemoveRecord`) —
   *  Grist ne cascade pas les suppressions, donc les sous-créneaux à
   *  emporter sont fournis explicitement par l'appelant (voir
   *  `Magasin.supprimerMacroCreneau`, qui garde le même garde-fou que
   *  `redecouperSousCreneaux` : refus si l'un d'eux porte déjà un besoin). */
  supprimerMacroCreneau(macroCreneauId: Id, sousCreneauIds: readonly Id[]): Promise<void>;
  /** Écrit un artiste (un passage : nom, lieu, horaires) et rend l'id que
   *  Grist lui attribue — voir `Magasin.enregistrerArtiste`, qui l'attend
   *  avant d'insérer localement, pour la même raison que `creerMission`.
   *  `lieuId` suit la même convention que `creerMission` : `null` pour
   *  aucun lieu, jamais `0` (voir `./grist/valeurs`, `encoderRef`). */
  creerArtiste(artiste: {nom: string; lieuId: Id | null; debut: Epoch; fin: Epoch}): Promise<Id>;
  /** Modifie un artiste déjà réel : nom, lieu et horaires, toujours fournis
   *  ensemble (voir `Magasin.enregistrerArtiste`, qui ne les sépare jamais
   *  côté appelant, à l'image de `modifierMacroCreneau`). */
  modifierArtiste(id: Id, artiste: {nom: string; lieuId: Id | null; debut: Epoch; fin: Epoch}): Promise<void>;
  /** Remplace tous les sous-créneaux d'un macro-créneau déjà réel (§8 point
   *  3, redécoupage automatique) : crée les nouveaux puis supprime les ids
   *  donnés — deux allers-retours liés, jamais un seul batché (un id créé
   *  par un appel `applyUserActions` ne peut pas être référencé par une
   *  action du même appel). Création d'abord, suppression ensuite plutôt
   *  que l'inverse : si le second aller-retour échoue après le premier, le
   *  document se retrouve avec un doublon visible et récupérable (les
   *  anciens et les nouveaux coexistent), jamais un macro-créneau vidé sans
   *  que rien ne le signale — voir `SuppressionApresCreationEchouee`, que
   *  cette méthode lève dans ce cas précis (au lieu d'un rejet ordinaire)
   *  pour que `Magasin.redecouperSousCreneaux` puisse distinguer les deux
   *  échecs et refléter l'état réel du document. Rend les ids réels des
   *  nouveaux sous-créneaux, dans le même ordre que `nouveaux`. */
  remplacerSousCreneaux(
    idsASupprimer: readonly Id[],
    nouveaux: readonly {macroCreneauId: Id; missionId: Id | null; libelle: string; debut: Epoch; fin: Epoch}[],
  ): Promise<Id[]>;
  /** Modifie un ou plusieurs sous-créneaux déjà réels EN PLACE (même id) —
   *  jamais en supprimant puis recréant, contrairement à
   *  `remplacerSousCreneaux` : un besoin déjà positionné sur l'un d'eux ne
   *  référence que l'identifiant du sous-créneau (`Besoins.Sous_creneau`),
   *  jamais ses horaires — une suppression-recréation l'orphelinerait.
   *  Sert au déplacement et au redimensionnement d'un créneau propre à une
   *  mission dans la grille (glisser, glisser+ALT, demande d'Antoine du
   *  2026-09-22). */
  modifierSousCreneaux(patches: readonly {id: Id; libelle: string; debut: Epoch; fin: Epoch}[]): Promise<void>;
  /** Écrit un besoin (mission × sous-créneau) et rend son id réel. */
  creerBesoin(besoin: {
    missionId: Id; sousCreneauId: Id; effectifMin: number; effectifMax: number; tailleGroupe: number;
  }): Promise<Id>;
  /** Écrit un indicatif (`Groupe`) et rend son id réel — première étape de
   *  `Magasin.creerGroupeSurBesoin`. */
  creerGroupe(groupe: {code: string; taille: number; equipeId: Id}): Promise<Id>;
  /** Positionne un groupe déjà réel sur un besoin déjà réel. L'id de la
   *  position n'est volontairement pas rendu : il ne sert qu'à un
   *  déplacement ultérieur (`deplacerPosition`), retrouvé au rechargement
   *  du document plutôt que suivi en mémoire d'une session à l'autre. */
  positionnerGroupe(groupeId: Id, besoinId: Id): Promise<void>;
  /** Crée les places (vides) d'un groupe déjà réel. */
  definirPlaces(groupeId: Id, taille: number): Promise<void>;
  /** Déplace une position déjà réelle vers un autre besoin déjà réel
   *  (glisser-déposer d'un indicatif, page Indicatifs). */
  deplacerPosition(positionId: Id, nouveauBesoinId: Id): Promise<void>;
  /** Positionne un groupe déjà réel sur un second besoin (« + Ajouter une
   *  position ») et rend l'id réel de cette nouvelle position. */
  ajouterPosition(groupeId: Id, besoinId: Id): Promise<Id>;
}

/** Levée par `EcritureGrist.remplacerSousCreneaux` quand la création des
 *  nouveaux sous-créneaux a réussi mais que la suppression des anciens a
 *  échoué ensuite : les deux jeux existent alors réellement dans le
 *  document. `idsReelsCrees` porte les ids réels des nouveaux (dans l'ordre
 *  demandé) pour que `Magasin.redecouperSousCreneaux` les ajoute localement
 *  sans retirer les anciens, plutôt que de laisser croire — comme un rejet
 *  ordinaire le ferait — que rien n'a changé dans le document. */
export class SuppressionApresCreationEchouee extends Error {
  constructor(readonly idsReelsCrees: readonly Id[]) {
    super('La suppression des anciens sous-créneaux a échoué après la création des nouveaux.');
    this.name = 'SuppressionApresCreationEchouee';
  }
}

function prochainId(lignes: {id: Id}[]): Id {
  return lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;
}

/** Prochain code de binôme dans la nomenclature simplifiée voulue par
 *  Antoine (2026-09-22) : A1 à Z1, puis A2 à Z2, et ainsi de suite — une
 *  seule séquence pour tout le document, plus un préfixe par équipe.
 *  Ignore les codes déjà pris (y compris un ancien format hérité) pour ne
 *  jamais réattribuer un code existant, qu'il vienne d'une suppression ou
 *  d'une reprise sur un document déjà peuplé. */
function prochainCodeGroupe(codesExistants: readonly string[]): string {
  const pris = new Set(codesExistants);
  for (let numero = 1; ; numero++) {
    for (let lettre = 0; lettre < 26; lettre++) {
      const code = `${String.fromCharCode(65 + lettre)}${numero}`;
      if (!pris.has(code)) { return code; }
    }
  }
}

export class Magasin {
  private data: Modele;
  private listeners = new Set<Listener>();
  private ecriture: EcritureGrist | null = null;

  constructor(seed: Modele) {
    this.data = seed;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Relie ce magasin au document Grist réel (mode connecté, voir
   *  `main.ts`) : voir `EcritureGrist` ci-dessus pour le contrat. */
  brancherEcriture(ecriture: EcritureGrist): void {
    this.ecriture = ecriture;
  }

  private notifier(): void {
    for (const fn of this.listeners) { fn(); }
  }

  // --- Lecture -------------------------------------------------------------

  get equipes(): Equipe[] { return this.data.equipes; }
  get lieux(): Lieu[] { return this.data.lieux; }
  get benevoles(): Benevole[] { return this.data.benevoles; }
  get missions(): Mission[] { return this.data.missions; }
  get artistes(): Artiste[] { return this.data.artistes; }
  get macroCreneaux(): MacroCreneau[] { return this.data.macroCreneaux; }
  get sousCreneaux(): SousCreneau[] { return this.data.sousCreneaux; }
  get besoins(): Besoin[] { return this.data.besoins; }
  get groupes(): Groupe[] { return this.data.groupes; }
  get positionsGroupe(): PositionGroupe[] { return this.data.positionsGroupe; }
  get places(): Place[] { return this.data.places; }
  get disponibilites(): Disponibilite[] { return this.data.disponibilites; }
  get souhaitsMissions(): SouhaitMission[] { return this.data.souhaitsMissions; }
  get affinites(): Affinite[] { return this.data.affinites; }

  // --- Écriture : équipes ------------------------------------------------

  /** Crée une équipe (demande d'Antoine du 2026-09-22). Même discipline
   *  que `creerMission` : en mode connecté, attend l'id réel avant
   *  d'insérer localement — une équipe fraîchement créée peut aussitôt
   *  être visée par une mission. `Referent` part toujours vide : rien
   *  n'écrit encore dedans. */
  async creerEquipe(patch: Omit<Equipe, 'id' | 'Referent'>): Promise<Id> {
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
  async creerMission(patch: Omit<Mission, 'id'>): Promise<Id> {
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
  async enregistrerMacroCreneau(patch: Omit<MacroCreneau, 'id'> & {id?: Id}): Promise<Id> {
    if (patch.id != null) {
      const idx = this.data.macroCreneaux.findIndex((m) => m.id === patch.id);
      if (idx >= 0) {
        if (this.ecriture) {
          await this.ecriture.modifierMacroCreneau(patch.id, {nom: patch.Nom, debut: patch.Debut, fin: patch.Fin});
        }
        this.data.macroCreneaux[idx] = {...this.data.macroCreneaux[idx]!, ...patch, id: patch.id};
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
  async enregistrerArtiste(patch: Omit<Artiste, 'id'> & {id?: Id}): Promise<Id> {
    if (patch.id != null) {
      const idx = this.data.artistes.findIndex((a) => a.id === patch.id);
      if (idx >= 0) {
        if (this.ecriture) {
          await this.ecriture.modifierArtiste(patch.id, {nom: patch.Nom, lieuId: patch.Lieu || null, debut: patch.Debut, fin: patch.Fin});
        }
        this.data.artistes[idx] = {...this.data.artistes[idx]!, ...patch, id: patch.id};
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

  enregistrerSousCreneau(patch: Omit<SousCreneau, 'id'> & {id?: Id}): Id {
    if (patch.id != null) {
      const idx = this.data.sousCreneaux.findIndex((s) => s.id === patch.id);
      if (idx >= 0) {
        this.data.sousCreneaux[idx] = {...this.data.sousCreneaux[idx]!, ...patch, id: patch.id};
        this.notifier();
        return patch.id;
      }
    }
    const id = prochainId(this.data.sousCreneaux);
    this.data.sousCreneaux.push({...patch, id});
    this.notifier();
    return id;
  }

  supprimerSousCreneau(id: Id): void {
    this.data.sousCreneaux = this.data.sousCreneaux.filter((s) => s.id !== id);
    this.notifier();
  }

  /** Redécoupe automatiquement les sous-créneaux d'un macro-créneau existant
   *  sur toute sa plage, par pas de `dureeMinutes` (§8 point 3 : « une option
   *  pour que ça les place tout seul »). Remplace entièrement les
   *  sous-créneaux actuels du macro-créneau — utile après une création à la
   *  volée, ou pour changer la durée après coup, mais jamais quand l'un
   *  d'eux porte déjà une mission (`Besoin`) : on refuse plutôt que
   *  d'orpheliner silencieusement une affectation en cours. */
  async redecouperSousCreneaux(macroId: Id, dureeMinutes: number): Promise<{ok: true} | {ok: false; raison: string}> {
    const macro = this.data.macroCreneaux.find((m) => m.id === macroId);
    if (!macro) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }
    const actuels = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroId);
    const aUneMission = actuels.some((s) => this.data.besoins.some((b) => b.Sous_creneau === s.id));
    if (aUneMission) {
      return {
        ok: false,
        raison: 'Des missions sont déjà positionnées sur ces sous-créneaux : le redécoupage automatique n\'est pas possible sans risquer de perdre ce travail. Cette interface ne permet pas encore de les retirer.',
      };
    }
    const idsASupprimer = actuels.map((s) => s.id);
    const dureeSec = dureeMinutes * 60;
    const plages: {libelle: string; debut: Epoch; fin: Epoch}[] = [];
    for (let t = macro.Debut; t < macro.Fin; t += dureeSec) {
      const fin = Math.min(t + dureeSec, macro.Fin);
      plages.push({libelle: libelleHeurePlage(t, fin), debut: t, fin});
    }
    let idsReels: Id[];
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
              id: erreur.idsReelsCrees[i]!, Macro_creneau: macroId, Mission: null,
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
        id: idsReels[i]!, Macro_creneau: macroId, Mission: null,
        Libelle: p.libelle, Debut: p.debut, Fin: p.fin,
      });
    });
    this.notifier();
    return {ok: true};
  }

  /** Supprime un macro-créneau et ses sous-créneaux (Grist ne cascade pas —
   *  demande du fil Agenda, 2026-09-22, pour le bouton de suppression de la
   *  vue Agenda). Même garde-fou que `redecouperSousCreneaux` : refuse si
   *  l'un des sous-créneaux porte déjà une mission (`Besoin`), plutôt que
   *  d'orpheliner silencieusement une affectation en cours. */
  async supprimerMacroCreneau(macroId: Id): Promise<{ok: true} | {ok: false; raison: string}> {
    const macro = this.data.macroCreneaux.find((m) => m.id === macroId);
    if (!macro) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }
    const sousCreneauxDuMacro = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroId);
    const aUneMission = sousCreneauxDuMacro.some((s) => this.data.besoins.some((b) => b.Sous_creneau === s.id));
    if (aUneMission) {
      return {
        ok: false,
        raison: 'Des missions sont déjà positionnées sur ce macro-créneau : la suppression n\'est pas possible sans risquer de perdre ce travail.',
      };
    }
    if (this.ecriture) {
      try {
        await this.ecriture.supprimerMacroCreneau(macroId, sousCreneauxDuMacro.map((s) => s.id));
      } catch {
        return {ok: false, raison: 'Échec de l\'écriture dans le document Grist : la suppression a été annulée.'};
      }
    }
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
   *  remplacés par les siens — c'est la vue (`grille.ts`) qui applique
   *  cette règle à l'affichage, cette méthode ne fait qu'ajouter la ligne.
   *  Réutilise le pont de `redecouperSousCreneaux` (`remplacerSousCreneaux`)
   *  avec une liste de suppression vide : une création pure, un seul
   *  aller-retour, sans nouveau chemin d'écriture. */
  async creerSousCreneauMission(
    macroId: Id, missionId: Id, plage: {libelle: string; debut: Epoch; fin: Epoch},
  ): Promise<Id> {
    const nouveau = {macroCreneauId: macroId, missionId, libelle: plage.libelle, debut: plage.debut, fin: plage.fin};
    let id: Id;
    if (this.ecriture) {
      try {
        id = (await this.ecriture.remplacerSousCreneaux([], [nouveau]))[0]!;
      } catch (erreur) {
        if (!(erreur instanceof SuppressionApresCreationEchouee)) { throw erreur; }
        id = erreur.idsReelsCrees[0]!;
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

  /** Déplace un créneau propre à une mission de `deltaSecondes`, avec tous
   *  ceux de la même mission qui le suivent dans le temps — « une suite de
   *  créneaux » qu'on pousse depuis un bord, geste par défaut du glisser
   *  dans la grille Missions (demande d'Antoine du 2026-09-22). Toujours en
   *  place, même id : `redimensionnerCreneauMission` et cette méthode
   *  partagent la même raison de ne jamais supprimer-recréer que
   *  `EcritureGrist.modifierSousCreneaux`. Refuse un sous-créneau commun
   *  (`Mission: null`) : le déplacer affecterait toutes les missions qui le
   *  partagent, un geste que rien n'a demandé. */
  async deplacerCreneauxMission(
    sousCreneauId: Id, deltaSecondes: number,
  ): Promise<{ok: true} | {ok: false; raison: string}> {
    const sc = this.data.sousCreneaux.find((s) => s.id === sousCreneauId);
    if (!sc) { return {ok: false, raison: 'Sous-créneau introuvable.'}; }
    if (sc.Mission == null) { return {ok: false, raison: 'Un sous-créneau commun ne se déplace pas depuis une ligne de mission.'}; }
    if (deltaSecondes === 0) { return {ok: true}; }
    const suite = this.data.sousCreneaux.filter((s) => s.Mission === sc.Mission && s.Debut >= sc.Debut);
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
      const s = this.data.sousCreneaux.find((x) => x.id === patch.id)!;
      s.Debut = patch.debut;
      s.Fin = patch.fin;
      s.Libelle = patch.libelle;
    }
    this.notifier();
    return {ok: true};
  }

  /** Redimensionne un créneau propre à une mission (glisser en maintenant
   *  ALT, demande d'Antoine du 2026-09-22) : `depuisDebut` indique le bord
   *  tiré, la borne opposée ne bouge jamais. En place, même id (voir
   *  `deplacerCreneauxMission`). Refuse de descendre sous un quart d'heure,
   *  et un sous-créneau commun pour la même raison que le déplacement. */
  async redimensionnerCreneauMission(
    sousCreneauId: Id, depuisDebut: boolean, deltaSecondes: number,
  ): Promise<{ok: true} | {ok: false; raison: string}> {
    const sc = this.data.sousCreneaux.find((s) => s.id === sousCreneauId);
    if (!sc) { return {ok: false, raison: 'Sous-créneau introuvable.'}; }
    if (sc.Mission == null) { return {ok: false, raison: 'Un sous-créneau commun ne se redimensionne pas depuis une ligne de mission.'}; }
    if (deltaSecondes === 0) { return {ok: true}; }
    const debut = depuisDebut ? sc.Debut + deltaSecondes : sc.Debut;
    const fin = depuisDebut ? sc.Fin : sc.Fin + deltaSecondes;
    if (fin - debut < PAS_SECONDES) {
      return {ok: false, raison: "Un créneau ne peut pas durer moins d'un quart d'heure."};
    }
    const libelle = libelleHeurePlage(debut, fin);
    if (this.ecriture) {
      try {
        await this.ecriture.modifierSousCreneaux([{id: sousCreneauId, debut, fin, libelle}]);
      } catch {
        return {ok: false, raison: "Échec de l'écriture dans le document Grist connecté. Réessayez."};
      }
    }
    sc.Debut = debut;
    sc.Fin = fin;
    sc.Libelle = libelle;
    this.notifier();
    return {ok: true};
  }

  // --- Écriture : affectations ------------------------------------------------

  /** Affecte (ou vide) une place. Une place appartient à un indicatif : ceci
   *  vaut donc pour tous les besoins sur lesquels l'indicatif est positionné
   *  (§6.3). Verrouille toujours la place quand l'origine est manuelle, y
   *  compris en la vidant — même contrat que `corrigerPlace` du moteur
   *  (`moteur/affectation.ts`) : un recalcul algorithmique ne doit jamais
   *  reprendre la main sur une correction humaine sans déverrouillage
   *  explicite. Une proposition d'algorithme (origine `'Algorithme'`) ne
   *  verrouille jamais — voir `appliquerPropositionsAlgorithme`. */
  assignerPlace(placeId: Id, benevoleId: Id | null, origine: OriginePlace = 'Manuel'): void {
    const place = this.data.places.find((p) => p.id === placeId);
    if (!place) { return; }
    place.Benevole = benevoleId;
    place.Origine = origine;
    place.Score = benevoleId != null ? 1 : 0;
    if (origine === 'Manuel') { place.Verrouillee = true; }
    this.notifier();
  }

  basculerVerrouillage(placeId: Id): void {
    const place = this.data.places.find((p) => p.id === placeId);
    if (!place) { return; }
    place.Verrouillee = !place.Verrouillee;
    this.notifier();
  }

  /** Marque un bénévole absent ou de retour. Une absence libère ses places à
   *  venir (décision Antoine, §7.4) : on renvoie leurs identifiants pour que
   *  la vue jour J puisse proposer des remplaçants immédiatement. Une place
   *  verrouillée n'est jamais touchée par l'algorithme (§7.1) : on la laisse
   *  en anomalie plutôt que de la vider silencieusement. */
  definirAbsence(benevoleId: Id, absent: boolean): Id[] {
    const benevole = this.data.benevoles.find((b) => b.id === benevoleId);
    if (!benevole) { return []; }
    benevole.Statut = absent ? 'Absent' : 'Actif';
    const liberees: Id[] = [];
    if (absent) {
      for (const place of this.data.places) {
        if (place.Benevole === benevoleId && !place.Verrouillee) {
          place.Benevole = null;
          place.Origine = 'Manuel';
          place.Score = 0;
          liberees.push(place.id);
        }
      }
    }
    this.notifier();
    return liberees;
  }

  /** Déplace un positionnement d'indicatif vers un autre besoin : ne touche
   *  qu'une ligne `PositionGroupe`, jamais le reste du planning (contrainte C).
   *  `positionId`/`nouveauBesoinId` doivent déjà être réels en mode connecté
   *  (créés par ce magasin, donc via `EcritureGrist` — voir son en-tête) :
   *  une position tout juste créée dans cette même session n'est déplaçable
   *  qu'après rechargement du document. */
  async deplacerPosition(positionId: Id, nouveauBesoinId: Id): Promise<void> {
    const position = this.data.positionsGroupe.find((p) => p.id === positionId);
    if (!position) { return; }
    if (this.ecriture) { await this.ecriture.deplacerPosition(positionId, nouveauBesoinId); }
    position.Besoin = nouveauBesoinId;
    this.notifier();
  }

  async ajouterPosition(groupeId: Id, besoinId: Id): Promise<Id> {
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
    missionId: Id, sousCreneauId: Id, params: {effectifMin?: number; tailleGroupe?: number} = {},
  ): Promise<Id> {
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
  async creerGroupeSurBesoin(besoinId: Id, taille = 2): Promise<Id> {
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

  supprimerPosition(positionId: Id): void {
    this.data.positionsGroupe = this.data.positionsGroupe.filter((p) => p.id !== positionId);
    this.notifier();
  }

  /** Applique le résultat d'un calcul d'algorithme (§7.5.1) : chaque place du
   *  périmètre reçoit l'occupant proposé, verrouillée seulement si le moteur
   *  l'a demandé (jamais le cas pour une proposition d'algorithme — seule
   *  une correction manuelle verrouille, voir `logic/moteur-pont.ts`). */
  appliquerPropositionsAlgorithme(propositions: {
    placeId: Id; benevoleIdApres: Id | null; origineApres: OriginePlace; verrouilleeApres: boolean; score: number | null;
  }[]): void {
    for (const proposition of propositions) {
      const place = this.data.places.find((p) => p.id === proposition.placeId);
      if (!place) { continue; }
      place.Benevole = proposition.benevoleIdApres;
      place.Origine = proposition.origineApres;
      place.Verrouillee = proposition.verrouilleeApres;
      place.Score = proposition.score ?? 0;
    }
    this.notifier();
  }

  // --- Simulation ------------------------------------------------------------

  /** Clone profond et indépendant, pour simuler une modification (aperçu
   *  avant validation, §7.3) sans jamais toucher au magasin réel : les
   *  mutations faites sur le clone n'appellent pas ses abonnés. */
  cloner(): Magasin {
    return new Magasin(structuredClone(this.data));
  }
}
