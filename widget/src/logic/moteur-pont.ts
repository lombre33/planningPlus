/**
 * Pont entre le Magasin du widget et le moteur d'affectation pour « lancer
 * l'algorithme » (§7.5 point 1) : le moteur calcule sur une copie
 * `DonneesPlanning` (conversion réutilisée depuis `moteur/adaptateur-magasin`,
 * pour ne pas maintenir deux fois la même correspondance Magasin <->
 * DonneesPlanning), et ses propositions sont réappliquées telles quelles sur
 * le Magasin réel.
 */

import {versDonneesPlanning} from '../moteur/adaptateur-magasin';
import type {Magasin} from '../store';
import {
  calculerAffectation, type ParametresAlgorithme,
  type Perimetre, type ResultatAffectation,
} from '../moteur';

export interface ResumeLancement {
  resultat: ResultatAffectation;
  placesTraitees: number;
  placesRemplies: number;
  /** Présent seulement si les propositions calculées n'ont pas pu être
   *  écrites dans le document Grist connecté (`Magasin.appliquerPropositionsAlgorithme`
   *  a rejeté) : le calcul a bien eu lieu, mais rien n'a été appliqué,
   *  ni côté document ni localement — l'appelant l'affiche plutôt que de
   *  laisser croire que le remplissage a réussi. */
  echecEcriture?: string;
}

/** Lance l'algorithme sur l'état courant du Magasin et applique aussitôt ses
 *  propositions (§7.3 : le calcul se relance à volonté, sans étape de
 *  validation séparée pour ce premier remplissage — contrairement à un
 *  glisser-déposer manuel, rien ici n'est irréversible puisque rien n'est
 *  verrouillé : un second lancement peut tout reconsidérer). */
export async function lancerAlgorithme(
  m: Magasin, options?: {perimetre?: Perimetre; parametres?: ParametresAlgorithme},
): Promise<ResumeLancement> {
  const donnees = versDonneesPlanning(m);
  const resultat = calculerAffectation(donnees, options);
  const ecriture = await m.appliquerPropositionsAlgorithme(resultat.propositions);
  return {
    resultat,
    placesTraitees: resultat.propositions.length,
    placesRemplies: resultat.propositions.filter((p) => p.benevoleIdApres != null).length,
    ...(ecriture.ok ? {} : {echecEcriture: ecriture.raison}),
  };
}
