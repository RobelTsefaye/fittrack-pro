# HealthKit Native Plugin — Setup Notes

Once `npx cap add ios` has run (requires full Xcode.app), this plugin
gives the web app direct HealthKit access — no more HAE/Health Auto
Export bridge needed.

## What it replaces
Currently: Apple Health → HAE app → REST webhook → our API → Postgres
With native app: Apple Health → HealthKit framework → JS bridge → same API

## Files to add after `cap add ios` exists
- `ios/App/App/HealthKitPlugin.swift` — Capacitor plugin exposing
  `requestAuthorization()`, `queryDailyMetrics(date)`, `queryWorkouts(range)`
- Entitlements: enable "HealthKit" capability in Xcode project settings
- Info.plist: add `NSHealthShareUsageDescription` (required by Apple,
  explains to the user why the app wants Health data)

## Why this is worth it
- No more Shortcuts automation fragility
- Real-time data instead of waiting for HAE sync intervals
- Can read respiratory rate / wrist temperature directly (same fields
  we just added server-side for the illness early-warning feature)
