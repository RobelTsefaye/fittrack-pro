// Workout CSV importer — uses pg directly (no Prisma compilation needed)
// Run: node scripts/import-workouts.mjs
import { readFileSync } from "fs";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { Pool } = require("pg");
require("dotenv").config();

const CSV_PATH = "/Users/robeltsefaye/Downloads/2026_04_03 Workouts.csv";
const USER_EMAIL = "tsefayerobel@gmail.com";

const EXERCISE_MAP = {
  "Preacher Curls": { name: "Preacher Curl", muscleGroup: "BICEPS", equipment: "CABLE" },
  "Hammer Curls mit dem Seil": { name: "Hammer Curl (Cable)", muscleGroup: "BICEPS", equipment: "CABLE" },
  "Trizepsdrücken": { name: "Tricep Pushdown", muscleGroup: "TRICEPS", equipment: "CABLE" },
  "Trizepsdrücken mit dem Seil": { name: "Tricep Pushdown (Rope)", muscleGroup: "TRICEPS", equipment: "CABLE" },
  "Trizepsdrücken über dem Kopf": { name: "Overhead Tricep Extension", muscleGroup: "TRICEPS", equipment: "CABLE" },
  "Trizepsdrücken über dem Kopf mit dem Seil": { name: "Overhead Tricep Extension (Rope)", muscleGroup: "TRICEPS", equipment: "CABLE" },
  "Trizeps einarmig": { name: "Single Arm Tricep Pushdown", muscleGroup: "TRICEPS", equipment: "CABLE" },
  "Beinbeugen im Sitzen": { name: "Seated Leg Curl", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Beinstrecken": { name: "Leg Extension", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Beinpresse": { name: "Leg Press", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Beinpresse dual": { name: "Leg Press (Dual)", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Wadenheben im Stehen": { name: "Standing Calf Raise", muscleGroup: "CALVES", equipment: "MACHINE" },
  "Wadenheben im Sitzen": { name: "Seated Calf Raise", muscleGroup: "CALVES", equipment: "MACHINE" },
  "Wadenheben an der Beinpresse": { name: "Leg Press Calf Raise", muscleGroup: "CALVES", equipment: "MACHINE" },
  "Butterfly weit": { name: "Chest Fly Machine (Wide)", muscleGroup: "CHEST", equipment: "MACHINE" },
  "Butterfly eng": { name: "Chest Fly Machine (Narrow)", muscleGroup: "CHEST", equipment: "MACHINE" },
  "Butterfly Reverse weit": { name: "Reverse Fly Machine (Wide)", muscleGroup: "BACK", equipment: "MACHINE" },
  "Fliegende nach oben": { name: "Incline Cable Fly", muscleGroup: "CHEST", equipment: "CABLE" },
  "Fliegende nach unten": { name: "Decline Cable Fly", muscleGroup: "CHEST", equipment: "CABLE" },
  "Seitheben": { name: "Lateral Raise Machine", muscleGroup: "SHOULDERS", equipment: "MACHINE" },
  "Schulterpresse": { name: "Shoulder Press Machine", muscleGroup: "SHOULDERS", equipment: "MACHINE" },
  "Latzug weit mit Obergriff": { name: "Lat Pulldown (Wide Overhand)", muscleGroup: "BACK", equipment: "CABLE" },
  "Latzug weit mit Untergriff": { name: "Lat Pulldown (Wide Underhand)", muscleGroup: "BACK", equipment: "CABLE" },
  "Latzug weit mit Neutralgriff": { name: "Lat Pulldown (Neutral Grip)", muscleGroup: "BACK", equipment: "CABLE" },
  "Latzug eng mit Neutralgriff": { name: "Lat Pulldown (Close Neutral)", muscleGroup: "BACK", equipment: "CABLE" },
  "T-Bar Rudern weit": { name: "T-Bar Row (Wide)", muscleGroup: "BACK", equipment: "BARBELL" },
  "Rudern eng": { name: "Cable Row (Close)", muscleGroup: "BACK", equipment: "CABLE" },
  "Rudern mit Brustauflage eng": { name: "Chest Supported Row (Close)", muscleGroup: "BACK", equipment: "MACHINE" },
  "Rudern mit Brustauflage weit": { name: "Chest Supported Row (Wide)", muscleGroup: "BACK", equipment: "MACHINE" },
  "Vorgebeugtes Rudern weit": { name: "Bent Over Row (Wide)", muscleGroup: "BACK", equipment: "BARBELL" },
  "Brustpresse": { name: "Chest Press Machine", muscleGroup: "CHEST", equipment: "MACHINE" },
  "Bankdrücken": { name: "Bench Press", muscleGroup: "CHEST", equipment: "BARBELL" },
  "Brust Dips": { name: "Chest Dips", muscleGroup: "CHEST", equipment: "BODYWEIGHT" },
  "Hackenschmidt Kniebeugen": { name: "Hack Squat", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Bulgarian Split Squats": { name: "Bulgarian Split Squat", muscleGroup: "LEGS", equipment: "DUMBBELL" },
  "Kreuzheben": { name: "Deadlift", muscleGroup: "FULL_BODY", equipment: "BARBELL" },
  "Hyperextensions": { name: "Hyperextension", muscleGroup: "BACK", equipment: "BODYWEIGHT" },
  "Rückenstrecken": { name: "Back Extension", muscleGroup: "BACK", equipment: "MACHINE" },
  "Abduktoren": { name: "Hip Abduction", muscleGroup: "GLUTES", equipment: "MACHINE" },
  "Adduktoren": { name: "Hip Adduction", muscleGroup: "LEGS", equipment: "MACHINE" },
  "Nackenheben": { name: "Neck Extension", muscleGroup: "OTHER", equipment: "MACHINE" },
  "Bauchmaschine": { name: "Ab Machine", muscleGroup: "CORE", equipment: "MACHINE" },
  "Reverse Flys": { name: "Reverse Fly", muscleGroup: "BACK", equipment: "CABLE" },
  "Curls": { name: "Bicep Curl", muscleGroup: "BICEPS", equipment: "CABLE" },
  "Curls hinter dem Rücken": { name: "Behind The Back Curl", muscleGroup: "BICEPS", equipment: "CABLE" },
  "Curls mit Obergriff": { name: "Reverse Curl", muscleGroup: "BICEPS", equipment: "CABLE" },
  "Hammer Curls im Sitzen": { name: "Seated Hammer Curl", muscleGroup: "BICEPS", equipment: "DUMBBELL" },
  "Konzentrations Curls": { name: "Concentration Curl", muscleGroup: "BICEPS", equipment: "DUMBBELL" },
  "Überzüge": { name: "Dumbbell Pullover", muscleGroup: "CHEST", equipment: "DUMBBELL" },
  "Überzüge mit dem Seil": { name: "Cable Pullover", muscleGroup: "CHEST", equipment: "CABLE" },
  "Unterarm Curls auf der Bank mit Obergriff": { name: "Wrist Curl (Overhand)", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  "Unterarm Curls auf der Bank mit Untergriff": { name: "Wrist Curl (Underhand)", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  "Unterarm Curls im Stehen hinter dem Rücken": { name: "Wrist Curl Behind Back", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  "Unterarm Curls im Stehen mit Obergriff": { name: "Wrist Curl Standing (Overhand)", muscleGroup: "FOREARMS", equipment: "BARBELL" },
  "Unterarm am kabelturm": { name: "Wrist Curl (Cable)", muscleGroup: "FOREARMS", equipment: "CABLE" },
};

function parseCSV(content) {
  const lines = content.split("\n").map(l => l.trimEnd());
  const workouts = [];
  let current = null;
  let currentExercise = null;
  let inSets = false;

  for (const line of lines) {
    if (!line.trim()) { inSets = false; continue; }

    if (line.startsWith('"Tag ') && line.includes(';')) {
      const parts = line.split(';');
      if (parts.length >= 2) {
        const name = parts[0].replace(/^"|"$/g, '').trim();
        const dateRaw = parts[1].replace(/^"|"$/g, '').trim();
        const dateMatch = dateRaw.match(/(\d{4}-\d{2}-\d{2})\s+(\d+):(\d+)/);
        let startedAt = new Date();
        if (dateMatch) {
          startedAt = new Date(`${dateMatch[1]}T${dateMatch[2].padStart(2,'0')}:${dateMatch[3]}:00`);
        }
        const durRaw = parts[2]?.replace(/^"|"$/g, '').trim() ?? '';
        let durationSeconds = null;
        const durHMatch = durRaw.match(/(\d+):(\d+)\s*Std/);
        const durMMatch = durRaw.match(/(\d+)\s*Min/);
        if (durHMatch) durationSeconds = (parseInt(durHMatch[1]) * 3600) + (parseInt(durHMatch[2]) * 60);
        else if (durMMatch) durationSeconds = parseInt(durMMatch[1]) * 60;

        current = { name, startedAt, durationSeconds, exercises: [] };
        workouts.push(current);
        currentExercise = null;
        inSets = false;
      }
      continue;
    }

    if (current && line.startsWith('"') && line.match(/^"\d+\./)) {
      const raw = line.replace(/^"|"$/g, '');
      const nameMatch = raw.match(/^\d+\.\s+(.+?)(?:\s+·|$)/);
      const exerciseName = nameMatch ? nameMatch[1].trim() : raw;
      // Skip bad entries
      if (exerciseName.includes('Satz unsauber')) { currentExercise = null; continue; }
      currentExercise = { name: exerciseName, sets: [] };
      current.exercises.push(currentExercise);
      inSets = false;
      continue;
    }

    if (line === '#;KG;WDH') { inSets = true; continue; }

    if (inSets && currentExercise && line.match(/^\d+;/)) {
      const parts = line.split(';');
      const setNumber = parseInt(parts[0]);
      const weight = parseFloat(parts[1].replace(',', '.')) || null;
      const reps = parseInt(parts[2]) || null;
      currentExercise.sets.push({ setNumber, weight, reps });
    }
  }

  return workouts;
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Get user
    const { rows: [user] } = await pool.query(
      'SELECT id, name FROM users WHERE email = $1', [USER_EMAIL]
    );
    if (!user) throw new Error(`User ${USER_EMAIL} not found`);
    console.log(`User: ${user.name} (${user.id})`);

    // Build exercise name → id map
    const { rows: existing } = await pool.query(
      'SELECT id, name FROM exercises WHERE "userId" IS NULL OR "userId" = $1', [user.id]
    );
    const exerciseByName = new Map(existing.map(e => [e.name, e.id]));
    console.log(`Found ${existing.length} existing exercises`);

    // Ensure all mapped exercises exist
    const deMap = new Map();
    for (const [deName, meta] of Object.entries(EXERCISE_MAP)) {
      let id = exerciseByName.get(meta.name);
      if (!id) {
        const { rows: [ex] } = await pool.query(
          `INSERT INTO exercises (id, name, "muscleGroup", equipment, "userId", "isCustom", "createdAt")
           VALUES (gen_random_uuid(), $1, $2, $3, $4, true, now())
           RETURNING id`,
          [meta.name, meta.muscleGroup, meta.equipment, user.id]
        );
        id = ex.id;
        console.log(`  Created exercise: ${meta.name}`);
      }
      deMap.set(deName, id);
    }

    // Parse CSV
    const content = readFileSync(CSV_PATH, "utf-8");
    const workouts = parseCSV(content);
    console.log(`\nParsed ${workouts.length} workouts`);

    // Get existing workout start times to avoid duplicates
    const { rows: existingW } = await pool.query(
      'SELECT "startedAt" FROM workouts WHERE "userId" = $1', [user.id]
    );
    const existingDates = new Set(existingW.map(w => w.startedAt.toISOString()));

    let imported = 0, skipped = 0;
    const unknownExercises = new Set();

    for (const w of workouts) {
      if (existingDates.has(w.startedAt.toISOString())) { skipped++; continue; }

      const completedAt = w.durationSeconds
        ? new Date(w.startedAt.getTime() + w.durationSeconds * 1000)
        : null;

      const { rows: [workout] } = await pool.query(
        `INSERT INTO workouts (id, "userId", name, "startedAt", "completedAt", "durationSeconds")
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5) RETURNING id`,
        [user.id, w.name, w.startedAt, completedAt, w.durationSeconds]
      );

      let order = 1;
      for (const ex of w.exercises) {
        const exerciseId = deMap.get(ex.name);
        if (!exerciseId) { unknownExercises.add(ex.name); continue; }

        const { rows: [we] } = await pool.query(
          `INSERT INTO workout_exercises (id, "workoutId", "exerciseId", "order", "isCompleted")
           VALUES (gen_random_uuid(), $1, $2, $3, false) RETURNING id`,
          [workout.id, exerciseId, order++]
        );

        for (const s of ex.sets) {
          await pool.query(
            `INSERT INTO sets (id, "workoutExerciseId", "setNumber", weight, reps, "isWarmup", "isCompleted", "completedAt")
             VALUES (gen_random_uuid(), $1, $2, $3, $4, false, $5, $6)`,
            [we.id, s.setNumber, s.weight, s.reps, !!completedAt, completedAt]
          );
        }
      }

      imported++;
      if (imported % 25 === 0) process.stdout.write(`  ${imported}/${workouts.length - skipped} imported...\r`);
    }

    console.log(`\n✓ Imported:  ${imported} workouts`);
    console.log(`  Skipped (duplicate): ${skipped}`);
    if (unknownExercises.size > 0) {
      console.log(`  Unknown exercises skipped: ${[...unknownExercises].join(', ')}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
