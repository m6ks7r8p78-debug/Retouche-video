-- Serveur de consentement RetoucheProAI — NON DÉPLOYÉ. Identités, accords et preuves dans des tables séparées ; aucun média stocké.
CREATE TABLE IF NOT EXISTS medias (id TEXT PRIMARY KEY, proprietaire_hash TEXT NOT NULL, droits_fichier INTEGER NOT NULL DEFAULT 0, tiers_proteges INTEGER NOT NULL DEFAULT 0,
  mineur_present INTEGER NOT NULL DEFAULT 0, personnes_inconnues INTEGER NOT NULL DEFAULT 0, permissions TEXT NOT NULL DEFAULT '{}', etat TEXT NOT NULL DEFAULT 'brouillon', cree INTEGER NOT NULL, expire INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS personnes (media_id TEXT NOT NULL, personne_id TEXT NOT NULL, PRIMARY KEY (media_id, personne_id));
CREATE TABLE IF NOT EXISTS invitations (empreinte TEXT PRIMARY KEY, media_id TEXT NOT NULL, personne_id TEXT NOT NULL, cree INTEGER NOT NULL, expire INTEGER NOT NULL, utilise INTEGER NOT NULL DEFAULT 0, notice TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS accords (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, personne_id TEXT NOT NULL, purposes TEXT NOT NULL, majeur INTEGER NOT NULL, notice TEXT NOT NULL,
  cree INTEGER NOT NULL, expire INTEGER, revoque INTEGER NOT NULL DEFAULT 0, revoque_le INTEGER, revocation_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS registre (n INTEGER PRIMARY KEY, quand INTEGER NOT NULL, type TEXT NOT NULL, donnees TEXT NOT NULL, precedent TEXT NOT NULL, empreinte TEXT NOT NULL);
