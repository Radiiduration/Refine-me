import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight, Check, CheckCircle2, ChevronDown, Clipboard, Command, Copy, FileEdit,
  Globe2, HelpCircle, Laptop, Loader2, Lock, RotateCcw, ShieldCheck, Smartphone,
  Sparkles, Terminal, Wand2, X,
} from 'lucide-react';
import './index.css';

const DEFAULT_API_URL = import.meta.env.VITE_REFINE_API_URL || 'http://localhost:8000';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function normalizeApiUrl(value: string): string {
  const url = new URL(value.trim());
  const loopback = LOOPBACK_HOSTS.has(url.hostname);
  if (url.username || url.password || url.search || url.hash || (loopback ? url.protocol !== 'http:' && url.protocol !== 'https:' : url.protocol !== 'https:')) {
    throw new Error('Use a local loopback address or a trusted HTTPS API address.');
  }
  return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
}
function initialApiUrl(): string {
  try { return normalizeApiUrl(localStorage.getItem('refine.apiUrl') || DEFAULT_API_URL); }
  catch { return DEFAULT_API_URL; }
}
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
type InstallPlatform = 'Mac' | 'Web' | 'Android' | 'iPhone' | 'Desktop';

const INSTALL_COMMANDS = {
  clone: 'git clone https://github.com/Radiiduration/Refine-me.git\ncd Refine-me',
  server: 'brew install llama.cpp\npython3 -m venv .venv\n. .venv/bin/activate\npip install -r apps/api/requirements.lock',
  model: 'make model-server',
  api: 'make api',
  android: 'make android-build',
  ios: 'make ios-project',
  desktop: 'cd apps/desktop\nnpm ci\nnpm run tauri dev',
  web: 'cd apps/web\nnpm ci\nnpm run dev',
  remoteApi: 'export REFINE_MOBILE_TOKEN="$(openssl rand -hex 32)"\nexport REFINE_ALLOWED_ORIGINS="https://your-site.example"\nexport REFINE_TLS_CERTFILE="/path/to/trusted-cert.pem"\nexport REFINE_TLS_KEYFILE="/path/to/private-key.pem"\nmake mobile-api',
};

