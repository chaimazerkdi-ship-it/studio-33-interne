// Deplacement ponctuel des anciens documents vers le stockage : TERMINE.
//
// Le 25/10/2026, les 46 documents ranges en base64 dans la table `media`
// (colonne `data`) ont ete deposes dans le stockage `admin-docs` ; chaque
// fichier a ete compare a l'original (taille et empreinte md5) : 46/46
// identiques. La tache planifiee est arretee ; la fonction ne fait plus rien.
//
// Pour reference, elle prenait un document par appel (`media` ou
// data not null et file_path null), le deposait sous
// proj/<projet>/<dossier>/<id>_<nom>.<ext>, puis remplacait `data` par
// `file_path`. L'en-tete « data:<type>[;param…];base64, » pouvait contenir
// « ;filename=… » (PDF fabriques par jsPDF).

Deno.serve(() => new Response('termine', { status: 410 }));
