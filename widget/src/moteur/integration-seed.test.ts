/**
 * Test d'intégration sur un jeu de données réaliste, produit par le même
 * générateur que celui utilisé pour l'environnement de test Grist
 * (`dev/seed/generate.mjs`, voir `dev/README.md`). Objectif : vérifier que
 * le moteur tient la volumétrie réelle du festival d'Antoine (NF1, NF2) sans
 * erreur, de façon déterministe, et que les anomalies volontaires du
 * générateur (mission sous-staffée, conflits) ressortent bien.
 *
 * Le générateur produit des lignes au format Grist (`{_ref: n}` pour les
 * références, encodage `ChoiceList`) : `versDonneesPlanning` ci-dessous est
 * un adaptateur de test uniquement — la conversion réelle depuis un document
 * Grist vivant reste la responsabilité de l'intégration widget.
 */

import {describe, expect, it} from 'vitest';
import {genererFestival as genererFestivalBrut} from '../../../dev/seed/generate.mjs';
import {calculerAffectation} from './affectation';
import type {
  Affinite,
  Benevole,
  Besoin,
  Disponibilite,
  DonneesPlanning,
  Groupe,
  Mission,
  Place,
  PositionGroupe,
  SousCreneau,
  SouhaitMission,
} from './types';

type RefGrist = 0 | {_ref: number};

interface OptionsFestival {
  graine?: number;
  nbJours?: number;
  nbBenevoles?: number;
  nbEquipes?: number;
  nbArtistes?: number;
  dureeSousCreneauMinutes?: number;
  debut?: {annee: number; mois: number; jour: number};
  partAffectees?: number;
}

interface Festival {
  Benevoles: Array<{
    Nom: string; Equipe: RefGrist; Competences: unknown;
    Quota_heures_min: number; Quota_heures_max: number; Statut: string;
  }>;
  Missions: Array<{Nom: string; Equipe: RefGrist; Priorite: string; Competences_requises: unknown}>;
  Sous_creneaux: Array<{Macro_creneau: RefGrist; Mission: RefGrist; Debut: number; Fin: number}>;
  Besoins: Array<{
    Mission: RefGrist; Sous_creneau: RefGrist;
    Effectif_min: number; Effectif_max: number; Taille_groupe: number;
  }>;
  Groupes: Array<{Code: string; Taille: number; Equipe: RefGrist}>;
  Positions_groupe: Array<{Groupe: RefGrist; Besoin: RefGrist}>;
  Places: Array<{Groupe: RefGrist; Rang: number; Benevole: RefGrist; Origine: string; Verrouillee: boolean; Score: number}>;
  Disponibilites: Array<{Benevole: RefGrist; Quart_heure: number; Statut: string; Artiste: RefGrist}>;
  Souhaits_missions: Array<{Benevole: RefGrist; Mission: RefGrist; Preference: string}>;
  Affinites: Array<{Benevole_A: RefGrist; Benevole_B: RefGrist; Type: string}>;
}

/** Enveloppe typée autour du générateur brut (voir le commentaire sur l'import ci-dessus). */
function genererFestival(options?: OptionsFestival): Festival {
  return (genererFestivalBrut as (options?: OptionsFestival) => Festival)(options);
}

function ref(valeur: RefGrist): number | null {
  if (valeur === 0) { return null; }
  return valeur._ref + 1; // 0-based dans le générateur → 1-based ici
}

function refObligatoire(valeur: RefGrist): number {
  const id = ref(valeur);
  if (id == null) { throw new Error('Référence obligatoire manquante dans le jeu de données de test.'); }
  return id;
}

function choix(valeur: unknown): string[] {
  return Array.isArray(valeur) ? (valeur.slice(1) as string[]) : [];
}

function versDonneesPlanning(festival: ReturnType<typeof genererFestival>): DonneesPlanning {
  const benevoles: Benevole[] = festival.Benevoles.map((b, i): Benevole => ({
    id: i + 1,
    nom: b.Nom,
    equipeId: ref(b.Equipe),
    competences: choix(b.Competences),
    quotaHeuresMin: b.Quota_heures_min ?? null,
    quotaHeuresMax: b.Quota_heures_max ?? null,
    statut: b.Statut as Benevole['statut'],
  }));
  const missions: Mission[] = festival.Missions.map((m, i): Mission => ({
    id: i + 1,
    nom: m.Nom,
    equipeId: ref(m.Equipe),
    priorite: m.Priorite as Mission['priorite'],
    competencesRequises: choix(m.Competences_requises),
  }));
  const sousCreneaux: SousCreneau[] = festival.Sous_creneaux.map((s, i): SousCreneau => ({
    id: i + 1,
    macroCreneauId: refObligatoire(s.Macro_creneau),
    missionId: ref(s.Mission),
    debut: s.Debut,
    fin: s.Fin,
  }));
  const besoins: Besoin[] = festival.Besoins.map((b, i): Besoin => ({
    id: i + 1,
    missionId: refObligatoire(b.Mission),
    sousCreneauId: refObligatoire(b.Sous_creneau),
    effectifMin: b.Effectif_min,
    effectifMax: b.Effectif_max,
    tailleGroupe: b.Taille_groupe,
  }));
  const groupes: Groupe[] = festival.Groupes.map((g, i): Groupe => ({
    id: i + 1, code: g.Code, taille: g.Taille, equipeId: ref(g.Equipe),
  }));
  const positionsGroupe: PositionGroupe[] = festival.Positions_groupe.map((p, i): PositionGroupe => ({
    id: i + 1, groupeId: refObligatoire(p.Groupe), besoinId: refObligatoire(p.Besoin),
  }));
  const places: Place[] = festival.Places.map((p, i): Place => ({
    id: i + 1,
    groupeId: refObligatoire(p.Groupe),
    rang: p.Rang,
    benevoleId: ref(p.Benevole),
    origine: p.Origine as Place['origine'],
    verrouillee: p.Verrouillee,
    score: p.Score,
  }));
  const disponibilites: Disponibilite[] = festival.Disponibilites.map((d): Disponibilite => ({
    benevoleId: refObligatoire(d.Benevole),
    quartHeure: d.Quart_heure,
    statut: d.Statut as Disponibilite['statut'],
    artisteId: ref(d.Artiste),
  }));
  const souhaitsMissions: SouhaitMission[] = festival.Souhaits_missions.map((s): SouhaitMission => ({
    benevoleId: refObligatoire(s.Benevole),
    missionId: refObligatoire(s.Mission),
    preference: s.Preference as SouhaitMission['preference'],
  }));
  const affinites: Affinite[] = festival.Affinites.map((a): Affinite => ({
    benevoleAId: refObligatoire(a.Benevole_A),
    benevoleBId: refObligatoire(a.Benevole_B),
    type: a.Type as Affinite['type'],
  }));

  return {
    benevoles, missions, sousCreneaux, besoins, groupes, positionsGroupe, places,
    disponibilites, souhaitsMissions, affinites,
  };
}

