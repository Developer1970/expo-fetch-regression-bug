# Title

Expo SDK 57 Android `fetch` returns corrupted body for a large JSON response, while `XMLHttpRequest` succeeds

## Summary

After upgrading an existing app from Expo SDK 54 to Expo SDK 57, Android `fetch` started returning corrupted response bodies for a large public JSON endpoint.

The same endpoint and same app logic still work in:

- Web browsers
- The same app before the upgrade on Expo SDK 54
- The upgraded app when the request is made with `XMLHttpRequest` instead of `fetch`

RTK Query surfaced this as `PARSING_ERROR`, but the issue does not appear to be RTK Query-specific. The evidence points to the Expo / React Native `fetch` response body path.

## Why this matters

This is more serious than a single endpoint-specific parsing issue.

If `fetch` can return a corrupted body for a valid large JSON response, then any data layer built on top of `fetch` is potentially affected, including:

- RTK Query using `fetchBaseQuery`
- direct `fetch` calls
- other abstractions layered on top of `fetch`

This does not necessarily mean every query will fail, but it does mean any sufficiently large fetch-backed response may be at risk in this runtime.

## Environment

- Expo SDK: 57.0.2
- React Native: 0.86.0
- React: 19.2.3
- Platform: Android
- Previous working version: Expo SDK 54

## Public Endpoint

Base URL:

`https://api.hucksters.io`

Affected endpoint:

`GET /elist`

The endpoint is public and can be called without authentication.

Example parameter shape used by the app:

```text
https://api.hucksters.io/elist?t=NEXT_90&tp=1&swlong=-123.008&swlat=49.227&nelong=-122.937&nelat=49.315&clustered=1&page=1
```

Typical parameters:

- `tp`
- `clustered=1`
- `swlong`, `swlat`, `nelong`, `nelat`
- optional `t`
- optional `stime` and `etime`
- optional `q`
- optional `page`

## Expected Behavior

`fetch` should return the same full response body as browsers and `XMLHttpRequest`, and `response.text()` / `response.json()` should be able to read valid JSON from the same successful `200` response.

## Actual Behavior

On Android after upgrading to Expo SDK 57, `fetch` sometimes returns a corrupted large response body for this endpoint.

Observed symptoms:

- HTTP status is `200`
- body length is around 2.2 MB
- JSON parsing fails
- returned text appears to be a corrupted slice of the real response rather than the full JSON payload
- corruption varies between runs: sometimes the body appears cut or shifted at the beginning, sometimes at the end

Captured failing state:

- RTK Query status: `PARSING_ERROR`
- HTTP status: `200`
- body length: `2275495`
- parse error: `SyntaxError: Unexpected character: e`

One captured preview started in the middle of what looked like URL-encoded data containing `X-Amz-*` query-string fragments, which strongly suggests the JavaScript layer received a corrupted segment of the response instead of the complete JSON document.

## Control Experiments

These did **not** fix it:

- replacing `response.json()` with `response.text()` followed by `JSON.parse(...)`
- forcing `Accept-Encoding: identity`

This **did** fix it:

- replacing `fetch` with `XMLHttpRequest` for the exact same `GET /elist` request in the same upgraded app

That strongly suggests the problem is specific to the `fetch` body-reading path.

## Why this looks like a regression

- same backend
- same endpoint
- same app logic
- same request semantics
- worked before upgrade on Expo SDK 54
- failed after upgrade on Expo SDK 57 when using `fetch`
- worked again after switching only that request to `XMLHttpRequest`

## Minimal Repro Idea

1. Create a small Expo SDK 57 Android app.
2. Fetch a large JSON response from `https://api.hucksters.io/elist?...` that returns a multi-megabyte payload.
3. Read it with `await response.text()` or `await response.json()`.
4. Observe that the returned body is sometimes corrupted and fails parsing.
5. Make the exact same request with `XMLHttpRequest`.
6. Observe that the XHR body is valid and parses correctly.

## Repro Snippet

```ts
const url = 'https://api.hucksters.io/elist?...';

const response = await fetch(url, {
  method: 'GET',
  headers: {
    Accept: 'application/json',
  },
});

const text = await response.text();
console.log('status', response.status);
console.log('length', text.length);
console.log('preview', text.slice(0, 200));

JSON.parse(text);
```

Equivalent XHR path that succeeds:

```ts
function xhrGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status > 0) {
          resolve(xhr.responseText);
        } else {
          reject(new Error('XHR failed'));
        }
      }
    };
    xhr.onerror = () => reject(new Error('XHR network error'));
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send();
  });
}
```

## Current Workaround

The affected request was moved from `fetch` to `XMLHttpRequest`, and that immediately resolved the problem in the upgraded app.

## Request

Please investigate whether there is a regression in Expo SDK 57 / React Native 0.86 Android `fetch` response body handling for large JSON payloads.