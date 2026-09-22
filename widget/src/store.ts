/**
 * Magasin en mémoire : tient le `Modele` décodé et notifie ses abonnés à
 * chaque mutation, comme le ferait un `grist.onRecords` côté widget réel.
 * Rien ici ne suppose une origine « démo » ou « Grist réel » — seule
 * `donnees/normaliser.ts` (ou son futur équivalent branché sur
 * `window.grist.docApi`) sait d'où vient le `Modele` initial.
 */

import type {
  Affinite, Artiste, Benevole, Besoin, Disponibilite, Equipe, Groupe, Id, Lieu, MacroCreneau,
  Mission, Modele, OriginePlace, Place, PositionGroupe, SouhaitMission, SousCreneau,
} from './domain/types';
import {libelleHeurePlage} from './temps';

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
 */
export interface EcritureGrist {
  /** Écrit une mission et rend l'id que Grist lui attribue — voir
   *  `Magasin.creerMission`, qui l'attend avant d'insérer localement,
   *  pour que le référentiel ne s'écarte jamais du document sur l'id
   *  d'une mission (un besoin peut aussitôt la référencer). */
  creerMission(mission: Omit<Mission, 'id'>): Promise<Id>;
}

function prochainId(lignes: {id: Id}[]): Id {
  return lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;
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

  enregistrerMacroCreneau(patch: Omit<MacroCreneau, 'id'> & {id?: Id}): Id {
    if (patch.id != null) {
      const idx = this.data.macroCreneaux.findIndex((m) => m.id === patch.id);
      if (idx >= 0) {
        this.data.macroCreneaux[idx] = {...this.data.macroCreneaux[idx]!, ...patch, id: patch.id};
        this.notifier();
        return patch.id;
      }
    }
    const id = prochainId(this.data.macroCreneaux);
    this.data.macroCreneaux.push({...patch, id});
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
  redecouperSousCreneaux(macroId: Id, dureeMinutes: number): {ok: true} | {ok: false; raison: string} {
    const macro = this.data.macroCreneaux.find((m) => m.id === macroId);
    if (!macro) { return {ok: false, raison: 'Macro-créneau introuvable.'}; }
    const actuels = this.data.sousCreneaux.filter((s) => s.Macro_creneau === macroId);
    const aUneMission = actuels.some((s) => this.data.besoins.some((b) => b.Sous_creneau === s.id));
    if (aUneMission) {
      return {ok: false, raison: 'Des missions sont déjà rattachées à ces sous-créneaux : supprimez-les avant de redécouper.'};
    }
    this.data.sousCreneaux = this.data.sousCreneaux.filter((s) => s.Macro_creneau !== macroId);
    const dureeSec = dureeMinutes * 60;
    for (let t = macro.Debut; t < macro.Fin; t += dureeSec) {
      const fin = Math.min(t + dureeSec, macro.Fin);
      this.data.sousCreneaux.push({
        id: prochainId(this.data.sousCreneaux), Macro_creneau: macroId, Mission: null,
        Libelle: libelleHeurePlage(t, fin), Debut: t, Fin: fin,
      });
    }
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
   *  qu'une ligne `PositionGroupe`, jamais le reste du planning (contrainte C). */
  deplacerPosition(positionId: Id, nouveauBesoinId: Id): void {
    const position = this.data.positionsGroupe.find((p) => p.id === positionId);
    if (!position) { return; }
    position.Besoin = nouveauBesoinId;
    this.notifier();
  }

  ajouterPosition(groupeId: Id, besoinId: Id): Id {
    const id = prochainId(this.data.positionsGroupe);
    this.data.positionsGroupe.push({id, Groupe: groupeId, Besoin: besoinId});
    this.notifier();
    return id;
  }

  /** Crée un nouveau besoin (mission × sous-créneau) et lui positionne
   *  aussitôt un premier binôme (§6.3 : un besoin ne naît jamais sans son
   *  indicatif de base — sans ça, arrivé à l'étape « placer les indicatifs »
   *  du parcours, il faudrait poser un binôme à la main sur chaque case
   *  créée, exactement la corvée que le mécanisme des indicatifs épargne).
   *  Les places du binôme restent vides (Benevole: null) : seul le
   *  positionnement est automatique, pas l'affectation d'un bénévole précis.
   *  Effectif_max reprend la taille du binôme par défaut ; un second binôme
   *  (donc un effectif plus large) s'ajoute ensuite explicitement via
   *  `creerGroupeSurBesoin`, comme aujourd'hui. Ne rien créer sur une case
   *  reste le geste pour une zone volontairement non couverte : cette
   *  méthode n'est jamais appelée automatiquement. */
  creerBesoin(
    missionId: Id, sousCreneauId: Id, params: {effectifMin?: number; tailleGroupe?: number} = {},
  ): Id {
    const tailleGroupe = params.tailleGroupe ?? 2;
    const effectifMin = params.effectifMin ?? tailleGroupe;
    const id = prochainId(this.data.besoins);
    this.data.besoins.push({
      id, Mission: missionId, Sous_creneau: sousCreneauId,
      Effectif_min: effectifMin, Effectif_max: Math.max(tailleGroupe, effectifMin), Taille_groupe: tailleGroupe,
    });
    this.creerGroupeSurBesoin(id, tailleGroupe);
    return id;
  }

  /** Crée un nouvel indicatif (un `Groupe` de `taille` places vides) et le
   *  positionne sur `besoinId` : c'est le « + binôme » d'un besoin qui a
   *  déjà son binôme par défaut (§6.3, dimensionnement — un second binôme
   *  s'ajoute explicitement plutôt que d'agrandir le premier). L'équipe du
   *  nouvel indicatif reprend celle de la mission du besoin. */
  creerGroupeSurBesoin(besoinId: Id, taille = 2): Id {
    const besoin = this.data.besoins.find((b) => b.id === besoinId);
    if (!besoin) { return -1; }
    const mission = this.data.missions.find((mi) => mi.id === besoin.Mission);
    const equipeId = mission?.Equipe ?? this.data.equipes[0]?.id ?? 0;
    const equipe = this.data.equipes.find((e) => e.id === equipeId);
    const prefixe = (equipe?.Nom ?? 'XX').slice(0, 2).toUpperCase();
    const numero = this.data.groupes.length + 1;

    const groupeId = prochainId(this.data.groupes);
    this.data.groupes.push({
      id: groupeId, Code: `${prefixe}${String(numero).padStart(2, '0')}`,
      Taille: taille, Equipe: equipeId, Notes: '',
    });
    for (let rang = 1; rang <= taille; rang++) {
      this.data.places.push({
        id: prochainId(this.data.places), Groupe: groupeId, Rang: rang,
        Benevole: null, Origine: 'Manuel', Verrouillee: false, Score: 0,
      });
    }
    this.data.positionsGroupe.push({id: prochainId(this.data.positionsGroupe), Groupe: groupeId, Besoin: besoinId});
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
