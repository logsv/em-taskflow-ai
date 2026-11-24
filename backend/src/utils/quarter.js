/** Calendar quarter label in the format stored in okr_tracker.quarter ('Q1'..'Q4'). */
export function currentQuarter(date = new Date()) {
  return `Q${Math.floor(date.getMonth() / 3) + 1}`;
}
