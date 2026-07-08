# Expo 57 Fetch Large JSON Corruption Repro

This minimal app reproduces an Android regression observed after upgrading to Expo SDK 57:

- `fetch` may return a corrupted body for a large JSON response
- `XMLHttpRequest` against the same URL succeeds

## Environment Target

- Expo SDK: 57.0.2
- React Native: 0.86.0
- Platform: Android

## Setup

1. `cd fetch-repro`
2. `npm install`
3. `npx expo start`
4. Open on Android emulator/device

## Repro Steps

1. Paste a working large-response URL into the textbox.
2. Tap `Run fetch probe`.
3. Tap `Run XHR probe`.
4. Compare status, length, parse result, and head/tail output.

## Expected

Both probes return valid JSON parse results.

## Actual (regression)

`fetch` intermittently returns corrupted body text and JSON parse fails, while `XMLHttpRequest` parses successfully for the same URL.

## Notes

- Use a URL that returns a multi-megabyte JSON payload.
- This repro intentionally does not use RTK Query, to isolate the transport layer behavior.
