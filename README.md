# Expo 57 Fetch Regression Repro (with RTK Query)

This repository reproduces large-response parsing failures on Android in Expo SDK 57 and compares four paths in a single app:

- direct `fetch` + `response.text()` + `JSON.parse`
- direct `XMLHttpRequest` + `JSON.parse`
- RTK Query `fetchBaseQuery` with default JSON parsing
- RTK Query `fetchBaseQuery` with `responseHandler: 'text'` + `JSON.parse`

## Environment

- Expo SDK: 57.0.2
- React Native: 0.86.0
- React: 19.2.3
- Platform: Android

## Endpoint

This app uses a public endpoint:

```text
https://api.hucksters.io/elist?t=NEXT_90&tp=1&swlong=-123.008&swlat=49.227&nelong=-122.937&nelat=49.315&clustered=1&page=1
```

## Run

```bash
npm install
npx expo start
```

Open Android and run all four probes from the UI.

If the problem is intermittent, use the stress controls to run the RTK Query probes repeatedly back-to-back.

## What To Capture For Expo Issue

Use the same URL for each probe and record:

- status
- elapsed time
- body length
- parse result
- head/tail preview

If the issue reproduces as observed in the app under test, you should see:

- `fetchBaseQueryJson`: fails intermittently or consistently (`PARSING_ERROR`/parse-related)
- `fetchBaseQueryText`: fails when manual `JSON.parse` is attempted
- direct `fetch`: succeeds
- `XMLHttpRequest`: succeeds

That matrix isolates the issue to the `fetchBaseQuery` path under this runtime configuration.

## Intermittent Repro Workflow

1. Keep the same URL for every run.
2. First run the single-shot buttons to confirm the environment is wired correctly.
3. Then run `Stress fetchBaseQuery JSON xN` and `Stress fetchBaseQuery TEXT xN` with `N` set to 10 or higher.
4. Capture the stress summary plus the first failing sample shown in the result card.

This is useful when the failure is timing-dependent and does not occur on every request.