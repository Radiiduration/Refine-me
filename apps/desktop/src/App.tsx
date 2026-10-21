import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import {
  Check, CheckCircle2, ChevronDown, Clipboard, Command, Copy, FileEdit,
  HelpCircle, Loader2, Lock, RotateCcw, ShieldCheck, Sparkles, Wand2, X,
} from 'lucide-react';
import './index.css';

const API_URL = 'http://localhost:8000';
const IS_DESKTOP = window.location.protocol === 'tauri:';
const SAMPLE = 'hey can you send me the report when you get a chance';
const BASE_TONES: Record<string, { name: string; description: string }> = {
  friendly: { name: 'Friendly', description: 'Warm and natural' },
  formal: { name: 'Formal', description: 'Polished and professional' },
  concise: { name: 'Concise', description: 'Clear, fewer words' },
  confident: { name: 'Confident', description: 'Direct and assured' },
  kind: { name: 'Kind', description: 'Thoughtful and considerate' },
};
type AppState = 'INPUT' | 'CLARIFYING' | 'TONE_SELECT' | 'REWRITING' | 'DONE';
type Tone = { name: string; description: string };
type Question = { id: string; q: string; options: string[] };

export default function App() {
  const [state, setState] = useState<AppState>('INPUT');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [tones, setTones] = useState<Record<string, Tone>>(BASE_TONES);
  const [rewrittenText, setRewrittenText] = useState('');
  const [currentTone, setCurrentTone] = useState('friendly');
  const [modelOnline, setModelOnline] = useState<boolean | null>(null);
  const [showPrivacy, setShowPrivacy] = useState(false);

  const toneEntries = useMemo(() => Object.entries(tones), [tones]);

  const checkModel = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(2500) });
      setModelOnline(response.ok);
    } catch {
      setModelOnline(false);
    }
  }, []);

  useEffect(() => {
    void checkModel();
    const interval = window.setInterval(checkModel, 30_000);
    fetch(`${API_URL}/tones`).then(r => r.ok ? r.json() : null).then(data => {
      if (data && typeof data === 'object') setTones(data);
    }).catch(() => undefined);
    return () => window.clearInterval(interval);
  }, [checkModel]);

  useEffect(() => {
    if (!IS_DESKTOP) return;
    let unlisten: (() => void) | undefined;
    void listen<string>('refine-selection', event => {
      setText(event.payload);
      setRewrittenText('');
      setError('');
      setNotice('Selected text captured. Choose a tone, then refine.');
      setState('INPUT');
    }).then(dispose => { unlisten = dispose; });
    return () => unlisten?.();
  }, []);

  const captureClipboard = async () => {
    try {
      setText(IS_DESKTOP ? await invoke<string>('get_clipboard_text') : await navigator.clipboard.readText());
      setError('');
    } catch {
      setError('Clipboard access was unavailable. You can paste directly into the draft.');
    }
  };

  const transitionToTone = async () => {
    try {
      const response = await fetch(`${API_URL}/tones`);
      if (!response.ok) throw new Error('Tone options are unavailable. Check that Refine is running.');
      setTones(await response.json());
      setState('TONE_SELECT');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load tone options.');
      setState('INPUT');
    }
  };

  const handleClarify = async () => {
    if (!text.trim() || loading) return;
    setLoading(true); setError(''); setNotice(''); setState('CLARIFYING');
    try {
      const response = await fetch(`${API_URL}/clarify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, context: { app: 'refine-web' } }),
      });
      if (!response.ok) throw new Error('Could not check the draft. Is the local model running?');
      const data = await response.json();
      if (data.needs_clarification && data.questions?.length) setQuestions(data.questions);
      else await transitionToTone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not check the draft.');
      setState('INPUT');
    } finally { setLoading(false); }
  };

  const handleRewrite = async (tone = currentTone) => {
    if (!text.trim() || loading) return;
    setCurrentTone(tone); setLoading(true); setError(''); setNotice('');
    setRewrittenText(''); setState('REWRITING');
    try {
      const response = await fetch(`${API_URL}/rewrite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, tone, answers, seed: Math.floor(Math.random() * 100000) }),
      });
      if (!response.ok) throw new Error(response.status === 503
        ? 'The local model is offline. Start the Refine model server, then try again.'
        : 'The rewrite could not be started. Check the Refine API.');
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
          if (chunk === '[DONE]') setState('DONE');
          else setRewrittenText(previous => previous + chunk);
        }
      }
      setState('DONE');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The rewrite failed.');
      setState('INPUT');
    } finally { setLoading(false); void checkModel(); }
  };

  const copyResult = async () => {
    try {
      if (IS_DESKTOP) await invoke('copy_text', { text: rewrittenText });
      else await navigator.clipboard.writeText(rewrittenText);
      setNotice('Copied to clipboard. Your original draft is unchanged.');
    } catch { setError('Could not copy automatically. Select the result and copy it.'); }
  };

  const replaceInApp = async () => {
    try {
      await invoke('paste_text', { text: rewrittenText });
      setNotice('Refined text pasted into the app you were using.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not replace text in the other app. Check Refine’s Accessibility permission.');
    }
  };

  const reset = () => {
    setState('INPUT'); setRewrittenText(''); setError(''); setNotice(''); setAnswers({}); setQuestions([]);
  };

  return (
    <div className="refine-app">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Refine home">
          <span className="brand-mark"><Sparkles size={18} strokeWidth={2.3} /></span>
          <span className="brand-name">refine<span className="brand-period">.</span><small>PRIVATE WRITING STUDIO</small></span>
        </a>
        <button className="new-draft" onClick={reset}><FileEdit size={17} /> New draft</button>
        <div className="sidebar-label">YOUR SPACE</div>
        <button className="side-link active"><span className="side-link-icon"><Wand2 size={17} /></span> Writing studio</button>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="note-icon"><Lock size={16} /></span>
          <strong>Your words stay yours.</strong>
          <p>Refine runs on your own local model. No account, no cloud history.</p>
          <button onClick={() => setShowPrivacy(true)}>How privacy works <ChevronDown size={13} /></button>
        </div>
        <div className="sidebar-foot"><span className="mini-mark"><Sparkles size={13} /></span> Made for thoughtful writing <span className="version">0.1</span></div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark"><Sparkles size={16} /></span><b>refine<span className="brand-period">.</span></b></div>
          <div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>Writing studio</strong></div>
          <div className="topbar-actions">
            <button className="privacy-chip" onClick={() => setShowPrivacy(true)}><ShieldCheck size={15} /> Private by design</button>
            <button className="help-button" aria-label="Privacy details" onClick={() => setShowPrivacy(true)}><HelpCircle size={18} /></button>
          </div>
        </header>

        <div className="page-content">
          <section className="welcome-row">
            <div>
              <div className="eyebrow"><span className="eyebrow-dot" /> YOUR PRIVATE WRITING SPACE</div>
              <h1>Make it sound like <em>you.</em></h1>
              <p className="welcome-copy">Bring a rough thought. Leave with words that feel right.</p>
            </div>
            <div className={`model-status ${modelOnline ? 'is-online' : modelOnline === false ? 'is-offline' : 'is-checking'}`}>
              <span className="status-indicator" />
              <span><b>{modelOnline ? 'Local model ready' : modelOnline === false ? 'Model not connected' : 'Checking local model'}</b><small>{modelOnline ? 'Your device · Private' : 'Runs on your computer'}</small></span>
              {modelOnline === false && <button onClick={checkModel} aria-label="Check model connection"><RotateCcw size={14} /></button>}
            </div>
          </section>

          {error && <div className="alert alert-error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><CheckCircle2 size={16} /><span>{notice}</span><button onClick={() => setNotice('')} aria-label="Dismiss notice"><X size={16} /></button></div>}

          <section className="work-grid">
            <div className="draft-column">
              <article className="panel draft-panel">
                <div className="panel-heading">
                  <div><span className="panel-kicker">01 <span>·</span> YOUR DRAFT</span><h2>Start with what you have</h2></div>
                  <button className="quiet-icon" title="Clear draft" aria-label="Clear draft" onClick={() => setText('')} disabled={!text}><X size={17} /></button>
                </div>
                <div className="textarea-wrap">
                  <textarea value={text} onChange={event => setText(event.target.value)} onKeyDown={event => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void handleRewrite();
                  }} placeholder="Write a note, an email, or just the start of an idea…" aria-label="Your draft" />
                  <div className="editor-bottom"><span>{text.length} characters</span><div><button onClick={captureClipboard}><Clipboard size={14} /> Paste</button><span className="keyboard-hint"><Command size={12} /> ↵</span></div></div>
                </div>
                {!text && <button className="example-link" onClick={() => setText(SAMPLE)}><Sparkles size={14} /> Try a sample sentence <span>“hey can you send the report…”</span></button>}
                <div className="tone-section">
                  <div className="tone-label"><span>Choose a tone</span><span>Just the way you mean it</span></div>
                  <div className="tone-list" role="group" aria-label="Rewrite tone">
                    {toneEntries.map(([key, tone]) => <button key={key} className={`tone-chip ${currentTone === key ? 'selected' : ''}`} onClick={() => setCurrentTone(key)} aria-pressed={currentTone === key}>{tone.name}</button>)}
                  </div>
                </div>
                {state === 'CLARIFYING' && <div className="clarify-block">
                  {loading ? <div className="loading-line"><Loader2 className="spin" size={17} /> Looking for missing context…</div> : questions.map(question => <div className="question" key={question.id}><b>{question.q}</b><div className="question-options">{question.options.map(option => <button key={option} className={`question-chip ${answers[question.id] === option ? 'selected' : ''}`} onClick={() => setAnswers(prev => ({ ...prev, [question.id]: option }))}>{option}</button>)}<button className="question-chip other" onClick={() => { const value = prompt(question.q); if (value?.trim()) setAnswers(prev => ({ ...prev, [question.id]: value.trim() })); }}>Other</button></div></div>)}
                  {!loading && questions.length > 0 && <button className="context-continue" onClick={transitionToTone}>Continue to tone choices <ChevronDown size={15} /></button>}
                </div>}
                {state === 'TONE_SELECT' && <div className="advanced-tones"><span>Choose a tone to continue</span>{toneEntries.map(([key, tone]) => <button key={key} onClick={() => void handleRewrite(key)}><b>{tone.name}</b><small>{tone.description}</small></button>)}</div>}
                <div className="draft-actions">
                  <button className="refine-button" disabled={!text.trim() || loading} onClick={() => void handleRewrite()}>{loading && state === 'REWRITING' ? <Loader2 className="spin" size={17} /> : <Sparkles size={17} />} Refine my writing <span>⌘ ↵</span></button>
                  <button className="context-button" disabled={!text.trim() || loading} onClick={() => void handleClarify()}>Add context first <ChevronDown size={15} /></button>
                </div>
              </article>
              <div className="under-note"><Lock size={13} /> Your draft is sent only to the local model you configured.</div>
            </div>

            <article className={`panel result-panel ${state === 'DONE' ? 'result-ready' : ''}`}>
              <div className="panel-heading result-heading"><div><span className="panel-kicker">02 <span>·</span> YOUR REFINED VERSION</span><h2>{state === 'REWRITING' ? 'Finding the right words' : state === 'DONE' ? 'A little more you' : 'Your words, refined'}</h2></div>{state === 'DONE' && <span className="ready-badge"><Check size={13} /> Ready</span>}</div>
              {state === 'REWRITING' || state === 'DONE' ? <>
                <div className={`result-copy ${rewrittenText ? '' : 'result-empty'}`}>{rewrittenText || <><Loader2 className="spin result-spinner" size={22} /><span>Your rewrite is taking shape…</span></>}</div>
                <div className="result-meta"><span className="result-tone"><Sparkles size={12} /> {tones[currentTone]?.name || currentTone}</span><span>{state === 'REWRITING' ? 'Writing locally' : 'Original draft unchanged'}</span></div>
                {state === 'DONE' && <div className="result-actions"><button className="copy-button" onClick={() => void copyResult()}><Copy size={15} /> Copy</button>{IS_DESKTOP && <button className="replace-button" onClick={() => void replaceInApp()}><Check size={15} /> Replace in app</button>}<button className="again-button" onClick={() => void handleRewrite()} aria-label="Generate another version"><RotateCcw size={16} /></button></div>}
              </> : <div className="empty-result">
                <div className="result-art"><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="art-spark"><Sparkles size={25} /></span><span className="art-dot dot-one" /><span className="art-dot dot-two" /></div>
                <h3>A clearer thought is just ahead.</h3><p>Your rewrite will appear here. Pick a tone that feels like you, then refine your draft.</p>
                <div className="steps"><div><span>1</span> Write or paste your draft</div><div><span>2</span> Choose the tone</div><div><span>3</span> Keep the words you love</div></div>
              </div>}
              <div className="result-foot"><span><span className="foot-spark">✳</span> Made for your voice</span><span>Nothing is saved</span></div>
            </article>
          </section>

          <footer className="page-footer"><span>REFINE <i>·</i> LOCAL BY DESIGN</span><button onClick={() => setShowPrivacy(true)}>Your privacy <ChevronDown size={12} /></button></footer>
        </div>
      </main>

      {showPrivacy && <div className="modal-backdrop" onClick={() => setShowPrivacy(false)}><section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPrivacy(false)} aria-label="Close"><X size={18} /></button><span className="modal-icon"><ShieldCheck size={22} /></span><div className="panel-kicker">REFINE · PRIVATE BY DESIGN</div><h2 id="privacy-title">Your words stay with you.</h2><p>Refine sends your draft to the local API and model you run on your own computer. It does not create an account or keep a cloud history.</p><div className="privacy-points"><div><CheckCircle2 size={17} /><span><b>No account needed</b><small>Nothing to sign up for or sync.</small></span></div><div><CheckCircle2 size={17} /><span><b>Your model, your machine</b><small>Drafts go to your configured local model.</small></span></div><div><CheckCircle2 size={17} /><span><b>You stay in control</b><small>Your original text stays untouched until you choose a rewrite.</small></span></div></div><button className="modal-done" onClick={() => setShowPrivacy(false)}>Got it</button></section></div>}
    </div>
  );
}
