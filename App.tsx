import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type ProbeResult = {
  transport: 'fetch' | 'xhr';
  status: number;
  length: number;
  head: string;
  tail: string;
  parseOk: boolean;
  parseError?: string;
  elapsedMs: number;
};

const DEFAULT_URL =
  'https://api.hucksters.io/elist?tp=0&clustered=1&swlong=REPLACE&swlat=REPLACE&nelong=REPLACE&nelat=REPLACE&page=1';

function summarizeBody(body: string) {
  return {
    length: body.length,
    head: body.slice(0, 200),
    tail: body.slice(-200),
  };
}

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

export default function App() {
  const [url, setUrl] = useState(DEFAULT_URL);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchResult, setFetchResult] = useState<ProbeResult | null>(null);
  const [xhrResult, setXhrResult] = useState<ProbeResult | null>(null);

  const ready = useMemo(() => /^https?:\/\//i.test(url.trim()), [url]);

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
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Expo 57 Fetch Corruption Repro</Text>
        <Text style={styles.muted}>
          Replace placeholder query params in the URL, then run both probes on Android.
        </Text>

        <TextInput
          value={url}
          onChangeText={setUrl}
          style={styles.input}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.buttons}>
          <Button title="Run fetch probe" onPress={onRunFetch} disabled={!ready || running} />
        </View>
        <View style={styles.buttons}>
          <Button title="Run XHR probe" onPress={onRunXhr} disabled={!ready || running} />
        </View>

        {error && <Text style={styles.error}>Error: {error}</Text>}

        {renderResult('fetch', fetchResult)}
        {renderResult('XMLHttpRequest', xhrResult)}
      </ScrollView>
    </SafeAreaView>
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
