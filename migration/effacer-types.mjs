/**
 * Effacement des types TypeScript par suppression de plages de texte.
 *
 * `ts.transpileModule` réimprime le fichier entier (indentation à 4 espaces,
 * lignes vides perdues) : le résultat ne se relit pas comme du code écrit à la
 * main. Ici on ne retire que la syntaxe de types (annotations, `as`, `!`,
 * génériques, interfaces, imports de types…) ; tout le reste du fichier —
 * commentaires, mise en page, guillemets — reste identique au caractère près.
 *
 * Ce module ne dépend que de l'API de TypeScript, passée en argument. La
 * preuve que l'effacement ne change pas le comportement se fait ailleurs
 * (`equivalence.mjs`) : on compare l'arbre du résultat à celui que produit la
 * transpilation officielle.
 */

const MODIFICATEURS_TYPES = new Set([
  'PublicKeyword', 'PrivateKeyword', 'ProtectedKeyword', 'ReadonlyKeyword',
  'AbstractKeyword', 'OverrideKeyword', 'DeclareKeyword',
]);

/**
 * @param {typeof import('typescript')} ts
 * @param {string} texte      Source TypeScript.
 * @param {string} nomFichier Nom, pour les messages d'erreur.
 * @param {object} [options]
 * @param {(specificateur: string) => string | null | undefined} [options.reecrireSpecificateur]
 *   Reçoit un spécificateur relatif sans extension (`./store`) et rend le
 *   suffixe à lui ajouter (`.js` ou `/index.js`), `null` s'il n'y a rien à
 *   ajouter, `undefined` s'il ne mène à aucun fichier.
 * @param {(specificateur: string) => boolean} [options.estModuleSansCode]
 *   Vrai si le spécificateur vise un module qui ne contient que des types :
 *   son import (ou ré-export) est alors supprimé plutôt que réécrit.
 * @returns {{code: string, cssImportes: string[], jsonImportes: string[], parametresPropriete: number}}
 */
