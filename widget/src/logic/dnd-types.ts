/**
 * Types MIME personnalisés du glisser-déposer d'affectation : un bénévole
 * déposé sur une place (`TYPE_BENEVOLE_DRAG`), ou une place déposée sur une
 * autre pour échanger leurs occupants (`TYPE_PLACE_DRAG`). Partagés entre
 * toutes les vues qui proposent ce geste (`views/affectation.ts`,
 * `views/grille.ts`) pour qu'il se comporte identiquement partout où il
 * apparaît (retour d'Antoine : « du glisser-déposer partout »).
 */

export const TYPE_BENEVOLE_DRAG = 'application/x-planningplus-benevole';
export const TYPE_PLACE_DRAG = 'application/x-planningplus-place';
