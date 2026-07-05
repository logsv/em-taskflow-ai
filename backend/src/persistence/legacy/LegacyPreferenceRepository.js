import db from '../../db/index.js';

/**
 * Compatibility repository for legacy key/value persistence.
 * New product features should prefer first-class tables and repositories.
 */
export class LegacyPreferenceRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  get(key) {
    return this.db.getUserPreference(key);
  }

  set(key, value) {
    return this.db.setUserPreference(key, value);
  }
}

const legacyPreferenceRepository = new LegacyPreferenceRepository();
export default legacyPreferenceRepository;