describe('intégration — jeu de données réaliste (dev/seed/generate.mjs)', () => {
  it('résout le planning complet du festival par défaut (NF1) dans un temps raisonnable (NF2) et signale ses anomalies volontaires', () => {
    const festival = genererFestival(); // défauts : 70 bénévoles, 5 jours, 3 équipes, 20 artistes (le cas concret d'Antoine)
    const planning = versDonneesPlanning(festival);
    expect(planning.benevoles.length).toBe(70);

    const debut = Date.now();
    const resultat = calculerAffectation(planning);
    const dureeMs = Date.now() - debut;

    expect(Array.isArray(resultat.propositions)).toBe(true);
    expect(Array.isArray(resultat.anomalies)).toBe(true);
    // Le générateur laisse volontairement un besoin sous-staffé (voir generate.mjs) : ça doit ressortir.
    expect(resultat.anomalies.some((a) => a.code === 'sous_effectif')).toBe(true);
    // Indicatif seulement (Node, pas le navigateur visé par NF2), avec une marge large pour ne pas être fragile en CI.
    expect(dureeMs).toBeLessThan(30000);
  }, 60000);

  it('est déterministe à cette échelle : deux résolutions du même jeu de données donnent le même résultat', () => {
    const planning = versDonneesPlanning(genererFestival({nbBenevoles: 40, nbJours: 2, nbEquipes: 2, nbArtistes: 8}));
    const r1 = calculerAffectation(planning);
    const r2 = calculerAffectation(planning);
    expect(r1.propositions).toEqual(r2.propositions);
    expect(r1.anomalies).toEqual(r2.anomalies);
  }, 30000);

  it('ne double-réserve jamais un bénévole sur des quarts qui se recouvrent, une fois les propositions appliquées', () => {
    const planning = versDonneesPlanning(genererFestival({nbBenevoles: 40, nbJours: 2, nbEquipes: 2, nbArtistes: 8}));
    const resultat = calculerAffectation(planning);

    const sousCreneauParId = new Map(planning.sousCreneaux.map((s) => [s.id, s]));
    const besoinParId = new Map(planning.besoins.map((b) => [b.id, b]));
    const positionsParGroupe = new Map<number, number[]>();
    for (const position of planning.positionsGroupe) {
      const liste = positionsParGroupe.get(position.groupeId) ?? [];
      liste.push(position.besoinId);
      positionsParGroupe.set(position.groupeId, liste);
    }

    const benevoleIdParPlaceId = new Map(planning.places.map((p) => [p.id, p.benevoleId]));
    for (const proposition of resultat.propositions) {
      benevoleIdParPlaceId.set(proposition.placeId, proposition.benevoleIdApres);
    }

    const intervallesParBenevole = new Map<number, {debut: number; fin: number}[]>();
    for (const place of planning.places) {
      const benevoleId = benevoleIdParPlaceId.get(place.id);
      if (benevoleId == null) { continue; }
      for (const besoinId of positionsParGroupe.get(place.groupeId) ?? []) {
        const besoin = besoinParId.get(besoinId);
        const sousCreneau = besoin ? sousCreneauParId.get(besoin.sousCreneauId) : undefined;
        if (!sousCreneau) { continue; }
        const liste = intervallesParBenevole.get(benevoleId) ?? [];
        liste.push({debut: sousCreneau.debut, fin: sousCreneau.fin});
        intervallesParBenevole.set(benevoleId, liste);
      }
    }

    for (const [, intervalles] of intervallesParBenevole) {
      intervalles.sort((a, b) => a.debut - b.debut);
      for (let i = 1; i < intervalles.length; i++) {
        expect(intervalles[i]!.debut).toBeGreaterThanOrEqual(intervalles[i - 1]!.fin);
      }
    }
  }, 30000);
});
