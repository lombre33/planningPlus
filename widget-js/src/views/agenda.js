/**
 * Vue agenda : création et édition des macro-créneaux et sous-créneaux, par
 * jours ajoutés librement (§8, vue 1) — le premier écran du parcours
 * qu'Antoine veut dérouler (macro-créneaux → sous-créneaux/missions →
 * indicatifs → disponibilités → algorithme).
 *
 * Disposition horizontale (jours en lignes, temps de gauche à droite),
 * choisie par Antoine après comparaison avec une disposition verticale
 * (fil dédié). Un macro-créneau se déplace en glissant son en-tête, se
 * redimensionne en tirant son bord gauche ou droit ; son nom et ses
 * horaires se corrigent par le formulaire (icône ✎). Un document sans
 * aucun macro-créneau encore créé affiche un cadre 9h-18h vide plutôt
 * qu'une grille dégénérée (`construirePlageJournaliere`).
 */

import {t, tn, traductions} from '../i18n.js';
import {regrouperParJour} from '../logic/derive.js';
import {epochMinuitLocal} from '../temps.js';
import {h, ICONES, icone, vider} from '../ui/dom.js';
import {ouvrirModalCreationCreneau, ouvrirModalEditionCreneau} from '../ui/modalCreneau.js';
import {
  construirePlageJournaliere, graduationsHoraires, graduationsMinuit, longueurAxePx, positionCreneau,
} from './agenda-disposition.js';

traductions({
  "Échec de l'écriture dans le document Grist connecté. Réessayez.": 'Could not write to the connected Grist document. Try again.',
  'Supprimer « {nom} » ?': 'Delete “{nom}”?',
  'Supprimer « {nom} » et son sous-créneau ?': 'Delete “{nom}” and its slot?',
  'Supprimer « {nom} » et ses {n} sous-créneaux ?': 'Delete “{nom}” and its {n} slots?',
  '{n} sous-créneau': '{n} slot',
  '{n} sous-créneaux': '{n} slots',
  '{n} besoin': '{n} need',
  '{n} besoins': '{n} needs',
  '{n} binôme positionné': '{n} buddy pair placed',
  '{n} binômes positionnés': '{n} buddy pairs placed',
  '« {nom} » porte déjà du travail : {detail}. Forcer la suppression retirera tout cela ; les missions et les binômes eux-mêmes resteront, simplement libérés de ces créneaux. Continuer ?':
    '“{nom}” already has work on it: {detail}. Forcing the deletion will remove all of it; the tasks and buddy pairs themselves will remain, simply released from these slots. Continue?',
  minuit: 'midnight',
  '+ créneau': '+ time block',
  '+ Nouveau jour': '+ New day',
  // Phrase coupée par l'icône crayon : deux morceaux, chacun traduit à part,
  // l'icône restant entre les deux dans les deux langues.
  "Glissez l'en-tête d'un macro-créneau pour le déplacer, ses bords gauche/droit pour le redimensionner ; l'icône ":
    'Drag a time block’s header to move it, its left/right edges to resize it; the ',
  ' ouvre le détail.': ' icon opens the details.',
  Modifier: 'Edit',
  Supprimer: 'Delete',
  'Glisser pour changer le début': 'Drag to change the start',
  'Glisser pour changer la fin': 'Drag to change the end',
});

const PX_PAR_MINUTE = 52 / 60;
const LARGEUR_ENTETE_JOUR_PX = 120;
const HAUTEUR_LIGNE_PX = 96;
const DUREE_MIN_MINUTES = 15;

