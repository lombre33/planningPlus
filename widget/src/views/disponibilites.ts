/**
 * Vue Disponibilités : une grille bénévoles × quart d'heure, un jour à la
 * fois (cahier des charges §8.10). Trois usages désormais superposés sur la
 * même grille de lecture, sans rien lui retirer :
 *  - consultation (comportement d'origine, inchangé) ;
 *  - réglages d'import (§6.4, demande d'Antoine du 2026-09-23) : associer
 *    les colonnes que lui-même a ajoutées à sa table Bénévoles (souhaits
 *    d'artistes, réponse par macro-créneau) à PlanningPlus, puis importer —
 *    en lecture seule sur ses colonnes, jamais une modification ;
 *  - édition manuelle quart d'heure par quart d'heure (mode édition,
 *    désactivé par défaut), pour le cas qu'un import ne sait pas classer
 *    automatiquement ("disponible mais…").
 *
 * Densité assumée (jusqu'à 70 lignes × quelques dizaines de colonnes) :
 * en-tête et colonne des noms fixes au défilement, une teinte par état
 * (disponible / indisponible / veut voir un artiste), infobulle pour le
 * détail exact (heure, artiste souhaité).
 */

import type {Epoch, Id, MacroCreneau} from '../domain/types';
import {decoderListe} from '../grist';
import {indexer} from '../logic/derive';
import {
  blocsDuJour, contraintesBenevole, estHeurePleine, graviteContraintes, indexerDisponibilitesParBenevole,
  libelleContraintes, quartsEntre, regrouperParJourCourt, statutCellule,
} from '../logic/dispos-terrain';
import {disponibilitesApresBasculement} from '../logic/edition-disponibilites';
import {
  disponibilitesDepuisReponseMacroCreneau, disponibilitesDepuisSouhaitsArtistes, fusionnerDisponibilites,
  LIBELLES_REPONSE_PAR_DEFAUT,
} from '../logic/import-disponibilites';
import {
  CLE_COLONNE_SOUHAITS_ARTISTES, CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, CLE_LIBELLE_TOUT_LE_CRENEAU,
  cleColonneReponseMacroCreneau, type ColonneTable, colonnesEligibles,
} from '../logic/parametres-benevoles';
import type {Magasin} from '../store';
import {libelleHeure} from '../temps';
import {h, vider} from '../ui/dom';

const LIBELLE_STATUT: Record<'Disponible' | 'Indisponible' | 'Artiste', string> = {
  Disponible: 'disponible',
  Indisponible: 'indisponible',
  Artiste: 'veut voir un artiste',
};

/** Identifiant réel de la table Bénévoles côté document Grist. Le nom de
 *  schéma sert de repli en l'absence de résolution exposée à cette couche
 *  (même convention que `main.ts:215`, `resolution.Disponibilites ??
 *  'Disponibilites'`) : ne casse que si Antoine renomme la TABLE elle-même
 *  (pas une de ses colonnes, toujours supporté). */
const TABLE_BENEVOLES = 'Benevoles';

function champ(libelle: string, entree: Node): Node {
  return h('div', {style: {marginBottom: '10px'}},
    h('label', {style: {display: 'block', fontWeight: '600', marginBottom: '4px'}}, libelle),
    entree,
  );
}

