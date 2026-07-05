import db from '../../db/index.js';

/**
 * Compatibility repository for legacy task cache access.
 * Keep isolated until the cache strategy is redesigned or removed.
 */
export class LegacyTaskCacheRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  set(source, taskId, data) {
    return this.db.cacheTaskData(source, taskId, data);
  }

  get(source, maxAge = 3600) {
    return this.db.getCachedTaskData(source, maxAge);
  }
}

const legacyTaskCacheRepository = new LegacyTaskCacheRepository();
export default legacyTaskCacheRepository;
