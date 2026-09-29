/**
 * Preuve d'équivalence entre l'effacement des types et la transpilation
 * officielle de TypeScript.
 *
 * Les deux sorties sont relues comme du JavaScript puis ramenées à une
 * empreinte : la suite des types de nœuds et de leurs valeurs, sans les
 * commentaires, sans la mise en forme et sans les parenthèses qui
 * n'enferment qu'une expression (celles que l'effacement d'un `as` laisse en
 * trop). Deux fichiers qui ont la même empreinte exécutent la même chose.
 */

/** Options de transpilation identiques à celles du widget actuel (`tsconfig.json`). */
function optionsReference(ts) {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    isolatedModules: true,
    useDefineForClassFields: true,
    verbatimModuleSyntax: false,
    removeComments: true,
    sourceMap: false,
  };
}

export function transpilerReference(ts, texte, nomFichier) {
  return ts.transpileModule(texte, {fileName: nomFichier, compilerOptions: optionsReference(ts)}).outputText;
}

/**
 * @param {typeof import('typescript')} ts
 * @param {string} texte JavaScript à résumer.
 * @param {(specificateur: string) => boolean} [ignorerImport]
 *   Imports et ré-exports à ne pas compter (feuilles de style, modules de types).
 * @returns {string[]}
 */
export function empreinte(ts, texte, ignorerImport = () => false) {
  const K = ts.SyntaxKind;
  const sf = ts.createSourceFile('x.js', texte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  const sortie = [];

  const normaliserSpecificateur = (s) => s.replace(/(\/index)?\.js$/, '');
  const valeurs = new Set([
    K.Identifier, K.PrivateIdentifier, K.StringLiteral, K.NumericLiteral, K.BigIntLiteral,
    K.RegularExpressionLiteral, K.NoSubstitutionTemplateLiteral, K.TemplateHead,
    K.TemplateMiddle, K.TemplateTail,
  ]);

  function visiter(noeud, dansSpecificateur = false) {
    if (noeud.kind === K.ParenthesizedExpression) return visiter(noeud.expression);
    if (noeud.kind === K.ImportAttributes) return undefined;
    if (noeud.kind === K.ImportDeclaration || noeud.kind === K.ExportDeclaration) {
      const litteral = noeud.moduleSpecifier;
      if (litteral && ignorerImport(litteral.text)) return undefined;
      const clause = noeud.exportClause;
      if (!litteral && clause && noeud.kind === K.ExportDeclaration && ts.isNamedExports(clause) && clause.elements.length === 0) return undefined;
    }
    let etiquette = K[noeud.kind];
    if (valeurs.has(noeud.kind)) {
      etiquette += `:${dansSpecificateur ? normaliserSpecificateur(noeud.text) : noeud.text}`;
    }
    sortie.push(`(${etiquette}`);
    const importDynamique = noeud.kind === K.CallExpression && noeud.expression.kind === K.ImportKeyword;
    ts.forEachChild(noeud, (enfant) => {
      const estSpecificateur = ((noeud.kind === K.ImportDeclaration || noeud.kind === K.ExportDeclaration) && enfant === noeud.moduleSpecifier)
        || (importDynamique && enfant === noeud.arguments[0]);
      visiter(enfant, estSpecificateur);
    });
    sortie.push(')');
    return undefined;
  }

  visiter(sf);
  return sortie;
}

/**
 * Compare l'effacement `candidat` à la transpilation officielle de `source`.
 * @returns {null | {index: number, attendu: string, obtenu: string, contexte: string}}
 */
export function comparer(ts, source, candidat, nomFichier, ignorerImportReference = () => false) {
  const reference = empreinte(ts, transpilerReference(ts, source, nomFichier), ignorerImportReference);
  const obtenu = empreinte(ts, candidat);
  const n = Math.max(reference.length, obtenu.length);
  for (let i = 0; i < n; i++) {
    if (reference[i] !== obtenu[i]) {
      const debut = Math.max(0, i - 6);
      return {
        index: i,
        attendu: reference[i] ?? '(fin)',
        obtenu: obtenu[i] ?? '(fin)',
        contexte: `référence …${reference.slice(debut, i + 4).join(' ')}\n      obtenu    …${obtenu.slice(debut, i + 4).join(' ')}`,
      };
    }
  }
  return null;
}

/** Vrai si le JavaScript ne contient aucune instruction (fichier de types seulement). */
export function estVide(ts, texte) {
  const sf = ts.createSourceFile('x.js', texte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
  return sf.statements.length === 0;
}

/** Erreurs de syntaxe d'un fichier JavaScript. */
export function erreursDeSyntaxe(ts, texte, nomFichier) {
  const resultat = ts.transpileModule(texte, {
    fileName: nomFichier,
    reportDiagnostics: true,
    compilerOptions: {allowJs: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
  });
  return (resultat.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}