function InstallGuide({ onConfigure, onOpenStudio }: { onConfigure: () => void; onOpenStudio: () => void }) {
  const [platform, setPlatform] = useState<InstallPlatform>('Mac');
  const [copied, setCopied] = useState('');
  const copy = async (key: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(key);
      window.setTimeout(() => setCopied(''), 1800);
    } catch {
      setCopied('');
    }
  };
  const command = (key: keyof typeof INSTALL_COMMANDS, label: string) => (
    <div className="install-command">
      <div><span><Terminal size={13} /> TERMINAL / {label}</span><button onClick={() => void copy(key, INSTALL_COMMANDS[key])} aria-label={`Copy ${label} command`}>{copied === key ? <Check size={14} /> : <Copy size={14} />}{copied === key ? 'Copied' : 'Copy'}</button></div>
      <pre><code>{INSTALL_COMMANDS[key]}</code></pre>
    </div>
  );

  return (
    <section className="install-page" id="install-guide">
      <div className="install-hero">
        <div className="install-hero-copy">
          <div className="install-kicker"><span /> YOUR MODEL. YOUR WORDS.</div>
          <h1>Private writing,<br /><em>set up your way.</em></h1>
          <p>Run the model on your Mac, then connect Refine on the devices where you write. Follow the steps for your setup below.</p>
          <div className="install-hero-actions"><button className="lime-button" onClick={() => document.getElementById('install-steps')?.scrollIntoView({ behavior: 'smooth' })}>Start setup <ArrowRight size={16} /></button><button className="outline-button" onClick={onOpenStudio}>Open writing studio</button></div>
          <div className="install-facts"><span>LOCAL MODEL</span><i /> <span>NO ACCOUNT</span><i /> <span>YOUR API</span></div>
        </div>
        <div className="install-visual" aria-label="Refine setup flow diagram">
          <div className="visual-topline"><span>REFINE / PRIVATE BY DESIGN</span><span>SETUP 001</span></div>
          <div className="flow-orbit orbit-a" /><div className="flow-orbit orbit-b" />
          <div className="flow-core"><Sparkles size={25} /><b>REFINE</b><small>LOCAL MODEL</small></div>
          <div className="flow-node node-server"><small>01 / RUN</small><b>Your Mac</b><span>Model + API</span></div>
          <div className="flow-node node-client"><small>02 / CONNECT</small><b>Your device</b><span>Web · Android · iPhone</span></div>
          <div className="visual-caption"><span>WORDS STAY YOURS</span><span>REFINE / 001</span></div>
        </div>
      </div>

      <div className="install-section" id="install-steps">
        <div className="section-heading">
          <div><div className="install-kicker"><span /> GET STARTED</div><h2>One local server.<br /><em>Your choice of keyboard.</em></h2></div>
          <p>Start with the Mac that runs your model. Then pick the Refine client you want to install.</p>
        </div>
        <div className="requirements-strip"><b>BEFORE YOU START</b><span>Mac · 16 GB memory recommended · Git · Python 3 · llama.cpp</span><span className="optional-note">The iPhone and Android keyboards connect to the Mac over trusted Wi-Fi.</span></div>
        <div className="repo-install-row"><div><b>FIRST, GET THE PROJECT</b><span>Run these commands in Terminal, then follow the setup for your device.</span></div>{command('clone', 'CLONE REFINE')}</div>

        <div className="install-tabs" role="tablist" aria-label="Choose an installation guide">
          {(['Mac', 'Web', 'Android', 'iPhone', 'Desktop'] as InstallPlatform[]).map((item) => <button key={item} role="tab" aria-selected={platform === item} className={platform === item ? 'selected' : ''} onClick={() => setPlatform(item)}>{item === 'Mac' ? <Laptop size={16} /> : item === 'Web' ? <Globe2 size={16} /> : item === 'Desktop' ? <Terminal size={16} /> : <Smartphone size={16} />}{item}</button>)}
        </div>

        <div className="install-content">
          <div className="install-instructions">
            {platform === 'Mac' && <>
              <div className="install-step"><span>01</span><div><h3>Install the local model runtime</h3><p>Install llama.cpp and the Python packages Refine uses. The model weights download the first time you start the model server.</p>{command('server', 'INSTALL')}</div></div>
              <div className="install-step"><span>02</span><div><h3>Start the model and API</h3><p>Keep each process running in its own terminal. The API stays on this Mac at <code>127.0.0.1:8000</code>.</p>{command('model', 'MODEL SERVER')}{command('api', 'LOCAL API')}</div></div>
              <div className="install-step"><span>03</span><div><h3>Choose a Refine client</h3><p>Use the Web tab to run the editor locally, or select Android, iPhone, or Desktop for device-specific instructions.</p><button className="text-action" onClick={() => setPlatform('Web')}>Choose a client <ArrowRight size={14} /></button></div></div>
            </>}
            {platform === 'Web' && <>
              <div className="install-step"><span>01</span><div><h3>Run the editor on this Mac</h3><p>Start the local API first, then run the web editor from the repository root. It connects to the API on port 8000.</p>{command('web', 'WEB EDITOR')}</div></div>
              <div className="install-step"><span>02</span><div><h3>Connect a hosted website</h3><p>A deployed website is a static editor; it does not host your model. For access from a hosted site, configure a trusted HTTPS API and add that exact site origin to <code>REFINE_ALLOWED_ORIGINS</code>. Replace the example origin and certificate paths before running this in your API terminal.</p>{command('remoteApi', 'PRIVATE HTTPS API')}<div className="install-callout"><Lock size={15} /><span>Trust the certificate on each client and keep the API on a trusted private network. Never share the generated token or private TLS key. Don’t expose the development API directly to the public internet.</span></div></div></div>
              <div className="install-step"><span>03</span><div><h3>Save your connection</h3><p>Enter the API address and device token in Refine’s privacy settings. The token stays in this browser tab’s memory.</p><button className="text-action" onClick={onConfigure}>Configure API connection <ArrowRight size={14} /></button></div></div>
            </>}
            {platform === 'Android' && <>
              <div className="install-step"><span>01</span><div><h3>Build the Android app</h3><p>From the repository root, create the installable debug APK.</p>{command('android', 'ANDROID BUILD')}<p className="small-help">APK: <code>apps/android/app/build/outputs/apk/debug/app-debug.apk</code></p></div></div>
              <div className="install-step"><span>02</span><div><h3>Install and connect</h3><p>Install the APK with Android Studio or transfer it to your phone. In Refine, enter your Mac’s private HTTPS address and the device token used by the API. The token is encrypted with Android Keystore.</p><div className="install-callout"><Lock size={15} /><span>Phone and Mac must be on the same trusted Wi-Fi. Android requires HTTPS for the connection.</span></div></div></div>
              <div className="install-step"><span>03</span><div><h3>Enable Refine Keyboard</h3><p>Open Refine → Enable Refine Keyboard, allow it in Android settings, then select Refine from the keyboard switcher.</p></div></div>
            </>}
            {platform === 'iPhone' && <>
              <div className="install-step"><span>01</span><div><h3>Prepare Xcode signing</h3><p>You need the full Xcode app and an Apple development team. Register the Refine App Group and enable Keychain Sharing for both app targets.</p>{command('ios', 'GENERATE XCODE PROJECT')}</div></div>
              <div className="install-step"><span>02</span><div><h3>Build and install from Xcode</h3><p>Open <code>apps/ios/Refine.xcodeproj</code>, choose your development team for both targets, then build and install Refine on your iPhone.</p></div></div>
              <div className="install-step"><span>03</span><div><h3>Connect and enable the keyboard</h3><p>Save your Mac’s private HTTPS address and API token in the Refine app. Then go to Settings → General → Keyboard → Keyboards → Add New Keyboard → Refine. Enable Full Access so the keyboard can reach your local API.</p><div className="install-callout"><Lock size={15} /><span>Keep iPhone and Mac on trusted Wi-Fi. Background App Refresh is not needed.</span></div></div></div>
            </>}
            {platform === 'Desktop' && <>
              <div className="install-step"><span>01</span><div><h3>Start the local API</h3><p>Install and start the model server using the Mac setup steps first. The desktop app uses the local API at port 8000.</p><button className="text-action" onClick={() => setPlatform('Mac')}>View Mac setup <ArrowRight size={14} /></button></div></div>
              <div className="install-step"><span>02</span><div><h3>Run Refine Desktop</h3><p>Install the app dependencies, then launch the Tauri development app from the repository.</p>{command('desktop', 'DESKTOP APP')}</div></div>
              <div className="install-step"><span>03</span><div><h3>Use the writing popover</h3><p>Select text in an app, invoke Refine from the menu bar or shortcut, choose a tone, then review the result before replacing your text.</p></div></div>
            </>}
          </div>
          <aside className="install-sidecard"><div className="sidecard-mark"><ShieldCheck size={19} /></div><div className="sidecard-kicker">YOUR SETUP</div><h3>Configure the connection.</h3><p>Refine sends selected text to the API address you choose. For the local editor, use the default loopback address. For another device, use a trusted HTTPS endpoint.</p><button className="lime-button full" onClick={onConfigure}>Open API settings <ArrowRight size={15} /></button><div className="sidecard-divider" /><div className="sidecard-meta"><Lock size={14} /><span>No account, cloud history, or third-party model calls.</span></div></aside>
        </div>
        <div className="install-footer"><span>NEED MORE DETAIL?</span><a href="https://github.com/Radiiduration/Refine-me/blob/main/README.md" target="_blank" rel="noreferrer">Read the full setup guide <ArrowRight size={14} /></a></div>
      </div>
    </section>
  );
}

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
  const [activeView, setActiveView] = useState<'studio' | 'install'>('studio');
  const [apiUrl, setApiUrl] = useState(initialApiUrl);
  const [apiUrlDraft, setApiUrlDraft] = useState(initialApiUrl);
  const [apiToken, setApiToken] = useState('');
  const [apiTokenDraft, setApiTokenDraft] = useState('');
  const [connectionError, setConnectionError] = useState('');
  const authHeaders: Record<string, string> = apiToken ? { 'X-Refine-Token': apiToken } : {};

  const toneEntries = useMemo(() => Object.entries(tones), [tones]);

  const checkModel = useCallback(async () => {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/health`, { headers: authHeaders, redirect: 'error', signal: AbortSignal.timeout(2500) });
      setModelOnline(response.ok);
    } catch {
      setModelOnline(false);
    }
  }, [apiUrl, apiToken]);

  useEffect(() => {
    void checkModel();
    const interval = window.setInterval(checkModel, 30_000);
    fetch(`${apiUrl.replace(/\/$/, '')}/tones`, { headers: authHeaders, redirect: 'error' }).then(r => r.ok ? r.json() : null).then(data => {
      if (data && typeof data === 'object') setTones(data);
    }).catch(() => undefined);
    return () => window.clearInterval(interval);
  }, [apiUrl, checkModel]);

  const captureClipboard = async () => {
    try {
      setText(await navigator.clipboard.readText());
      setError('');
    } catch {
      setError('Clipboard access was unavailable. You can paste directly into the draft.');
    }
  };

  const transitionToTone = async () => {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/tones`, { headers: authHeaders, redirect: 'error' });
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
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/clarify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, redirect: 'error',
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
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/rewrite`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, redirect: 'error',
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
      await navigator.clipboard.writeText(rewrittenText);
      setNotice('Copied to clipboard. Your original draft is unchanged.');
    } catch { setError('Could not copy automatically. Select the result and copy it.'); }
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
        <button className={`side-link ${activeView === 'studio' ? 'active' : ''}`} onClick={() => setActiveView('studio')}><span className="side-link-icon"><Wand2 size={17} /></span> Writing studio</button>
        <button className={`side-link ${activeView === 'install' ? 'active' : ''}`} onClick={() => setActiveView('install')}><span className="side-link-icon"><Terminal size={17} /></span> Install & setup</button>
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
          <div className="breadcrumb"><span>REFINE</span><span className="crumb-slash">/</span><strong>{activeView === 'install' ? 'Install & setup' : 'Writing studio'}</strong></div>
          <div className="topbar-actions">
            <button className="setup-chip" onClick={() => setActiveView(activeView === 'install' ? 'studio' : 'install')}>{activeView === 'install' ? <Wand2 size={14} /> : <Terminal size={14} />}{activeView === 'install' ? 'Writing studio' : 'Install & setup'}</button>
            <button className="privacy-chip" onClick={() => setShowPrivacy(true)}><ShieldCheck size={15} /> Private by design</button>
            <button className="help-button" aria-label="Privacy details" onClick={() => setShowPrivacy(true)}><HelpCircle size={18} /></button>
          </div>
        </header>

        {activeView === 'install' ? <InstallGuide onConfigure={() => setShowPrivacy(true)} onOpenStudio={() => setActiveView('studio')} /> : <div className="page-content">
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
                {state === 'DONE' && <div className="result-actions"><button className="copy-button" onClick={() => void copyResult()}><Copy size={15} /> Copy refined text</button><button className="again-button" onClick={() => void handleRewrite()} aria-label="Generate another version"><RotateCcw size={16} /></button></div>}
              </> : <div className="empty-result">
                <div className="result-art"><span className="art-orbit orbit-one" /><span className="art-orbit orbit-two" /><span className="art-spark"><Sparkles size={25} /></span><span className="art-dot dot-one" /><span className="art-dot dot-two" /></div>
                <h3>A clearer thought is just ahead.</h3><p>Your rewrite will appear here. Pick a tone that feels like you, then refine your draft.</p>
                <div className="steps"><div><span>1</span> Write or paste your draft</div><div><span>2</span> Choose the tone</div><div><span>3</span> Keep the words you love</div></div>
              </div>}
              <div className="result-foot"><span><span className="foot-spark">✳</span> Made for your voice</span><span>Nothing is saved</span></div>
            </article>
          </section>

          <footer className="page-footer"><span>REFINE <i>·</i> LOCAL BY DESIGN</span><button onClick={() => setShowPrivacy(true)}>Your privacy <ChevronDown size={12} /></button></footer>
        </div>}
      </main>

      {showPrivacy && <div className="modal-backdrop" onClick={() => setShowPrivacy(false)}><section className="privacy-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-title" onClick={event => event.stopPropagation()}><button className="modal-close" onClick={() => setShowPrivacy(false)} aria-label="Close"><X size={18} /></button><span className="modal-icon"><ShieldCheck size={22} /></span><div className="panel-kicker">REFINE · PRIVATE BY DESIGN</div><h2 id="privacy-title">Your words stay with you.</h2><p>Refine sends your draft to the API address below. When you use the default address, requests stay on this computer and use your local model.</p><label className="api-setting-label" htmlFor="refine-api-url">Local Refine API</label><input id="refine-api-url" className="api-setting-input" value={apiUrlDraft} onChange={event => { setApiUrlDraft(event.target.value); setConnectionError(''); }} placeholder="http://localhost:8000" /><small className={`api-setting-help${connectionError ? ' connection-error' : ''}`}>{connectionError || 'Use loopback for local APIs or HTTPS for a remote API. Remote access needs a 32-character device token.'}</small><label className="api-setting-label" htmlFor="refine-api-token">Device token (needed for remote API)</label><input id="refine-api-token" type="password" autoComplete="off" className="api-setting-input" value={apiTokenDraft} onChange={event => setApiTokenDraft(event.target.value)} placeholder="Held in memory until this page closes" /><div className="privacy-points"><div><CheckCircle2 size={17} /><span><b>No account needed</b><small>Nothing to sign up for or sync.</small></span></div><div><CheckCircle2 size={17} /><span><b>Your model, your machine</b><small>Drafts go to your configured model.</small></span></div><div><CheckCircle2 size={17} /><span><b>You stay in control</b><small>Your original text stays untouched until you choose a rewrite.</small></span></div></div><button className="modal-done" onClick={() => { try { const value = normalizeApiUrl(apiUrlDraft); const parsed = new URL(value); if (!LOOPBACK_HOSTS.has(parsed.hostname) && apiTokenDraft.trim().length < 32) throw new Error('Remote API access needs a device token of at least 32 characters.'); localStorage.setItem('refine.apiUrl', value); setApiToken(apiTokenDraft.trim()); setApiUrl(value); void checkModel(); setShowPrivacy(false); setConnectionError(''); } catch (reason) { setConnectionError(reason instanceof Error ? reason.message : 'Check the API address and try again.'); } }}>Save connection</button></section></div>}
    </div>
  );
}
