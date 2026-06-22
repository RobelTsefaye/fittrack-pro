/**
 * UI metadata for Apple Health workout types — German labels and icon hints.
 * Unknown types fall back to a generic Activity icon and the raw type string.
 */
import type { LucideIcon } from "lucide-react";
import {
  Activity, Bike, Waves, Footprints, Dumbbell, Mountain, Heart,
  Snowflake, Zap,
} from "lucide-react";

export type WorkoutTypeMeta = {
  label: string;
  icon: LucideIcon;
  /** brand color for the icon — falls back to neutral */
  color: string;
};

const TYPE_MAP: Record<string, WorkoutTypeMeta> = {
  Running:           { label: "Laufen",        icon: Footprints, color: "#FF453A" },
  Walking:           { label: "Gehen",         icon: Footprints, color: "#9A9AA2" },
  Cycling:           { label: "Radfahren",     icon: Bike,       color: "#64D2FF" },
  "Indoor Cycling":  { label: "Indoor-Cycling",icon: Bike,       color: "#64D2FF" },
  Swimming:          { label: "Schwimmen",     icon: Waves,      color: "#0A84FF" },
  "Pool Swimming":   { label: "Bahnen",        icon: Waves,      color: "#0A84FF" },
  "Strength Training": { label: "Krafttraining", icon: Dumbbell, color: "#FFB340" },
  "Traditional Strength Training": { label: "Krafttraining", icon: Dumbbell, color: "#FFB340" },
  "Functional Strength Training": { label: "Functional",     icon: Dumbbell, color: "#FFB340" },
  Hiking:            { label: "Wandern",       icon: Mountain,   color: "#30D158" },
  Yoga:              { label: "Yoga",          icon: Heart,      color: "#6E5BFF" },
  HIIT:              { label: "HIIT",          icon: Zap,        color: "#D4FF3A" },
  "High Intensity Interval Training": { label: "HIIT", icon: Zap, color: "#D4FF3A" },
  Rowing:            { label: "Rudern",        icon: Waves,      color: "#0A84FF" },
  Elliptical:        { label: "Crosstrainer",  icon: Activity,   color: "#FF9F0A" },
  "Stair Climbing":  { label: "Treppen",       icon: Mountain,   color: "#30D158" },
  Skating:           { label: "Skating",       icon: Snowflake,  color: "#64D2FF" },
  Other:             { label: "Sonstiges",     icon: Activity,   color: "#9A9AA2" },
};

const FALLBACK: WorkoutTypeMeta = { label: "Workout", icon: Activity, color: "#9A9AA2" };

export function getWorkoutTypeMeta(type: string): WorkoutTypeMeta {
  return TYPE_MAP[type] ?? { ...FALLBACK, label: type || FALLBACK.label };
}