export function effacerTypes(ts, texte, nomFichier, options = {}) {
  const {reecrireSpecificateur = () => null, estModuleSansCode = () => false} = options;
  const K = ts.SyntaxKind;
  const sf = ts.createSourceFile(nomFichier, texte, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

  /** @type {{debut: number, fin: number, texte: string}[]} */
  const modifications = [];
  const cssImportes = [];
  const jsonImportes = [];
  let parametresPropriete = 0;

  const echec = (position, message) => {
    const ligne = sf.getLineAndCharacterOfPosition(position).line + 1;
    throw new Error(`${nomFichier}:${ligne} — ${message}`);
  };
  const supprimer = (debut, fin) => {
    if (fin > debut) modifications.push({debut, fin, texte: ''});
  };
  const inserer = (position, contenu) => modifications.push({debut: position, fin: position, texte: contenu});

  const blanc = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  const reculerSurBlancs = (i) => { while (i > 0 && blanc(texte[i - 1])) i--; return i; };
  const avancerSurBlancs = (i) => { while (i < texte.length && blanc(texte[i])) i++; return i; };

  /** Un commentaire pris dans une plage supprimée disparaîtrait en silence : on refuse. */
  const verifierSansCommentaire = (debut, fin) => {
    const extrait = texte.slice(debut, fin);
    if (extrait.includes('//') || extrait.includes('/*')) {
      echec(debut, `commentaire pris dans une plage à supprimer : ${JSON.stringify(extrait.slice(0, 60))}`);
    }
  };

  /** Retire `?`, `!` et `: Type` qui suivent le nom d'un paramètre, d'une propriété ou d'une variable. */
  const supprimerApresNom = (noeud, jeton) => {
    if (!noeud.type && !jeton) return;
    const debut = noeud.name.end;
    const fin = noeud.type ? noeud.type.end : jeton.end;
    verifierSansCommentaire(debut, noeud.type ? noeud.type.pos : fin);
    supprimer(debut, fin);
  };

  /** Retire `: Type` après la liste de paramètres d'une fonction. */
  const supprimerRetour = (noeud) => {
    if (!noeud.type) return;
    const debut = reculerSurBlancs(noeud.type.pos - 1);
    verifierSansCommentaire(debut, noeud.type.pos);
    supprimer(debut, noeud.type.end);
  };

  /** Retire `<...>` : `liste` est le NodeArray des paramètres ou arguments de type. */
  const supprimerChevrons = (liste) => {
    const ouvrant = reculerSurBlancs(liste.pos) - 1;
    if (texte[ouvrant] !== '<') echec(liste.pos, 'chevron ouvrant introuvable');
    let fermant = avancerSurBlancs(liste.end);
    while (texte[fermant] === ',') fermant = avancerSurBlancs(fermant + 1);
    if (texte[fermant] !== '>') echec(liste.end, 'chevron fermant introuvable');
    supprimer(ouvrant, fermant + 1);
  };

  /**
   * Début d'une instruction avec les commentaires qui lui sont collés, c'est-à-dire
   * sans ligne vide entre eux et elle. TypeScript rattache à une déclaration tout
   * commentaire de documentation qui la précède, même séparé par une ligne vide :
   * l'en-tête d'un fichier serait alors emporté avec la première interface.
   */
  const debutAvecCommentaires = (noeud) => {
    let debut = noeud.getStart(sf);
    const commentaires = ts.getLeadingCommentRanges(texte, noeud.pos) ?? [];
    for (let i = commentaires.length - 1; i >= 0; i--) {
      const c = commentaires[i];
      const entre = texte.slice(c.end, debut);
      if (!/^[ \t]*\r?\n?[ \t]*$/.test(entre)) break;
      debut = c.pos;
    }
    return debut;
  };

  /**
   * Retire une instruction entière sans laisser de ligne vide en trop. Les commentaires
   * collés à une déclaration de type partent avec elle ; ceux qui précèdent un import
   * restent, ils ouvrent souvent le fichier.
   */
  const supprimerInstruction = (noeud, avecCommentaires = true) => {
    let debut = avecCommentaires ? debutAvecCommentaires(noeud) : noeud.getStart(sf);
    let fin = noeud.end;
    const debutLigne = texte.lastIndexOf('\n', debut - 1) + 1;
    let finLigne = texte.indexOf('\n', fin);
    if (finLigne === -1) finLigne = texte.length;
    const seulSurSaLigne = /^[ \t]*$/.test(texte.slice(debutLigne, debut)) && /^[ \t]*$/.test(texte.slice(fin, finLigne));
    if (seulSurSaLigne) {
      debut = debutLigne;
      fin = Math.min(finLigne + 1, texte.length);
      const precedeeDeVide = debut === 0 || texte.slice(debut - 2, debut) === '\n\n';
      if (precedeeDeVide && texte[fin] === '\n') fin += 1;
    }
    supprimer(debut, fin);
  };

  const supprimerModificateurs = (noeud) => {
    for (const mod of noeud.modifiers ?? []) {
      if (MODIFICATEURS_TYPES.has(K[mod.kind])) supprimer(mod.getStart(sf), avancerSurBlancs(mod.end));
    }
  };

  /**
   * Réécrit un spécificateur d'import ou d'export. Rend false quand
   * l'instruction entière doit disparaître (feuille de style, module de types).
   */
  const traiterSpecificateur = (litteral, instruction) => {
    const spec = litteral.text;
    if (!spec.startsWith('.')) return true;
    if (spec.endsWith('.css')) {
      if (instruction?.importClause) echec(litteral.getStart(sf), 'import de feuille de style avec liaison non géré');
      cssImportes.push(spec);
      return false;
    }
    if (spec.endsWith('.json')) {
      jsonImportes.push(spec);
      inserer(litteral.end, " with {type: 'json'}");
      return true;
    }
    if (/\.(m?js|cjs)$/.test(spec)) return true;
    if (instruction && estModuleSansCode(spec)) return false;
    const suffixe = reecrireSpecificateur(spec);
    if (suffixe === undefined) echec(litteral.getStart(sf), `spécificateur non résolu : ${spec}`);
    if (suffixe) inserer(litteral.end - 1, suffixe);
    return true;
  };

  /** `import {type A, b}` devient `import {b}` ; si tout est type, l'instruction part. */
  const supprimerSpecificateursDeTypes = (instruction, liees, clause) => {
    const elements = liees.elements;
    if (!elements.some((e) => e.isTypeOnly)) return;
    if (elements.every((e) => e.isTypeOnly)) {
      if (clause?.name) supprimer(clause.name.end, liees.end);
      else supprimerInstruction(instruction, false);
      return;
    }
    elements.forEach((e) => {
      if (!e.isTypeOnly) return;
      const debut = e.getStart(sf);
      const suite = avancerSurBlancs(e.end);
      if (texte[suite] === ',') {
        supprimer(debut, avancerSurBlancs(suite + 1));
      } else {
        const virgule = reculerSurBlancs(debut) - 1;
        if (texte[virgule] !== ',') echec(debut, 'virgule introuvable autour d\'un spécificateur de type');
        supprimer(virgule, e.end);
      }
    });
  };

  const traiterImportOuExport = (noeud) => {
    const estImport = noeud.kind === K.ImportDeclaration;
    const clause = estImport ? noeud.importClause : null;
    if (estImport ? clause?.isTypeOnly : noeud.isTypeOnly) return supprimerInstruction(noeud, false);
    const liees = estImport ? clause?.namedBindings : noeud.exportClause;
    const nomme = liees && (ts.isNamedImports(liees) || ts.isNamedExports(liees)) ? liees : null;
    if (nomme && nomme.elements.length > 0 && nomme.elements.every((e) => e.isTypeOnly) && !(clause && clause.name)) {
      return supprimerInstruction(noeud, false);
    }
    const litteral = noeud.moduleSpecifier;
    if (litteral && ts.isStringLiteral(litteral) && !traiterSpecificateur(litteral, noeud)) {
      return supprimerInstruction(noeud, false);
    }
    if (nomme) supprimerSpecificateursDeTypes(noeud, nomme, clause);
  };

  /** Une propriété de paramètre (`constructor(private x: T)`) devient un champ et une affectation. */
  const traiterConstructeur = (constructeur) => {
    const proprietes = constructeur.parameters.filter((p) => (p.modifiers ?? []).some((m) => MODIFICATEURS_TYPES.has(K[m.kind])));
    if (proprietes.length === 0) return;
    if (!constructeur.body) echec(constructeur.pos, 'constructeur sans corps avec propriétés de paramètre');
    parametresPropriete += proprietes.length;
    const noms = proprietes.map((p) => {
      if (!ts.isIdentifier(p.name)) echec(p.getStart(sf), 'propriété de paramètre déstructurée non gérée');
      return p.name.text;
    });
    const debutConstructeur = constructeur.getStart(sf);
    const debutLigne = texte.lastIndexOf('\n', debutConstructeur - 1) + 1;
    const indentation = texte.slice(debutLigne, debutConstructeur).match(/^[ \t]*/)[0];
    inserer(debutLigne, noms.map((n) => `${indentation}${n};\n`).join(''));

    const instructions = constructeur.body.statements;
    const appelSuper = instructions.find((s) => ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && s.expression.expression.kind === K.SuperKeyword);
    const affectations = noms.map((n) => `this.${n} = ${n};`);
    const premiere = instructions[0];
    const pas = premiere ? texte.slice(texte.lastIndexOf('\n', premiere.getStart(sf) - 1) + 1, premiere.getStart(sf)) : `${indentation}  `;
    if (appelSuper) {
      inserer(appelSuper.end, affectations.map((a) => `\n${pas}${a}`).join(''));
    } else if (premiere) {
      inserer(premiere.getStart(sf), affectations.map((a) => `${a}\n${pas}`).join(''));
    } else {
      inserer(constructeur.body.getStart(sf) + 1, `${affectations.map((a) => `\n${pas}${a}`).join('')}\n${indentation}`);
    }
  };

  const assertions = new Set([K.AsExpression, K.SatisfiesExpression, K.TypeAssertionExpression, K.NonNullExpression]);
  const operandesSimples = new Set([
    K.Identifier, K.ThisKeyword, K.PropertyAccessExpression, K.ElementAccessExpression, K.CallExpression,
  ]);

  /** Sous les assertions, l'expression dont on garde le texte (`(x as A) as B` donne `x`). */
  const sansAssertions = (expression) => {
    let courante = expression;
    while (courante && (assertions.has(courante.kind) || courante.kind === K.ParenthesizedExpression)) courante = courante.expression;
    return courante;
  };
  const contientChaineOptionnelle = (expression) => {
    for (let n = expression; n; n = n.expression) {
      if (n.questionDotToken) return true;
      if (!n.expression) break;
    }
    return false;
  };

  /**
   * `(x as T).y` devient `(x).y` une fois `as T` retiré : les parenthèses ne
   * servent plus. On les retire quand l'expression gardée est simple et que
   * cela ne change pas le sens (jamais autour d'une chaîne `?.` suivie d'un accès).
   */
  const alleger = (parentheses) => {
    if (!assertions.has(parentheses.expression.kind)) return;
    const operande = sansAssertions(parentheses.expression);
    if (!operande || !operandesSimples.has(operande.kind)) return;
    const parent = parentheses.parent;
    const enPositionDAcces = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent) || ts.isCallExpression(parent)) && parent.expression === parentheses;
    if (enPositionDAcces && contientChaineOptionnelle(operande)) return;
    supprimer(parentheses.getStart(sf), parentheses.getStart(sf) + 1);
    supprimer(parentheses.end - 1, parentheses.end);
  };

  const fonctions = new Set([
    K.FunctionDeclaration, K.FunctionExpression, K.ArrowFunction, K.MethodDeclaration,
    K.GetAccessor, K.SetAccessor, K.Constructor,
  ]);

  function visiter(noeud) {
    switch (noeud.kind) {
      case K.InterfaceDeclaration:
      case K.TypeAliasDeclaration:
      case K.IndexSignature:
        return supprimerInstruction(noeud);
      case K.EnumDeclaration:
      case K.ModuleDeclaration:
        return echec(noeud.getStart(sf), 'enum / namespace non gérés');
      case K.ImportEqualsDeclaration:
        return echec(noeud.getStart(sf), 'import = non géré');
      case K.ImportDeclaration:
      case K.ExportDeclaration:
        return traiterImportOuExport(noeud);
      case K.FunctionDeclaration:
      case K.MethodDeclaration:
      case K.Constructor:
        if (!noeud.body) return supprimerInstruction(noeud);
        break;
      case K.PropertyDeclaration:
        if ((noeud.modifiers ?? []).some((m) => m.kind === K.DeclareKeyword)) return supprimerInstruction(noeud);
        break;
      default:
    }

    switch (noeud.kind) {
      case K.Parameter:
        if (ts.isIdentifier(noeud.name) && noeud.name.text === 'this') {
          return echec(noeud.getStart(sf), 'paramètre `this` non géré');
        }
        supprimerApresNom(noeud, noeud.questionToken);
        supprimerModificateurs(noeud);
        break;
      case K.VariableDeclaration:
        supprimerApresNom(noeud, noeud.exclamationToken);
        break;
      case K.PropertyDeclaration:
        supprimerApresNom(noeud, noeud.questionToken ?? noeud.exclamationToken);
        supprimerModificateurs(noeud);
        break;
      case K.ParenthesizedExpression:
        alleger(noeud);
        break;
      case K.AsExpression:
      case K.SatisfiesExpression:
      case K.NonNullExpression:
        supprimer(noeud.expression.end, noeud.end);
        break;
      case K.TypeAssertionExpression:
        supprimer(noeud.getStart(sf), noeud.expression.getStart(sf));
        break;
      case K.ClassDeclaration:
      case K.ClassExpression:
        if (noeud.typeParameters) supprimerChevrons(noeud.typeParameters);
        for (const clause of noeud.heritageClauses ?? []) {
          if (clause.token === K.ImplementsKeyword) {
            supprimer(reculerSurBlancs(clause.getStart(sf)), clause.end);
          } else {
            for (const t of clause.types) {
              if (t.typeArguments) supprimerChevrons(t.typeArguments);
              visiter(t.expression);
            }
          }
        }
        supprimerModificateurs(noeud);
        for (const membre of noeud.members) {
          if (membre.kind === K.Constructor) traiterConstructeur(membre);
          visiter(membre);
        }
        return;
      case K.CallExpression:
      case K.NewExpression:
      case K.TaggedTemplateExpression:
        if (noeud.typeArguments) supprimerChevrons(noeud.typeArguments);
        if (noeud.kind === K.CallExpression && noeud.expression.kind === K.ImportKeyword) {
          const argument = noeud.arguments[0];
          if (argument && ts.isStringLiteral(argument)) traiterSpecificateur(argument, null);
        }
        break;
      default:
    }

    if (fonctions.has(noeud.kind)) {
      if (noeud.typeParameters) supprimerChevrons(noeud.typeParameters);
      supprimerRetour(noeud);
      if (noeud.kind === K.MethodDeclaration && noeud.questionToken) supprimer(noeud.questionToken.getStart(sf), noeud.questionToken.end);
      if (noeud.kind !== K.ArrowFunction && noeud.kind !== K.FunctionExpression) supprimerModificateurs(noeud);
    }

    ts.forEachChild(noeud, (enfant) => {
      if (enfant.kind === K.TypeParameter || ts.isTypeNode(enfant)) return;
      visiter(enfant);
    });
  }

  visiter(sf);

  // Application de la fin vers le début. Une plage incluse dans une autre
  // (un `as` dans un `as`) est ignorée ; deux plages qui se chevauchent
  // seulement en partie signalent un cas non prévu.
  modifications.sort((a, b) => a.debut - b.debut || b.fin - a.fin);
  const retenues = [];
  let finPrecedente = -1;
  const plagesSupprimees = modifications.filter((m) => m.fin > m.debut);
  for (const m of modifications) {
    if (m.fin === m.debut) {
      if (!plagesSupprimees.some((p) => m.debut > p.debut && m.debut < p.fin)) retenues.push(m);
      continue;
    }
    if (m.debut < finPrecedente) {
      if (m.fin > finPrecedente) echec(m.debut, 'plages à supprimer qui se chevauchent');
      continue;
    }
    retenues.push(m);
    finPrecedente = m.fin;
  }
  let code = texte;
  for (const m of retenues.sort((a, b) => b.debut - a.debut || b.fin - a.fin)) {
    code = code.slice(0, m.debut) + m.texte + code.slice(m.fin);
  }
  return {code, cssImportes, jsonImportes, parametresPropriete};
}
