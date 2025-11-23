const gradeOrder = { A: 4, B: 3, C: 2, D: 1, F: 0 };

export function computeCompliance({ g6, goals }) {
  if (!goals) return { compliant: null, reasons: ["No goals defined"] };

  const reasons = [];
  let compliant = true;

  const grade = g6.summary.grade;
  const clarity = g6.summary.clarityScore;
  const dist = g6.summary.distanceFromCentroid;

  if (gradeOrder[grade] < gradeOrder[goals.minGrade]) {
    compliant = false;
    reasons.push(`Grade ${grade} < required ${goals.minGrade}`);
  }

  if (clarity < goals.minClarity) {
    compliant = false;
    reasons.push(
      `Clarity ${clarity.toFixed(2)} < minimum ${goals.minClarity}`
    );
  }

  if (dist > goals.maxDistance) {
    compliant = false;
    reasons.push(
      `Distance ${dist.toFixed(3)} > maximum ${goals.maxDistance}`
    );
  }

  return { compliant, reasons };
}