export function montrerAgenda(container, m) {
  let dernierMessage = null;

  /** Écrit vers le magasin (mode connecté : vers Grist, voir `EcritureGrist`)
   *  sans jamais laisser un échec silencieux — même contrat que la vue
   *  Indicatifs : sur un échec, le bloc glissé/redimensionné reprend sa
   *  position réelle au rafraîchissement plutôt que de rester affiché à
   *  l'endroit où la souris l'a laissé sans que rien n'ait été écrit. */
  async function ecrire(action) {
    try {
      await action();
      dernierMessage = null;
    } catch {
      dernierMessage = {texte: t("Échec de l'écriture dans le document Grist connecté. Réessayez."), ton: 'danger'};
    }
    rafraichir();
  }

  /** Confirmation puis suppression d'un macro-créneau (§8, retour Antoine
   *  2026-09-22 : rien ne permettait de le faire depuis l'agenda). Même
   *  garde-fou côté Magasin que `redecouperSousCreneaux`. Retour d'Antoine
   *  du 23/09 : un moyen de forcer quand le garde-fou refuse. Le décompte
   *  (sous-créneaux, besoins, binômes positionnés) est calculé ici, sur les
   *  données déjà en mémoire, pour l'annoncer avant le geste — la cascade
   *  elle-même reste dans `Magasin.supprimerMacroCreneau`, côté Intégration.
   *  Les missions et les binômes eux-mêmes ne sont jamais touchés : seuls
   *  leurs besoins et leurs positions sur ce macro-créneau partent. */
  async function demanderSuppressionMacro(macro) {
    const sousCreneauxDuMacro = m.sousCreneaux.filter((s) => s.Macro_creneau === macro.id);
    const sousCreneauIds = new Set(sousCreneauxDuMacro.map((s) => s.id));
    const besoinsDuMacro = m.besoins.filter((b) => sousCreneauIds.has(b.Sous_creneau));
    const besoinIds = new Set(besoinsDuMacro.map((b) => b.id));
    const positionsDuMacro = m.positionsGroupe.filter((p) => besoinIds.has(p.Besoin));
    const aDuTravail = sousCreneauxDuMacro.some((s) => s.Mission != null) || besoinsDuMacro.length > 0;

    if (!aDuTravail) {
      const nSous = sousCreneauxDuMacro.length;
      const message = nSous === 0
        ? t('Supprimer « {nom} » ?', {nom: macro.Nom})
        : tn(nSous, 'Supprimer « {nom} » et son sous-créneau ?', 'Supprimer « {nom} » et ses {n} sous-créneaux ?', {nom: macro.Nom});
      if (!window.confirm(message)) { return; }
      const resultat = await m.supprimerMacroCreneau(macro.id);
      if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
      rafraichir();
      return;
    }

    const detail = [
      tn(sousCreneauxDuMacro.length, '{n} sous-créneau', '{n} sous-créneaux'),
      besoinsDuMacro.length > 0 ? tn(besoinsDuMacro.length, '{n} besoin', '{n} besoins') : null,
      positionsDuMacro.length > 0
        ? tn(positionsDuMacro.length, '{n} binôme positionné', '{n} binômes positionnés')
        : null,
    ].filter((partie) => partie != null).join(', ');
    const message = t('« {nom} » porte déjà du travail : {detail}. Forcer la suppression retirera tout cela ; les missions et les binômes eux-mêmes resteront, simplement libérés de ces créneaux. Continuer ?', {nom: macro.Nom, detail});
    if (!window.confirm(message)) { return; }
    const resultat = await m.supprimerMacroCreneau(macro.id, true);
    if (!resultat.ok) { dernierMessage = {texte: resultat.raison, ton: 'danger'}; rafraichir(); return; }
    rafraichir();
  }

  function rafraichir() {
    vider(container);
    const jours = regrouperParJour(m.macroCreneaux);
    const plage = construirePlageJournaliere(jours.map((jour) => jour.macros));
    const largeurTotale = longueurAxePx(plage, PX_PAR_MINUTE);

    const grille = h('div', {class: 'agenda__grid'},
      h('div', {class: 'agenda__row agenda__row--axe'},
        h('div', {class: 'agenda__corner', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}}),
        h('div', {class: 'agenda__axis', style: {width: `${largeurTotale}px`}},
          ...graduationsHoraires(plage, PX_PAR_MINUTE).map((g) => (
            h('span', {class: 'agenda__axis-tick', style: {left: `${g.decalagePx}px`}}, g.libelle)
          )),
        ),
      ),
    );

    for (const jour of jours) {
      const jourDebut = epochMinuitLocal(jour.macros[0].Debut);
      const track = h('div', {
        class: 'agenda__track',
        style: {width: `${largeurTotale}px`, height: `${HAUTEUR_LIGNE_PX}px`},
      });
      for (const macro of jour.macros) {
        track.append(construireBlocMacro(macro, jourDebut, plage));
      }
      for (const decalagePx of graduationsMinuit(plage, PX_PAR_MINUTE)) {
        track.append(h('div', {class: 'agenda__minuit', style: {left: `${decalagePx}px`}}, h('span', null, t('minuit'))));
      }

      grille.append(
        h('div', {class: 'agenda__row'},
          h('div', {class: 'agenda__day-head', style: {width: `${LARGEUR_ENTETE_JOUR_PX}px`}},
            h('span', {class: 'jour'}, jour.libelle.split(' ')[0]),
            h('span', {class: 'date'}, jour.libelle),
            h('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', style: {alignSelf: 'flex-start', padding: '0'},
              onclick: () => ouvrirModalCreationCreneau(m, jour.cle),
            }, t('+ créneau')),
          ),
          track,
        ),
      );
    }

    container.append(
      h('div', {class: 'agenda'},
        h('div', {class: 'agenda__toolbar'},
          h('button', {class: 'btn btn--primary btn--sm', type: 'button', onclick: () => ouvrirModalCreationCreneau(m, null)}, t('+ Nouveau jour')),
          h('span', {class: 'view__intro', style: {margin: '0'}},
            t("Glissez l'en-tête d'un macro-créneau pour le déplacer, ses bords gauche/droit pour le redimensionner ; l'icône "),
            icone(ICONES.crayon, 'icone-texte'), t(' ouvre le détail.')),
        ),
        dernierMessage ? h('span', {class: `pill pill--${dernierMessage.ton}`}, dernierMessage.texte) : null,
        grille,
      ),
    );
  }

  function construireBlocMacro(macro, jourDebutEpoch, plage) {
    const position = positionCreneau(macro, jourDebutEpoch, plage, PX_PAR_MINUTE);
    const largeur = Math.max(28, position.longueurPx);

    const sousCreneaux = m.sousCreneaux
      .filter((s) => s.Macro_creneau === macro.id)
      .sort((a, b) => a.Debut - b.Debut);

    const entete = h('div', {class: 'macro-bloc__head'},
      h('span', null, macro.Nom),
      h('button', {
        class: 'btn btn--ghost btn--sm btn--icone', type: 'button', style: {padding: '0 2px'}, title: t('Modifier'), 'aria-label': t('Modifier'),
        onclick: (e) => { e.stopPropagation(); ouvrirModalEditionCreneau(m, macro); },
      }, icone(ICONES.crayon)),
      h('button', {
        class: 'btn btn--ghost btn--sm btn--icone', type: 'button', style: {padding: '0 2px'}, title: t('Supprimer'), 'aria-label': t('Supprimer'),
        onclick: (e) => { e.stopPropagation(); void demanderSuppressionMacro(macro); },
      }, icone(ICONES.corbeille)),
    );
    const poigneeGauche = h('div', {class: 'macro-bloc__resize macro-bloc__resize--gauche', title: t('Glisser pour changer le début')});
    const poigneeDroite = h('div', {class: 'macro-bloc__resize macro-bloc__resize--droite', title: t('Glisser pour changer la fin')});

    const bloc = h('div', {
      class: 'macro-bloc', style: {left: `${position.decalagePx}px`, width: `${largeur}px`},
    },
      poigneeGauche,
      entete,
      h('div', {class: 'macro-bloc__sous'}, ...sousCreneaux.map((sc) => construireChipSousCreneau(sc))),
      poigneeDroite,
    );

    rendreDeplacable(bloc, entete, macro, jourDebutEpoch, plage);
    rendreRedimensionnable(bloc, poigneeGauche, poigneeDroite, macro, jourDebutEpoch, plage);
    return bloc;
  }

  function construireChipSousCreneau(sc) {
    return h('div', {class: 'sous-bloc', title: sc.Libelle}, h('span', {class: 'lib'}, sc.Libelle));
  }

  function rendreDeplacable(
    bloc, poignee, macro, jourDebutEpoch, plage,
  ) {
    let enCours = false;
    let xDepart = 0;
    let leftDepart = 0;

    const onMouseMove = (e) => {
      if (!enCours) { return; }
      const delta = e.clientX - xDepart;
      bloc.style.left = `${Math.max(0, leftDepart + delta)}px`;
    };
    const onMouseUp = () => {
      if (!enCours) { return; }
      enCours = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      const leftFinal = parseFloat(bloc.style.left || '0');
      const minutesBrutes = leftFinal / PX_PAR_MINUTE + plage.minMinute;
      const minutesAjustees = Math.round(minutesBrutes / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
      const nouveauDebut = jourDebutEpoch + minutesAjustees * 60;
      const duree = macro.Fin - macro.Debut;
      void ecrire(() => m.enregistrerMacroCreneau({...macro, id: macro.id, Debut: nouveauDebut, Fin: nouveauDebut + duree}));
    };
    poignee.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') { return; }
      enCours = true;
      xDepart = e.clientX;
      leftDepart = parseFloat(bloc.style.left || '0');
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
      e.preventDefault();
    });
  }

  function rendreRedimensionnable(
    bloc, poigneeGauche, poigneeDroite,
    macro, jourDebutEpoch, plage,
  ) {
    const largeurMin = Math.max(28, DUREE_MIN_MINUTES * PX_PAR_MINUTE);

    function demarrer(depuisGauche) {
      return (e) => {
        e.preventDefault();
        e.stopPropagation();
        const xDepart = e.clientX;
        const leftDepart = parseFloat(bloc.style.left || '0');
        const largeurDepart = parseFloat(bloc.style.width || '0');

        const onMouseMove = (ev) => {
          const delta = ev.clientX - xDepart;
          if (depuisGauche) {
            const nouvelleLargeur = Math.max(largeurMin, largeurDepart - delta);
            bloc.style.left = `${leftDepart + (largeurDepart - nouvelleLargeur)}px`;
            bloc.style.width = `${nouvelleLargeur}px`;
          } else {
            bloc.style.width = `${Math.max(largeurMin, largeurDepart + delta)}px`;
          }
        };
        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          const leftFinal = parseFloat(bloc.style.left || '0');
          const largeurFinale = parseFloat(bloc.style.width || '0');
          if (depuisGauche) {
            const debutBrut = leftFinal / PX_PAR_MINUTE + plage.minMinute;
            const debutAjuste = Math.round(debutBrut / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauDebut = jourDebutEpoch + debutAjuste * 60;
            if (macro.Fin - nouveauDebut < DUREE_MIN_MINUTES * 60) { return; }
            void ecrire(() => m.enregistrerMacroCreneau({...macro, Debut: nouveauDebut}));
          } else {
            const finBrute = (leftFinal + largeurFinale) / PX_PAR_MINUTE + plage.minMinute;
            const finAjustee = Math.round(finBrute / DUREE_MIN_MINUTES) * DUREE_MIN_MINUTES;
            const nouveauFin = jourDebutEpoch + finAjustee * 60;
            if (nouveauFin - macro.Debut < DUREE_MIN_MINUTES * 60) { return; }
            void ecrire(() => m.enregistrerMacroCreneau({...macro, Fin: nouveauFin}));
          }
        };
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };
    }

    poigneeGauche.addEventListener('mousedown', demarrer(true));
    poigneeDroite.addEventListener('mousedown', demarrer(false));
  }

  const desabonner = m.subscribe(rafraichir);
  rafraichir();
  return desabonner;
}
