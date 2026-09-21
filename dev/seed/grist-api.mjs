/**
 * Client REST minimal pour l'API Grist.
 *
 * Volontairement réduit aux appels dont le script de génération a besoin, sans
 * dépendance externe : `fetch` natif de Node 18 et plus.
 */

/** Nombre maximal d'enregistrements envoyés en une requête. */
const TAILLE_LOT = 2000;

export class ErreurGrist extends Error {
  constructor(methode, chemin, statut, corps) {
    super(`${methode} ${chemin} a répondu ${statut} : ${corps}`);
    this.name = 'ErreurGrist';
    this.statut = statut;
  }
}

export class ClientGrist {
  /**
   * @param {string} urlBase  Racine de l'instance, par exemple http://localhost:8484
   * @param {string} cleApi   Clé d'API de l'utilisateur
   */
  constructor(urlBase, cleApi) {
    this.urlBase = urlBase.replace(/\/+$/, '');
    this.cleApi = cleApi;
  }

  async requete(methode, chemin, corps) {
    const reponse = await fetch(`${this.urlBase}${chemin}`, {
      method: methode,
      headers: {
        'Authorization': `Bearer ${this.cleApi}`,
        ...(corps === undefined ? {} : {'Content-Type': 'application/json'}),
      },
      body: corps === undefined ? undefined : JSON.stringify(corps),
    });
    const texte = await reponse.text();
    if (!reponse.ok) {
      throw new ErreurGrist(methode, chemin, reponse.status, texte.slice(0, 500));
    }
    return texte ? JSON.parse(texte) : null;
  }

  // --- Organisations, espaces de travail, documents ---------------------

  listerOrgs() {
    return this.requete('GET', '/api/orgs');
  }

  listerWorkspaces(idOrg) {
    return this.requete('GET', `/api/orgs/${idOrg}/workspaces`);
  }

  creerWorkspace(idOrg, nom) {
    return this.requete('POST', `/api/orgs/${idOrg}/workspaces`, {name: nom});
  }

  creerDoc(idWorkspace, nom) {
    return this.requete('POST', `/api/workspaces/${idWorkspace}/docs`, {name: nom});
  }

  supprimerDoc(idDoc) {
    return this.requete('DELETE', `/api/docs/${idDoc}`);
  }

  // --- Contenu d'un document -------------------------------------------

  /**
   * Applique une liste d'actions utilisateur Grist. C'est le seul moyen
   * d'agir sur les métadonnées (colonnes de référence, libellés, description
   * d'une table), que l'API REST de haut niveau n'expose pas.
   */
  appliquerActions(idDoc, actions) {
    return this.requete('POST', `/api/docs/${idDoc}/apply`, actions);
  }

  listerTables(idDoc) {
    return this.requete('GET', `/api/docs/${idDoc}/tables`);
  }

  lireEnregistrements(idDoc, table, parametres = '') {
    const suffixe = parametres ? `?${parametres}` : '';
    return this.requete('GET', `/api/docs/${idDoc}/tables/${table}/records${suffixe}`);
  }

  /**
   * Ajoute des enregistrements par lots.
   * @param {Array<object>} enregistrements  Objets `{champ: valeur}`.
   * @returns {Promise<number[]>} Les identifiants de ligne créés, dans l'ordre.
   */
  async ajouterEnregistrements(idDoc, table, enregistrements) {
    const ids = [];
    for (let debut = 0; debut < enregistrements.length; debut += TAILLE_LOT) {
      const lot = enregistrements.slice(debut, debut + TAILLE_LOT);
      const reponse = await this.requete(
        'POST',
        `/api/docs/${idDoc}/tables/${table}/records`,
        {records: lot.map((fields) => ({fields}))},
      );
      ids.push(...reponse.records.map((r) => r.id));
    }
    return ids;
  }

  /**
   * Met à jour des enregistrements existants par lots.
   * @param {Array<{id: number, fields: object}>} enregistrements
   */
  async majEnregistrements(idDoc, table, enregistrements) {
    for (let debut = 0; debut < enregistrements.length; debut += TAILLE_LOT) {
      await this.requete(
        'PATCH',
        `/api/docs/${idDoc}/tables/${table}/records`,
        {records: enregistrements.slice(debut, debut + TAILLE_LOT)},
      );
    }
  }
}
