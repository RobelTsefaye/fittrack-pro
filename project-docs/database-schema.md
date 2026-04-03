# Database Schema

## Entity Relationship Diagram

```
User 1──* Workout 1──* WorkoutExercise 1──* Set
 │                          │
 │                          │
 │                     Exercise *──1 MuscleGroup
 │
 ├──* BodyWeight
 ├──* PersonalRecord
 └──* UserSettings
```

## Tables

### User
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| email | String | Unique, indexed |
| passwordHash | String | Bcrypt hashed |
| name | String | Display name |
| createdAt | DateTime | Auto |
| updatedAt | DateTime | Auto |

### Exercise
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK → User (null for defaults) |
| name | String | e.g., "Bench Press" |
| muscleGroup | Enum | CHEST, BACK, LEGS, etc. |
| equipment | Enum | BARBELL, DUMBBELL, MACHINE, etc. |
| notes | String? | Optional |
| isCustom | Boolean | User-created vs system default |
| createdAt | DateTime | Auto |

### Workout
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK → User |
| name | String? | Optional workout name |
| startedAt | DateTime | When workout began |
| completedAt | DateTime? | When finished (null = in progress) |
| notes | String? | Optional |
| durationSeconds | Int? | Calculated on completion |
| createdAt | DateTime | Auto |

### WorkoutExercise
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| workoutId | UUID | FK → Workout |
| exerciseId | UUID | FK → Exercise |
| order | Int | Display order in workout |
| notes | String? | Optional |
| isCompleted | Boolean | Default false |

### Set
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| workoutExerciseId | UUID | FK → WorkoutExercise |
| setNumber | Int | 1, 2, 3... |
| reps | Int? | Nullable for timed exercises |
| weight | Float? | In user's preferred unit |
| durationSeconds | Int? | For timed exercises |
| rpe | Float? | Rate of Perceived Exertion (1-10) |
| isWarmup | Boolean | Default false |
| isCompleted | Boolean | Default false |
| completedAt | DateTime? | When set was completed |

### BodyWeight
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK → User |
| weight | Float | In user's preferred unit |
| date | Date | Unique per user per day |
| notes | String? | Optional |
| createdAt | DateTime | Auto |

### PersonalRecord
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK → User |
| exerciseId | UUID | FK → Exercise |
| weight | Float | PR weight |
| reps | Int | Reps at that weight |
| estimated1RM | Float? | Calculated |
| achievedAt | DateTime | When PR was hit |
| setId | UUID | FK → Set (the actual set) |

### UserSettings
| Column | Type | Notes |
|--------|------|-------|
| id | UUID | Primary key |
| userId | UUID | FK → User, unique |
| weightUnit | Enum | KG or LB |
| theme | Enum | LIGHT or DARK |
| restTimerDefault | Int | Default rest seconds (90) |

## Indexes
- `User.email` — unique index
- `Workout.userId + startedAt` — composite for history queries
- `BodyWeight.userId + date` — unique composite
- `PersonalRecord.userId + exerciseId` — for PR lookups
- `Set.workoutExerciseId` — for set queries

## Design Notes
- UUIDs everywhere for security (no sequential IDs in URLs)
- Timestamps on all records for AI analysis
- Normalized structure — exercises are reusable across workouts
- `WorkoutExercise` is the join table with ordering
- Sets track completion state for live workout tracking
- PersonalRecord is denormalized (duplicates set data) for fast dashboard queries
