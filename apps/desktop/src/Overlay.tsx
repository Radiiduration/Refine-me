import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, LogicalSize } from '@tauri-apps/api/window';
import './overlay.css';

const API_URL = 'http://localhost:8000';
const TONES = [['friendly', 'Friendly'], ['formal', 'Formal'], ['concise', 'Concise']] as const;

export default function RefineOverlay() {
  const [draft, setDraft] = useState('');
  const [tone, setTone] = useState('formal');
  const [output, setOutput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const overlayWindow = getCurrent();
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    void listen<string>('refine-selection', event => {
      setDraft(event.payload);
      setOutput('');
      setError('');
      setExpanded(false);
      void overlayWindow.setSize(new LogicalSize(58, 58));
    }).then(unlisten => cleanups.push(unlisten));
    void listen<string>('refine-selection-error', event => {
      setError(event.payload);
      setExpanded(true);
      void overlayWindow.setSize(new LogicalSize(352, 330));
    }).then(unlisten => cleanups.push(unlisten));
    return () => cleanups.forEach(unlisten => unlisten());
  }, []);

  const hide = async () => {
    setExpanded(false);
    await overlayWindow.hide();
  };

  const expand = async () => {
    setExpanded(true);
    await overlayWindow.setSize(new LogicalSize(352, 330));
    await overlayWindow.setFocus();
  };

  const refine = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true); setError(''); setOutput('');
    try {
      const response = await fetch(`${API_URL}/rewrite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft, tone, answers: {}, seed: Math.floor(Math.random() * 100000) }),
      });
      if (!response.ok) throw new Error(response.status === 503 ? 'The local model is offline.' : 'Refine could not reach the local model.');
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Refine returned no response stream.');
      const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
        for (const frame of frames) {
          if (!frame.startsWith('data: ')) continue;
          const chunk = frame.slice(6).replace(/\\n/g, '\n');
          if (chunk !== '[DONE]') setOutput(previous => previous + chunk);
        }
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Refine could not rewrite this text.');
    } finally { setBusy(false); }
  };

  const copy = async () => {
    try { await invoke('copy_text', { text: output }); setError('Copied. Your original text is unchanged.'); }
    catch { setError('Could not copy the rewrite.'); }
  };

  return <div className={`native-refine ${expanded ? 'expanded' : ''}`}>
    {!expanded ? <button className="native-fab" onClick={() => void expand()} aria-label="Open Refine" title="Refine selected text">✦</button> : <>
      <header className="native-header"><div><b>Refine</b><small>Selected text · local model</small></div><button className="native-close" onClick={() => void hide()} aria-label="Close">×</button></header>
      <div className="native-body">
        <div className={`native-source ${draft ? '' : 'native-placeholder'}`}>{draft || 'Select text or type a draft in the app you are using.'}</div>
        <div className="native-tones" aria-label="Choose a tone">{TONES.map(([key, label]) => <button key={key} className={tone === key ? 'selected' : ''} onClick={() => setTone(key)}>{label}</button>)}</div>
        {output && <div className="native-output">{output}</div>}
        {error && <div className="native-message">{error}</div>}
      </div>
      <footer className="native-footer">
        {output && <button className="native-secondary" onClick={() => void copy()}>Copy</button>}
        <button className="native-primary" disabled={busy || !draft.trim()} onClick={() => void refine()}>{busy ? 'Refining…' : output ? 'Try again' : 'Refine'}</button>
      </footer>
    </>}
  </div>;
}