export function montrerDisponibilites(container: HTMLElement, m: Magasin): () => void {
  let jourCle: string | null = null;
  let equipeFiltre: Id | 'toutes' = 'toutes';
  let recherche = '';
  let modeEdition = false;
  let panneauOuvert = false;
  let importEnCours = false;
  let dernierMessage: {texte: string; ton: 'ok' | 'danger'} | null = null;
  let colonnesBenevoles: ColonneTable[] | 'chargement' | 'erreur' | null = null;

  function chargerColonnesSiBesoin(): void {
    if (colonnesBenevoles != null) { return; }
    colonnesBenevoles = 'chargement';
    m.colonnesTable(TABLE_BENEVOLES)
      .then((colonnes) => { colonnesBenevoles = colonnes; rafraichir(); })
      .catch(() => { colonnesBenevoles = 'erreur'; rafraichir(); });
  }

  function optionsColonnes(valeurActuelle: string | undefined): Node[] {
    const options = [h('option', {value: ''}, '— aucune —')];
    if (Array.isArray(colonnesBenevoles)) {
      for (const c of colonnesEligibles(colonnesBenevoles)) {
        options.push(h('option', {value: c.colId, selected: c.colId === valeurActuelle}, `${c.label} (${c.colId})`));
      }
    }
    return options;
  }

  /** Menu déroulant sur les colonnes réelles de la table Bénévoles quand
   *  elles ont pu être lues ; repli en champ texte sinon (échec de lecture,
   *  ou le temps du chargement), jamais un écran bloqué. */
  function champColonne(cle: string, aria: string): Node {
    const valeurActuelle = m.parametre(cle);
    if (Array.isArray(colonnesBenevoles)) {
      return h('select', {
        class: 'select', 'aria-label': aria,
        onchange: (e: Event) => { void m.definirParametre(cle, (e.target as HTMLSelectElement).value); },
      }, ...optionsColonnes(valeurActuelle));
    }
    return h('input', {
      class: 'input', type: 'text', placeholder: 'identifiant de colonne (ex. Dispo_Vendredi)', 'aria-label': aria,
      defaultValue: valeurActuelle ?? '',
      onchange: (e: Event) => { void m.definirParametre(cle, (e.target as HTMLInputElement).value.trim()); },
    });
  }

  async function basculerCellule(benevoleId: Id, macro: MacroCreneau, quart: Epoch): Promise<void> {
    const quarts = quartsEntre(macro.Debut, macro.Fin);
    const indexActuel = indexerDisponibilitesParBenevole(m.disponibilites).get(benevoleId) ?? new Map();
    const nouvelles = disponibilitesApresBasculement(benevoleId, quarts, indexActuel, quart);
    try {
      await m.remplacerDisponibilites(benevoleId, macro.Debut, macro.Fin, nouvelles);
    } catch {
      dernierMessage = {texte: "Échec de l'écriture dans le document Grist connecté. Réessaie.", ton: 'danger'};
      rafraichir();
    }
  }

  /** Import (§6.4, points A et B) : pour chaque bénévole, lit sa réponse de
   *  chaque macro-créneau associé et ses souhaits d'artiste, puis remplace
   *  ses disponibilités macro-créneau par macro-créneau (jamais en un seul
   *  remplacement global : ça préserverait de la place aux quarts d'heure
   *  hors de tout macro-créneau mappé, jamais touchés ici). Une réponse non
   *  reconnue ("disponible mais…") n'écrit rien : elle reste à saisir à la
   *  main, en mode édition. */
  async function importerDisponibilites(): Promise<void> {
    const colSouhaits = m.parametre(CLE_COLONNE_SOUHAITS_ARTISTES);
    const libelles = {
      toutLeCreneau: [m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0]!],
      pasDisponibleDuTout: [
        m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0]!,
      ],
    };
    const macrosMappes = m.macroCreneaux
      .map((macro) => ({macro, colId: m.parametre(cleColonneReponseMacroCreneau(macro.id))}))
      .filter((x): x is {macro: MacroCreneau; colId: string} => Boolean(x.colId));

    if (macrosMappes.length === 0 && !colSouhaits) {
      dernierMessage = {texte: "Associe au moins une colonne ci-dessus avant d'importer.", ton: 'danger'};
      rafraichir();
      return;
    }

    importEnCours = true;
    dernierMessage = null;
    rafraichir();
    try {
      const valeursSouhaits = colSouhaits
        ? await m.valeursColonneBrute(TABLE_BENEVOLES, colSouhaits)
        : new Map<Id, unknown>();
      const valeursParMacro = new Map<Id, Map<Id, unknown>>();
      for (const {macro, colId} of macrosMappes) {
        valeursParMacro.set(macro.id, await m.valeursColonneBrute(TABLE_BENEVOLES, colId));
      }

      let nbManuels = 0;
      for (const benevole of m.benevoles) {
        const nomsSouhaites = decoderListe(valeursSouhaits.get(benevole.id));
        const surcharges = disponibilitesDepuisSouhaitsArtistes(benevole.id, nomsSouhaites, m.artistes);
        for (const {macro} of macrosMappes) {
          const brut = valeursParMacro.get(macro.id)!.get(benevole.id);
          const reponse = typeof brut === 'string' ? brut : null;
          const resultat = disponibilitesDepuisReponseMacroCreneau(benevole.id, macro, reponse, libelles);
          if (resultat.statut === 'Manuelle') { nbManuels++; continue; }
          const surchargesDeCeMacro = surcharges.filter((d) => d.Quart_heure >= macro.Debut && d.Quart_heure < macro.Fin);
          await m.remplacerDisponibilites(
            benevole.id, macro.Debut, macro.Fin, fusionnerDisponibilites(resultat.disponibilites, surchargesDeCeMacro),
          );
        }
      }
      dernierMessage = {
        texte: nbManuels > 0
          ? `Import terminé. ${nbManuels} réponse${nbManuels > 1 ? 's' : ''} non reconnue${nbManuels > 1 ? 's' : ''} — à saisir à la main (mode édition, ci-dessus).`
          : 'Import terminé.',
        ton: nbManuels > 0 ? 'danger' : 'ok',
      };
    } catch {
      dernierMessage = {texte: "Échec de l'import. Vérifie les colonnes associées puis réessaie.", ton: 'danger'};
    } finally {
      importEnCours = false;
      rafraichir();
    }
  }

  function construirePanneauReglages(): Node {
    chargerColonnesSiBesoin();
    const macrosTries = [...m.macroCreneaux].sort((a, b) => a.Debut - b.Debut);

    return h('div', {class: 'card', style: {marginBottom: '12px'}},
      h('h3', {style: {marginTop: '0'}}, "Réglages d'import"),
      h('p', {class: 'view__intro'},
        "Associe les colonnes que tu as toi-même ajoutées à ta table Bénévoles. Elles ne sont jamais modifiées, "
        + 'seulement lues.',
      ),
      colonnesBenevoles === 'chargement' ? h('p', {class: 'empty'}, 'Lecture des colonnes de ta table Bénévoles…') : null,
      colonnesBenevoles === 'erreur'
        ? h('p', {class: 'pill pill--warn'}, "Impossible de lire la liste de tes colonnes pour l'instant — tape l'identifiant à la main ci-dessous.")
        : null,
      champ("Colonne des souhaits d'artistes (choix multiple)", champColonne(CLE_COLONNE_SOUHAITS_ARTISTES, "Colonne des souhaits d'artistes")),
      macrosTries.length === 0
        ? h('p', {class: 'empty'}, "Crée d'abord tes macro-créneaux (vue Agenda) pour associer une colonne de réponse par créneau.")
        : h('div', null, ...macrosTries.map((macro) => champ(
            `${macro.Nom} (${libelleHeure(macro.Debut)})`,
            champColonne(cleColonneReponseMacroCreneau(macro.id), `Colonne de réponse pour ${macro.Nom}`),
          ))),
      champ('Libellé "disponible sur tout le créneau"', h('input', {
        class: 'input', type: 'text',
        defaultValue: m.parametre(CLE_LIBELLE_TOUT_LE_CRENEAU) ?? LIBELLES_REPONSE_PAR_DEFAUT.toutLeCreneau[0],
        onchange: (e: Event) => { void m.definirParametre(CLE_LIBELLE_TOUT_LE_CRENEAU, (e.target as HTMLInputElement).value); },
      })),
      champ('Libellé "pas disponible du tout"', h('input', {
        class: 'input', type: 'text',
        defaultValue: m.parametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT) ?? LIBELLES_REPONSE_PAR_DEFAUT.pasDisponibleDuTout[0],
        onchange: (e: Event) => { void m.definirParametre(CLE_LIBELLE_PAS_DISPONIBLE_DU_TOUT, (e.target as HTMLInputElement).value); },
      })),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button', disabled: importEnCours,
        onclick: () => { void importerDisponibilites(); },
      }, importEnCours ? 'Import en cours…' : 'Importer les disponibilités'),
      dernierMessage ? h('p', {class: `pill pill--${dernierMessage.ton}`, style: {marginTop: '8px'}}, dernierMessage.texte) : null,
    );
  }

  function rafraichir(): void {
    const ix = indexer(m);
    const jours = regrouperParJourCourt(m.macroCreneaux);
    if (jourCle == null || !jours.some((j) => j.cle === jourCle)) {
      jourCle = jours[0]?.cle ?? null;
    }
    vider(container);

    if (panneauOuvert) { container.append(construirePanneauReglages()); }

    const barre = h('div', {class: 'dispos-barre'},
      h('div', {class: 'dispos-jours', role: 'tablist', 'aria-label': 'Jour'},
        ...jours.map((j) => h('button', {
          class: 'dispos-jour-tab', type: 'button', role: 'tab',
          'aria-selected': String(j.cle === jourCle),
          onclick: () => { jourCle = j.cle; rafraichir(); },
        }, j.libelle)),
      ),
      h('div', {class: 'dispos-barre__filtres'},
        h('select', {
          class: 'select', 'aria-label': 'Filtrer par équipe',
          onchange: (e: Event) => {
            const v = (e.target as HTMLSelectElement).value;
            equipeFiltre = v === 'toutes' ? 'toutes' : Number(v);
            rafraichir();
          },
        },
          h('option', {value: 'toutes', selected: equipeFiltre === 'toutes'}, 'Toutes les équipes'),
          ...m.equipes.map((eq) => h('option', {value: String(eq.id), selected: equipeFiltre === eq.id}, eq.Nom)),
        ),
        h('input', {
          class: 'input', type: 'search', placeholder: 'Rechercher un bénévole…', value: recherche,
          oninput: (e: Event) => { recherche = (e.target as HTMLInputElement).value; rafraichir(); },
        }),
        h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: () => { panneauOuvert = !panneauOuvert; rafraichir(); },
        }, panneauOuvert ? "Fermer les réglages" : "Réglages d'import"),
        h('label', {style: {display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '8px'}},
          h('input', {
            type: 'checkbox', checked: modeEdition,
            onchange: (e: Event) => { modeEdition = (e.target as HTMLInputElement).checked; rafraichir(); },
          }),
          'Mode édition',
        ),
      ),
      h('div', {class: 'dispos-legende'},
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--disponible'}), 'Disponible'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--artiste'}), 'Veut voir un artiste'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'dispos-cellule dispos-cellule--indisponible'}), 'Indisponible'),
        h('span', {class: 'dispos-legende__item'}, h('span', {class: 'contrainte-badge contrainte-badge--danger'}, '!'), 'Contrainte déclarée (survoler le nom)'),
      ),
    );
    container.append(barre);

    if (!jourCle) {
      container.append(h('p', {class: 'empty'}, 'Aucun macro-créneau : rien à afficher.'));
      return;
    }
    const jour = jours.find((j) => j.cle === jourCle)!;
    const blocs = blocsDuJour(jour).filter((b) => b.quarts.length > 0);

    const benevoles = m.benevoles
      .filter((b) => equipeFiltre === 'toutes' || b.Equipe === equipeFiltre)
      .filter((b) => recherche.trim() === '' || b.Nom.toLowerCase().includes(recherche.trim().toLowerCase()))
      .sort((a, b) => a.Nom.localeCompare(b.Nom, 'fr'));

    if (blocs.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Ce jour ne couvre aucun quart d’heure.'));
      return;
    }
    if (benevoles.length === 0) {
      container.append(h('p', {class: 'empty'}, 'Aucun bénévole ne correspond à ce filtre.'));
      return;
    }

    const indexDispos = indexerDisponibilitesParBenevole(m.disponibilites);

    const theadCellules: Node[] = [h('th', {class: 'dispos-table__coin', scope: 'col'}, 'Bénévole')];
    blocs.forEach((bloc, iBloc) => {
      bloc.quarts.forEach((q, iQuart) => {
        const limiteMacro = iQuart === 0 && iBloc > 0;
        theadCellules.push(h('th', {
          class: `dispos-table__heure${limiteMacro ? ' dispos-table__heure--limite-macro' : ''}`,
          scope: 'col',
          title: iQuart === 0 ? bloc.macro.Nom : undefined,
        }, estHeurePleine(q) ? libelleHeure(q) : ''));
      });
    });

    const lignes = benevoles.map((b) => {
      const equipe = ix.equipe.get(b.Equipe)!;
      const contraintes = contraintesBenevole(m, ix, b.id);
      const gravite = graviteContraintes(contraintes);
      const cellules = blocs.flatMap((bloc, iBloc) => bloc.quarts.map((q, iQuart) => {
        const {statut, artisteId} = statutCellule(indexDispos, b.id, q);
        const artisteNom = artisteId != null ? ix.artiste.get(artisteId)?.Nom : undefined;
        const classe = statut === 'Disponible' ? 'disponible' : statut === 'Artiste' ? 'artiste' : 'indisponible';
        const limiteMacro = iQuart === 0 && iBloc > 0;
        const detail = artisteNom ? `veut voir ${artisteNom}` : LIBELLE_STATUT[statut];
        return h('td', {
          class: `dispos-cellule dispos-cellule--${classe}${limiteMacro ? ' dispos-cellule--limite-macro' : ''}`,
          title: `${b.Nom} · ${libelleHeure(q)} · ${detail}${modeEdition ? ' · cliquer pour basculer' : ''}`,
          style: modeEdition ? {cursor: 'pointer'} : undefined,
          onclick: modeEdition ? () => { void basculerCellule(b.id, bloc.macro, q); } : undefined,
        });
      }));
      return h('tr', null,
        h('th', {class: 'dispos-table__benevole', scope: 'row'},
          h('span', {class: 'dot', style: {background: equipe.Couleur}}),
          b.Nom,
          gravite ? h('span', {
            class: `contrainte-badge contrainte-badge--${gravite}`,
            title: libelleContraintes(contraintes) ?? undefined,
          }, '!') : null,
        ),
        ...cellules,
      );
    });

    container.append(
      h('div', {class: 'dispos-scroll'},
        h('table', {class: 'dispos-table'},
          h('thead', null, h('tr', null, ...theadCellules)),
          h('tbody', null, ...lignes),
        ),
      ),
      h('p', {class: 'view__intro', style: {marginTop: '10px', marginBottom: '0'}},
        `${benevoles.length} bénévole${benevoles.length > 1 ? 's' : ''} affiché${benevoles.length > 1 ? 's' : ''}. Une case sans donnée vaut indisponible (§6.4 du cahier des charges) : seule une disponibilité déclarée ouvre la possibilité d'une affectation.`,
      ),
    );
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
