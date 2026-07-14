import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  Button,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { configureStore } from '@reduxjs/toolkit';
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { Provider } from 'react-redux';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

type ProbeResult = {
  transport: 'fetch' | 'xhr' | 'fetchBaseQueryJson' | 'fetchBaseQueryText';
  status: number;
  length: number;
  head: string;
  tail: string;
  parseOk: boolean;
  parseError?: string;
  elapsedMs: number;
  notes?: string;
};

type StressSummary = {
  transport: 'fetchBaseQueryJson' | 'fetchBaseQueryText';
  attempts: number;
  failures: number;
  totalElapsedMs: number;
  lastStatus: number;
};

const DEFAULT_URL =
  'https://api.hucksters.io/elist?t=NEXT_365&tp=1&swlong=-123.008&swlat=49.227&nelong=-122.937&nelat=49.315&clustered=1&page=1';

function summarizeBody(body: string) {
  return {
    length: body.length,
    head: body.slice(0, 200),
    tail: body.slice(-200),
  };
}

function safeStringify(value: unknown): string {
  try {
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildResultFromRaw(
  transport: ProbeResult['transport'],
  status: number,
  raw: string,
  elapsedMs: number,
  notes?: string,
): ProbeResult {
  const summary = summarizeBody(raw);

  try {
    JSON.parse(raw);
    return {
      transport,
      status,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: true,
      elapsedMs,
      notes,
    };
  } catch (error) {
    return {
      transport,
      status,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: false,
      parseError: error instanceof Error ? error.message : String(error),
      elapsedMs,
      notes,
    };
  }
}

const reproApi = createApi({
  reducerPath: 'reproApi',
  baseQuery: fetchBaseQuery({
    baseUrl: '',
  }),
  endpoints: (builder) => ({
    probeBQJson: builder.query<unknown, string>({
      query: (url) => ({
        url,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      }),
    }),
    probeBQText: builder.query<string, string>({
      query: (url) => ({
        url,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        responseHandler: 'text',
      }),
    }),
  }),
});

const store = configureStore({
  reducer: {
    [reproApi.reducerPath]: reproApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(reproApi.middleware),
});

async function probeWithFetch(url: string): Promise<ProbeResult> {
  const started = Date.now();
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  const text = await response.text();
  const summary = summarizeBody(text);

  try {
    JSON.parse(text);
    return {
      transport: 'fetch',
      status: response.status,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: true,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      transport: 'fetch',
      status: response.status,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: false,
      parseError: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  }
}

async function probeWithXhr(url: string): Promise<ProbeResult> {
  const started = Date.now();

  const text = await new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        if (xhr.status > 0) {
          resolve(xhr.responseText);
        } else {
          reject(new Error('XHR failed with status 0'));
        }
      }
    };

    xhr.ontimeout = () => reject(new Error('XHR timed out'));
    xhr.onerror = () => reject(new Error('XHR network error'));

    xhr.timeout = 60000;
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.send();
  });

  const summary = summarizeBody(text);

  try {
    JSON.parse(text);
    return {
      transport: 'xhr',
      status: 200,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: true,
      elapsedMs: Date.now() - started,
    };
  } catch (error) {
    return {
      transport: 'xhr',
      status: 200,
      length: summary.length,
      head: summary.head,
      tail: summary.tail,
      parseOk: false,
      parseError: error instanceof Error ? error.message : String(error),
      elapsedMs: Date.now() - started,
    };
  }
}

