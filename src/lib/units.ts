const LB_PER_KG = 0.45359237;

export function lbToKg(lb: number): number {
  return lb * LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg / LB_PER_KG;
}
