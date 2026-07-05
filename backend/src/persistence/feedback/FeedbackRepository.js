import db from '../../db/index.js';

export class FeedbackRepository {
  constructor({ dbService = db } = {}) {
    this.db = dbService;
  }

  createFeedback(input) {
    return this.db.createFeedback(input);
  }
}

const feedbackRepository = new FeedbackRepository();
export default feedbackRepository;