function ReproHarness() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [attemptCountText, setAttemptCountText] = useState('5');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchResult, setFetchResult] = useState<ProbeResult | null>(null);
  const [xhrResult, setXhrResult] = useState<ProbeResult | null>(null);
  const [bqJsonResult, setBqJsonResult] = useState<ProbeResult | null>(null);
  const [bqTextResult, setBqTextResult] = useState<ProbeResult | null>(null);
  const [stressSummary, setStressSummary] = useState<StressSummary | null>(null);

  const [triggerBQJson] = reproApi.useLazyProbeBQJsonQuery();
  const [triggerBQText] = reproApi.useLazyProbeBQTextQuery();

  const ready = useMemo(() => /^https?:\/\//i.test(url.trim()), [url]);
  const stressAttempts = useMemo(() => {
    const parsed = Number.parseInt(attemptCountText, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      return 5;
    }

    return Math.min(parsed, 20);
  }, [attemptCountText]);

  const onRunFetch = async () => {
    try {
      setError(null);
      setRunning(true);
      const result = await probeWithFetch(url.trim());
      setFetchResult(result);
      console.log('FETCH RESULT', result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onRunXhr = async () => {
    try {
      setError(null);
      setRunning(true);
      const result = await probeWithXhr(url.trim());
      setXhrResult(result);
      console.log('XHR RESULT', result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onRunBQJson = async () => {
    try {
      setError(null);
      setStressSummary(null);
      setRunning(true);
      const started = Date.now();
      const result = await triggerBQJson(url.trim(), false);
      const elapsedMs = Date.now() - started;

      if ('error' in result && result.error) {
        const errorData = (result.error as { data?: unknown; originalStatus?: number; error?: string; status?: number | string; }).data;
        const raw = safeStringify(errorData ?? result.error);
        const status = Number((result.error as { originalStatus?: number; status?: number | string; }).originalStatus ?? 0);
        const probeResult = buildResultFromRaw(
          'fetchBaseQueryJson',
          status,
          raw,
          elapsedMs,
          safeStringify(result.error),
        );
        if (probeResult.parseOk) {
          probeResult.parseOk = false;
          probeResult.parseError = safeStringify((result.error as { error?: string; status?: number | string; }).error ?? (result.error as { status?: number | string; }).status ?? 'RTK query error');
        }
        setBqJsonResult(probeResult);
        return;
      }

      const payload = safeStringify(result.data);
      setBqJsonResult(buildResultFromRaw('fetchBaseQueryJson', 200, payload, elapsedMs));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onRunBQText = async () => {
    try {
      setError(null);
      setStressSummary(null);
      setRunning(true);
      const started = Date.now();
      const result = await triggerBQText(url.trim(), false);
      const elapsedMs = Date.now() - started;

      if ('error' in result && result.error) {
        const raw = safeStringify((result.error as { data?: unknown }).data ?? result.error);
        const status = Number((result.error as { originalStatus?: number; status?: number | string }).originalStatus ?? 0);
        const probeResult = buildResultFromRaw(
          'fetchBaseQueryText',
          status,
          raw,
          elapsedMs,
          safeStringify(result.error),
        );
        if (probeResult.parseOk) {
          probeResult.parseOk = false;
          probeResult.parseError = safeStringify((result.error as { error?: string; status?: number | string }).error ?? (result.error as { status?: number | string }).status ?? 'RTK query error');
        }
        setBqTextResult(probeResult);
        return;
      }

      const raw = typeof result.data === 'string' ? result.data : safeStringify(result.data);
      setBqTextResult(buildResultFromRaw('fetchBaseQueryText', 200, raw, elapsedMs));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const onRunStress = async (transport: 'fetchBaseQueryJson' | 'fetchBaseQueryText') => {
    try {
      setError(null);
      setRunning(true);
      setStressSummary(null);

      let firstFailure: ProbeResult | null = null;
      let lastResult: ProbeResult | null = null;
      let failures = 0;
      const started = Date.now();

      for (let attempt = 1; attempt <= stressAttempts; attempt += 1) {
        if (transport === 'fetchBaseQueryJson') {
          const startedAt = Date.now();
          const result = await triggerBQJson(url.trim(), false);
          const elapsedMs = Date.now() - startedAt;

          if ('error' in result && result.error) {
            const errorData = (result.error as { data?: unknown; originalStatus?: number; error?: string; status?: number | string; }).data;
            const raw = safeStringify(errorData ?? result.error);
            const status = Number((result.error as { originalStatus?: number; status?: number | string }).originalStatus ?? 0);
            const probeResult = buildResultFromRaw(
              'fetchBaseQueryJson',
              status,
              raw,
              elapsedMs,
              safeStringify(result.error),
            );
            if (probeResult.parseOk) {
              probeResult.parseOk = false;
              probeResult.parseError = safeStringify((result.error as { error?: string; status?: number | string }).error ?? (result.error as { status?: number | string }).status ?? 'RTK query error');
            }
            lastResult = probeResult;
          } else {
            const payload = safeStringify(result.data);
            lastResult = buildResultFromRaw('fetchBaseQueryJson', 200, payload, elapsedMs);
          }
        } else {
          const startedAt = Date.now();
          const result = await triggerBQText(url.trim(), false);
          const elapsedMs = Date.now() - startedAt;

          if ('error' in result && result.error) {
            const raw = safeStringify((result.error as { data?: unknown }).data ?? result.error);
            const status = Number((result.error as { originalStatus?: number; status?: number | string }).originalStatus ?? 0);
            const probeResult = buildResultFromRaw(
              'fetchBaseQueryText',
              status,
              raw,
              elapsedMs,
              safeStringify(result.error),
            );
            if (probeResult.parseOk) {
              probeResult.parseOk = false;
              probeResult.parseError = safeStringify((result.error as { error?: string; status?: number | string }).error ?? (result.error as { status?: number | string }).status ?? 'RTK query error');
            }
            lastResult = probeResult;
          } else {
            const raw = typeof result.data === 'string' ? result.data : safeStringify(result.data);
            lastResult = buildResultFromRaw('fetchBaseQueryText', 200, raw, elapsedMs);
          }
        }

        if (transport === 'fetchBaseQueryJson') {
          setBqJsonResult(lastResult);
        } else {
          setBqTextResult(lastResult);
        }

        if (lastResult && !lastResult.parseOk) {
          failures += 1;
          if (!firstFailure) {
            firstFailure = lastResult;
          }
        }
      }

      setStressSummary({
        transport,
        attempts: stressAttempts,
        failures,
        totalElapsedMs: Date.now() - started,
        lastStatus: lastResult?.status ?? 0,
      });

      if (firstFailure) {
        if (transport === 'fetchBaseQueryJson') {
          setBqJsonResult(firstFailure);
        } else {
          setBqTextResult(firstFailure);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const renderResult = (label: string, result: ProbeResult | null) => {
    if (!result) {
      return <Text style={styles.muted}>{label}: not run yet</Text>;
    }

    return (
      <View style={styles.resultCard}>
        <Text style={styles.resultTitle}>{label}</Text>
        <Text>Status: {result.status}</Text>
        <Text>Body length: {result.length}</Text>
        <Text>Elapsed (ms): {result.elapsedMs}</Text>
        <Text>JSON parse ok: {String(result.parseOk)}</Text>
        {!result.parseOk && <Text>Parse error: {result.parseError}</Text>}
        <Text style={styles.subTitle}>Head (200):</Text>
        <Text style={styles.mono}>{result.head}</Text>
        <Text style={styles.subTitle}>Tail (200):</Text>
        <Text style={styles.mono}>{result.tail}</Text>
      </View>
    );
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={styles.container}>
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Expo 57 Fetch Corruption Repro</Text>
          <Text style={styles.muted}>
              Run all four probes with the same URL on Android to compare direct transports vs RTK fetchBaseQuery.
          </Text>

            <Text style={styles.muted}>
              For intermittent failures, use the stress buttons to run repeated back-to-back RTK requests.
            </Text>

          <TextInput
            value={url}
            onChangeText={setUrl}
            style={styles.input}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TextInput
            value={attemptCountText}
            onChangeText={setAttemptCountText}
            style={styles.attemptInput}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <View style={styles.buttons}>
            <Button title="Run fetch probe" onPress={onRunFetch} disabled={!ready || running} />
          </View>
          <View style={styles.buttons}>
            <Button title="Run XHR probe" onPress={onRunXhr} disabled={!ready || running} />
          </View>
          <View style={styles.buttons}>
            <Button title="Run fetchBaseQuery JSON probe" onPress={onRunBQJson} disabled={!ready || running} />
          </View>
          <View style={styles.buttons}>
            <Button title="Run fetchBaseQuery TEXT probe" onPress={onRunBQText} disabled={!ready || running} />
          </View>
          <View style={styles.buttons}>
            <Button title={`Stress fetchBaseQuery JSON x${stressAttempts}`} onPress={() => onRunStress('fetchBaseQueryJson')} disabled={!ready || running} />
          </View>
          <View style={styles.buttons}>
            <Button title={`Stress fetchBaseQuery TEXT x${stressAttempts}`} onPress={() => onRunStress('fetchBaseQueryText')} disabled={!ready || running} />
          </View>

          {error && <Text style={styles.error}>Error: {error}</Text>}

          {stressSummary && (
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>Stress Summary</Text>
              <Text>Transport: {stressSummary.transport}</Text>
              <Text>Attempts: {stressSummary.attempts}</Text>
              <Text>Failures: {stressSummary.failures}</Text>
              <Text>Total elapsed (ms): {stressSummary.totalElapsedMs}</Text>
              <Text>Last status: {stressSummary.lastStatus}</Text>
            </View>
          )}

          {renderResult('fetch', fetchResult)}
          {renderResult('XMLHttpRequest', xhrResult)}
          {renderResult('fetchBaseQueryJson', bqJsonResult)}
          {renderResult('fetchBaseQueryText', bqTextResult)}
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function App() {
  return (
    <Provider store={store}>
      <ReproHarness />
    </Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f8fb',
  },
  content: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  muted: {
    color: '#4f5f7a',
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#bac8e6',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
    textAlignVertical: 'top',
  },
  attemptInput: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#bac8e6',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#ffffff',
  },
  buttons: {
    marginTop: 4,
  },
  error: {
    color: '#b00020',
    fontWeight: '600',
  },
  resultCard: {
    borderWidth: 1,
    borderColor: '#d5def0',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#ffffff',
    gap: 6,
  },
  resultTitle: {
    fontWeight: '700',
    fontSize: 16,
  },
  subTitle: {
    marginTop: 4,
    fontWeight: '600',
  },
  mono: {
    fontFamily: 'monospace',
    color: '#1c2a44',
  },
});
