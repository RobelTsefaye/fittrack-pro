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

const RUN  = { label: "Laufen",     icon: Footprints, color: "#FF453A" };
const WALK = { label: "Gehen",      icon: Footprints, color: "#9A9AA2" };
const BIKE = { label: "Radfahren",  icon: Bike,       color: "#64D2FF" };
const BIKE_IN = { label: "Indoor-Cycling", icon: Bike, color: "#64D2FF" };
const SWIM = { label: "Schwimmen",  icon: Waves,      color: "#0A84FF" };
const POOL = { label: "Bahnen",     icon: Waves,      color: "#0A84FF" };
const KRAFT = { label: "Krafttraining", icon: Dumbbell, color: "#FFB340" };

const TYPE_MAP: Record<string, WorkoutTypeMeta> = {
  // Running variants
  Running:                   RUN,
  "Outdoor Run":             RUN,
  "Outdoor Running":         RUN,
  "Running Outdoor":         RUN,
  "Laufen":                  RUN,
  "Laufen Outdoor":          RUN,
  "Laufen im Freien":        RUN,
  "Indoor Run":              { label: "Laufband",   icon: Footprints, color: "#FF9F0A" },
  "Indoor Running":          { label: "Laufband",   icon: Footprints, color: "#FF9F0A" },
  "Laufen Drinnen":          { label: "Laufband",   icon: Footprints, color: "#FF9F0A" },

  // Walking
  Walking:                   WALK,
  "Outdoor Walk":            WALK,
  "Gehen":                   WALK,
  "Gehen im Freien":         WALK,

  // Cycling variants
  Cycling:                   BIKE,
  "Outdoor Cycle":           BIKE,
  "Outdoor Cycling":         BIKE,
  "Cycling Outdoor":         BIKE,
  "Radfahren":               BIKE,
  "Radfahren Outdoor":       BIKE,
  "Radfahren im Freien":     BIKE,
  "Indoor Cycle":            BIKE_IN,
  "Indoor Cycling":          BIKE_IN,
  "Radfahren Drinnen":       BIKE_IN,
  "Ergometer":               BIKE_IN,

  // Swimming
  Swimming:                  SWIM,
  "Open Water Swimming":     SWIM,
  "Freiwasserschwimmen":     SWIM,
  "Pool Swimming":           POOL,
  "Bahnenschwimmen":         POOL,
  "Schwimmen":               SWIM,

  // Strength (excluded from cardio anyway, but mapped for completeness)
  "Strength Training":              KRAFT,
  "Traditional Strength Training":  KRAFT,
  "Krafttraining":                  KRAFT,
  "Traditionelles Krafttraining":   KRAFT,
  "Functional Strength Training":   { label: "Functional", icon: Dumbbell, color: "#FFB340" },
  "Funktionelles Krafttraining":    { label: "Functional", icon: Dumbbell, color: "#FFB340" },

  // Misc
  Hiking:                    { label: "Wandern",       icon: Mountain,   color: "#30D158" },
  "Wandern":                 { label: "Wandern",       icon: Mountain,   color: "#30D158" },
  Yoga:                      { label: "Yoga",          icon: Heart,      color: "#6E5BFF" },
  HIIT:                      { label: "HIIT",          icon: Zap,        color: "#D4FF3A" },
  "High Intensity Interval Training": { label: "HIIT", icon: Zap, color: "#D4FF3A" },
  Rowing:                    { label: "Rudern",        icon: Waves,      color: "#0A84FF" },
  "Indoor Rowing":           { label: "Rudern",        icon: Waves,      color: "#0A84FF" },
  "Rudern":                  { label: "Rudern",        icon: Waves,      color: "#0A84FF" },
  Elliptical:                { label: "Crosstrainer",  icon: Activity,   color: "#FF9F0A" },
  "Crosstrainer":            { label: "Crosstrainer",  icon: Activity,   color: "#FF9F0A" },
  "Stair Climbing":          { label: "Treppen",       icon: Mountain,   color: "#30D158" },
  "Treppensteigen":          { label: "Treppen",       icon: Mountain,   color: "#30D158" },
  Skating:                   { label: "Skating",       icon: Snowflake,  color: "#64D2FF" },
  Other:                     { label: "Sonstiges",     icon: Activity,   color: "#9A9AA2" },
};

const FALLBACK: WorkoutTypeMeta = { label: "Workout", icon: Activity, color: "#9A9AA2" };

export function getWorkoutTypeMeta(type: string): WorkoutTypeMeta {
  return TYPE_MAP[type] ?? { ...FALLBACK, label: type || FALLBACK.label };
}
