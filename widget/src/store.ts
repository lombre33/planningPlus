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

type Listener = () => void;

function prochainId(lignes: {id: Id}[]): Id {
  return lignes.reduce((max, l) => Math.max(max, l.id), 0) + 1;
}

export class Magasin {
  private data: Modele;
  private listeners = new Set<Listener>();

  constructor(seed: Modele) {
    this.data = seed;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
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

  // --- Écriture : affectations ------------------------------------------------

  /** Affecte (ou vide) une place. Une place appartient à un indicatif : ceci
   *  vaut donc pour tous les besoins sur lesquels l'indicatif est positionné
   *  (§6.3). */
  assignerPlace(placeId: Id, benevoleId: Id | null, origine: OriginePlace = 'Manuel'): void {
    const place = this.data.places.find((p) => p.id === placeId);
    if (!place) { return; }
    place.Benevole = benevoleId;
    place.Origine = origine;
    place.Score = benevoleId != null ? 1 : 0;
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

  // --- Simulation ------------------------------------------------------------

  /** Clone profond et indépendant, pour simuler une modification (aperçu
   *  avant validation, §7.3) sans jamais toucher au magasin réel : les
   *  mutations faites sur le clone n'appellent pas ses abonnés. */
  cloner(): Magasin {
    return new Magasin(structuredClone(this.data));
  }
}
