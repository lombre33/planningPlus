/**
 * Retouches du texte source avant l'effacement des types. Elles ne touchent ni
 * au code ni aux types : seulement des noms de fichiers cités dans la
 * documentation, qui changent d'extension dans le dossier produit.
 *
 * On les applique au texte TypeScript lui-même. La preuve d'équivalence
 * (`equivalence.mjs`) compare ensuite la transpilation du texte retouché au
 * résultat de l'effacement : elle ne peut donc pas passer sur une retouche qui
 * changerait autre chose que ce qui est déclaré ici.
 */

/** Nom `.ts` cité dans un commentaire ou un titre de test : `app.ts`, `views/grille.ts`, `grille.test.ts`. */
const MOTIF_MENTION = /(?<![\w./@-])((?:\.{1,2}\/)*(?:[\w-]+\/)*[\w-]+(?:\.test)?)\.ts(?![\w-])/g;
/** Le suffixe seul : « pas de suffixe `.test.ts` ». */
const MOTIF_SUFFIXE_TEST = /(?<![\w./@-])\.test\.ts(?![\w-])/g;

/**
 * Plages de texte où l'on corrige les mentions : les commentaires et les
 * titres de `describe` / `it` / `test`.
 */
function plagesDeDocumentation(ts, texte, nomFichier) {
  const K = ts.SyntaxKind;
  const sf = ts.createSourceFile(nomFichier, texte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const plages = new Map();

  const parcourirJetons = (n) => {
    if (n.kind >= K.FirstJSDocNode && n.kind <= K.LastJSDocNode) return;
    for (const c of ts.getLeadingCommentRanges(texte, n.pos) ?? []) plages.set(c.pos, {debut: c.pos, fin: c.end});
    for (const c of ts.getTrailingCommentRanges(texte, n.pos) ?? []) plages.set(c.pos, {debut: c.pos, fin: c.end});
    n.getChildren(sf).forEach(parcourirJetons);
  };
  parcourirJetons(sf);

  const parcourirTitres = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && ['describe', 'it', 'test'].includes(n.expression.text)) {
      const titre = n.arguments[0];
      const litteraux = (t) => {
        if (ts.isStringLiteral(t) || ts.isNoSubstitutionTemplateLiteral(t)) plages.set(t.getStart(sf), {debut: t.getStart(sf), fin: t.end});
        else if (ts.isBinaryExpression(t) && t.operatorToken.kind === K.PlusToken) { litteraux(t.left); litteraux(t.right); }
        else if (ts.isParenthesizedExpression(t)) litteraux(t.expression);
      };
      if (titre) litteraux(titre);
    }
    ts.forEachChild(n, parcourirTitres);
  };
  parcourirTitres(sf);
  return [...plages.values()];
}

/**
 * @param {typeof import('typescript')} ts
 * @param {string} texte
 * @param {string} nomFichier
 * @param {(mention: string) => 'js' | 'd.ts' | null} genreMention
 *   Reçoit un nom cité sans son extension et rend l'extension du fichier
 *   correspondant dans le dossier produit, `null` s'il ne faut rien changer.
 * @returns {{texte: string, corrigees: number}}
 */
export function reecrireMentionsTs(ts, texte, nomFichier, genreMention) {
  const editions = [];
  for (const {debut, fin} of plagesDeDocumentation(ts, texte, nomFichier)) {
    editions.push(...editionsDeMentions(texte.slice(debut, fin), debut, genreMention));
  }
  return {texte: appliquer(texte, editions), corrigees: editions.length};
}

/** Même correction dans les commentaires d'une feuille de style. */
export function reecrireMentionsCss(texte, genreMention) {
  const editions = [];
  for (const c of texte.matchAll(/\/\*[\s\S]*?\*\//g)) editions.push(...editionsDeMentions(c[0], c.index, genreMention));
  return {texte: appliquer(texte, editions), corrigees: editions.length};
}

/** Éditions à faire dans `extrait`, qui commence à `decalage` dans le texte entier. */
function editionsDeMentions(extrait, decalage, genreMention) {
  const editions = [];
  for (const m of extrait.matchAll(MOTIF_MENTION)) {
    const genre = genreMention(m[1].replace(/^(\.{1,2}\/)+/, ''));
    if (!genre) continue;
    const point = decalage + m.index + m[1].length;
    editions.push(genre === 'js' ? {debut: point + 1, fin: point + 3, texte: 'js'} : {debut: point, fin: point, texte: '.d'});
  }
  for (const m of extrait.matchAll(MOTIF_SUFFIXE_TEST)) {
    editions.push({debut: decalage + m.index + m[0].length - 2, fin: decalage + m.index + m[0].length, texte: 'js'});
  }
  return editions;
}

function appliquer(texte, editions) {
  let resultat = texte;
  for (const e of [...editions].sort((a, b) => b.debut - a.debut)) {
    resultat = resultat.slice(0, e.debut) + e.texte + resultat.slice(e.fin);
  }
  return resultat;
}

/**
 * Remplacements exacts, déclarés un à un (messages d'usage des scripts). Chacun
 * doit s'appliquer exactement `fois` fois : sinon la source a changé et la
 * liste doit être relue.
 * @param {{fichier: string, de: string, vers: string, fois?: number}[]} retouches
 * @param {string} cheminRelatif chemin du fichier sous `widget/`
 */
export function appliquerRetouches(texte, retouches, cheminRelatif) {
  let resultat = texte;
  for (const r of retouches.filter((x) => x.fichier === cheminRelatif)) {
    const attendu = r.fois ?? 1;
    const trouve = resultat.split(r.de).length - 1;
    if (trouve !== attendu) {
      throw new Error(`${cheminRelatif} — retouche déclarée ${attendu} fois, trouvée ${trouve} fois : ${JSON.stringify(r.de.slice(0, 70))}`);
    }
    resultat = resultat.split(r.de).join(r.vers);
  }
  return resultat;
}
