import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { getCurrent, LogicalSize } from '@tauri-apps/api/window';

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
      <header><div><b>Refine</b><small>Selected text · local model</small></div><button className="native-close" onClick={() => void hide()} aria-label="Close">×</button></header>
      <div className="native-body">
        <div className="native-source">{draft}</div>
        <div className="native-tones" aria-label="Choose a tone">{TONES.map(([key, label]) => <button key={key} className={tone === key ? 'selected' : ''} onClick={() => setTone(key)}>{label}</button>)}</div>
        {output && <div className="native-output">{output}</div>}
        {error && <div className="native-message">{error}</div>}
      </div>
      <footer>
        {output && <button className="native-secondary" onClick={() => void copy()}>Copy</button>}
        <button className="native-primary" disabled={busy} onClick={() => void refine()}>{busy ? 'Refining…' : output ? 'Try again' : 'Refine'}</button>
      </footer>
    </>}
    <style>{`
      *{box-sizing:border-box}html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#1d3028}
      .native-refine{width:58px;height:58px;padding:7px;background:transparent}.native-fab{width:44px;height:44px;border:1px solid #d8e7dc;border-radius:15px;background:#fff;color:#12664d;font-size:22px;box-shadow:0 8px 26px #17241f30;cursor:pointer;transition:transform .15s}.native-fab:hover{transform:scale(1.06)}
      .native-refine.expanded{width:352px;height:330px;padding:0;background:#fff;border:1px solid #dfe8e1;border-radius:18px;box-shadow:0 20px 65px #17241f38;overflow:hidden}
      header{height:58px;padding:0 17px;border-bottom:1px solid #edf2ef;display:flex;align-items:center;justify-content:space-between}header b{display:block;font-size:15px}header small{display:block;color:#7b8981;font-size:11px;margin-top:2px}.native-close{width:28px;height:28px;border:0;border-radius:8px;background:#f5f8f5;color:#738179;font-size:20px;cursor:pointer}
      .native-body{padding:14px 16px;height:218px;overflow:auto}.native-source,.native-output{white-space:pre-wrap;overflow-wrap:anywhere;border-radius:11px;padding:10px 12px;max-height:86px;overflow:auto;font-size:13px;line-height:1.5}.native-source{background:#f6f9f5;border:1px solid #e8eee8;color:#526158}.native-output{margin-top:10px;background:#f3f8f3;border:1px solid #deeadf;color:#244b37}
      .native-tones{display:flex;gap:6px;margin:11px 0}.native-tones button{padding:6px 10px;border:1px solid #e1e9e3;border-radius:999px;background:#fff;color:#4f6257;font-size:11px;cursor:pointer}.native-tones button.selected{background:#e8f3e8;border-color:#b8d5b8;color:#245b3b}.native-message{font-size:11px;color:#64736a;margin-top:7px}
      footer{height:53px;padding:8px 14px;border-top:1px solid #edf2ef;display:flex;justify-content:flex-end;gap:8px}.native-primary,.native-secondary{padding:8px 13px;border-radius:10px;font:inherit;font-size:12px;font-weight:650;cursor:pointer}.native-primary{background:#12664d;border:1px solid #12664d;color:white}.native-primary:disabled{opacity:.65}.native-secondary{background:white;border:1px solid #dfe8e1;color:#486052}
    `}</style>
  </div>;
}
