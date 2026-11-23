export const VISIT_WEEKS_BEFORE_DUE = [32, 24, 16, 8, 2];

export function calculateVisitDates(dueDate) {
  const due = new Date(dueDate);
  return VISIT_WEEKS_BEFORE_DUE.map((weeks, index) => {
    const visitDate = new Date(due);
    visitDate.setUTCDate(visitDate.getUTCDate() - weeks * 7);
    return { visitNo: index + 1, visitDate };
  });
}

export function startOfUtcDay(value) {
  const date = new Date(value);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function isMissed(visit, now = new Date()) {
  return !visit.completedAt && startOfUtcDay(visit.visitDate) < startOfUtcDay(now);
}

export function canLogVisit(visitNo, visits) {
  return visitNo === 1 || visits.some((visit) => visit.visitNo === visitNo - 1 && visit.completedAt);
}
