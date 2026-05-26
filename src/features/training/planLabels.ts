import type { PlanDay } from "../../model";
import { labelKind } from "../../trainingUtils";

export function labelPlan(plan: PlanDay) {
  return `${labelKind(plan.kind)}${plan.exercises?.length ? "+力量" : ""}`;
}
