'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import {
  Shield, Zap, Globe, Lock, Activity, Settings,
  RefreshCw, Send, Copy, Check, AlertTriangle,
  Server, ChevronRight, Plus, ExternalLink,
  Monitor, Code, Eye, User as UserIcon, LogOut, LogIn,
  ArrowLeft, ArrowRight, RotateCw, Home as HomeIcon, Download
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────
type ProxyLog = {
  id: string;
  target_url: string;
  method: string;
  status_code: number;
  latency_ms: number;
  success: boolean;
  error_message?: string;
  created_at: string;
};

type ProxyRule = {
  id: string;
  pattern: string;
  action: 'allow' | 'block';
  description: string;
  enabled: boolean;
  created_at: string;
};

type ProxyResult = {
  status: number;
  ok: boolean;
  latency: number;
  body: string;
  contentType: string;
  size: number;
  error?: string;
  targetUrl: string;
};

// ─── Helpers ──────────────────────────────────────────────
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  return `${Math.floor(diff / 3600000)}h ago`;
}

function statusClass(code: number, success: boolean) {
  if (!success || code === 0) return 'status-err';
  if (code < 300) return 'status-2xx';
  if (code < 400) return 'status-3xx';
  if (code < 500) return 'status-4xx';
  return 'status-5xx';
}

function latencyClass(ms: number) {
  if (ms < 200) return 'latency-fast';
  if (ms < 800) return 'latency-mid';
  return 'latency-slow';
}

// Rewrite HTML so all links/images/etc. go through the proxy
function rewriteHtml(html: string, baseUrl: string): string {
  try {
    const base = new URL(baseUrl);
    const origin = base.origin;

    return html
      // Fix relative hrefs
      .replace(/href="(?!https?:\/\/|\/\/|#|mailto:|tel:|javascript:)([^"]*?)"/gi, (_, path) => {
        const abs = path.startsWith('/') ? `${origin}${path}` : `${base.href.replace(/\/[^/]*$/, '/')}${path}`;
        return `href="/api/proxy?url=${encodeURIComponent(abs)}"`;
      })
      // Fix absolute hrefs to go through proxy
      .replace(/href="(https?:\/\/[^"]+)"/gi, (_, url) => `href="/api/proxy?url=${encodeURIComponent(url)}"`)
      // Fix relative src (images/scripts/css)
      .replace(/src="(?!https?:\/\/|\/\/|data:)([^"]*?)"/gi, (_, path) => {
        const abs = path.startsWith('/') ? `${origin}${path}` : `${base.href.replace(/\/[^/]*$/, '/')}${path}`;
        return `src="${abs}"`;
      })
      // Fix absolute src
      .replace(/src="(https?:\/\/[^"]+)"/gi, (_, url) => `src="${url}"`)
      // Add a base tag so relative resources resolve properly
      .replace(/<head>/i, `<head><base href="${origin}/" />`);
  } catch {
    return html;
  }
}

// ─── Sub-Components ────────────────────────────────────────

function StatusBadge({ code, success }: { code: number; success: boolean }) {
  const cls = statusClass(code, success);
  const label = !success || code === 0 ? 'ERR' : String(code);
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

function NetworkDiagram() {
  return (
    <div className="network-map">
      <div className="network-node">
        <div className="node-circle node-you">💻</div>
        <div className="node-label">You<br />(WiFi)</div>
      </div>
      <div className="network-line blocked">
        <div className="network-line-inner" />
      </div>
      <div className="network-node">
        <div className="node-circle node-wifi">🔒</div>
        <div className="node-label">WiFi<br />Firewall</div>
      </div>
      <div className="network-line active">
        <div className="network-line-inner" />
      </div>
      <div className="network-node">
        <div className="node-circle node-edge">⚡</div>
        <div className="node-label">NetBypass<br />Edge</div>
      </div>
      <div className="network-line active">
        <div className="network-line-inner" />
      </div>
      <div className="network-node">
        <div className="node-circle node-target">🌍</div>
        <div className="node-label">Target<br />Site</div>
      </div>
    </div>
  );
}

// ─── Proxy Browser (the main component) ──────────────────────
function ProxyBrowser({ onNewLog }: { onNewLog: () => void }) {
  const [url, setUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [viewMode, setViewMode] = useState<'render' | 'source'>('render');
  const [copied, setCopied] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleProxy = async (targetUrl?: string) => {
    const proxyTarget = targetUrl || url;
    if (!proxyTarget.trim()) return;

    // Normalize target (auto-prefix https:// or convert search query)
    let normalised = proxyTarget.trim();
    if (!/^https?:\/\//i.test(normalised)) {
      if (normalised.includes(' ') || !normalised.includes('.')) {
        normalised = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalised)}`;
      } else {
        normalised = `https://${normalised}`;
      }
    }

    setUrl(normalised);
    setCurrentUrl(normalised);
    setLoading(true);
    setResult(null);

    const start = Date.now();
    try {
      const proxyUrl = `/api/proxy?url=${encodeURIComponent(normalised)}`;
      const response = await fetch(proxyUrl, { method: 'GET' });
      const latency = Date.now() - start;
      const contentType = response.headers.get('content-type') || '';
      const body = await response.text();
      const size = new Blob([body]).size;

      setResult({
        status: response.status,
        ok: response.ok,
        latency,
        body,
        contentType,
        size,
        targetUrl: normalised,
      });
    } catch (err) {
      const latency = Date.now() - start;
      setResult({
        status: 0,
        ok: false,
        latency,
        body: '',
        contentType: '',
        size: 0,
        targetUrl: normalised,
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
      setTimeout(onNewLog, 500);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleProxy();
  };

  const copyProxyUrl = () => {
    const link = `${window.location.origin}/api/proxy?url=${encodeURIComponent(url)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPageContent = () => {
    if (!result?.body) return;
    const blob = new Blob([result.body], { type: result.contentType || 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `proxied-page-${Date.now()}.${result.contentType.includes('json') ? 'json' : 'html'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  };

  const isHtml = result?.contentType?.includes('text/html');
  const iframeProxySrc = result?.targetUrl ? `/api/proxy?url=${encodeURIComponent(result.targetUrl)}` : '';

  const presets = [
    { label: 'Google Search', url: 'https://html.duckduckgo.com' },
    { label: 'YouTube', url: 'https://www.youtube.com' },
    { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { label: 'Example.com', url: 'https://example.com' },
    { label: 'httpbin API', url: 'https://httpbin.org/get' },
    { label: 'GitHub API', url: 'https://api.github.com' },
  ];

  return (
    <div className="proxy-browser fade-up">
      {/* Browser Chrome */}
      <div className="browser-chrome">
        <div className="browser-toolbar">
          <div className="browser-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

          {/* Navigation Controls */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => handleProxy(url)}
              title="Reload page"
              disabled={loading}
              style={{ padding: '6px' }}
            >
              <RotateCw size={13} className={loading ? 'spinner-sm' : ''} />
            </button>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { setUrl('https://example.com'); handleProxy('https://example.com'); }}
              title="Go Home"
              style={{ padding: '6px' }}
            >
              <HomeIcon size={13} />
            </button>
          </div>

          {/* Address & Search Bar */}
          <form onSubmit={handleSubmit} className="browser-address-bar">
            <div className="address-wrap">
              <Lock size={13} color="var(--clr-green)" style={{ flexShrink: 0 }} />
              <input
                id="proxy-url-input"
                type="text"
                className="address-input"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Search or enter web address (e.g. google.com, youtube.com, or search terms)"
              />
              {loading && <div className="spinner spinner-sm" />}
            </div>
            <button id="proxy-send-btn" type="submit" className="btn btn-primary btn-go" disabled={loading}>
              {loading ? 'Routing…' : 'Go'}
            </button>
          </form>

          {/* Action Buttons */}
          <div className="browser-actions">
            {result?.body && (
              <button
                className="btn btn-sm btn-ghost"
                onClick={downloadPageContent}
                title="Download Page Content"
              >
                <Download size={13} />
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={copyProxyUrl} title="Copy proxy link">
              {copied ? <Check size={13} color="var(--clr-green)" /> : <Copy size={13} />}
            </button>
            {result?.targetUrl && (
              <a
                href={`/api/proxy?url=${encodeURIComponent(result.targetUrl)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-ghost"
                title="Open in new tab"
              >
                <ExternalLink size={13} />
              </a>
            )}
          </div>
        </div>

        {/* Preset quick-links */}
        <div className="browser-presets">
          {presets.map((p) => (
            <button key={p.url} className="preset-chip" onClick={() => { setUrl(p.url); handleProxy(p.url); }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Status bar */}
        {result && (
          <div className="browser-status">
            <StatusBadge code={result.status} success={result.ok} />
            <span className="status-latency">{result.latency}ms</span>
            <span className="status-size">{(result.size / 1024).toFixed(1)} KB</span>
            <span className="status-ct">{result.contentType.split(';')[0]}</span>
            <span className="status-via">✓ Routed via Vercel Edge</span>
            {isHtml && (
              <div className="view-toggle" style={{ marginLeft: 'auto' }}>
                <button
                  className={`view-btn ${viewMode === 'render' ? 'active' : ''}`}
                  onClick={() => setViewMode('render')}
                >
                  <Eye size={11} /> Render
                </button>
                <button
                  className={`view-btn ${viewMode === 'source' ? 'active' : ''}`}
                  onClick={() => setViewMode('source')}
                >
                  <Code size={11} /> Source
                </button>
              </div>
            )}
          </div>
        )}

        {/* Viewport */}
        <div className="browser-viewport">
          {loading && (
            <div className="viewport-loading">
              <div className="spinner" style={{ width: 32, height: 32, borderTopColor: 'var(--clr-primary)' }} />
              <p>Routing through Vercel Edge…</p>
              <p style={{ fontSize: 12, color: 'var(--clr-text-dim)', marginTop: 4 }}>
                Bypassing local network restrictions
              </p>
            </div>
          )}

          {!loading && !result && (
            <div className="viewport-empty">
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
              <h3 style={{ color: 'var(--clr-text)', marginBottom: 8 }}>NetBypass Browser</h3>
              <p style={{ color: 'var(--clr-text-muted)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
                Enter any URL or search terms above and click <strong>Go</strong>.<br />
                Your request is routed through Vercel's global edge network,<br />
                bypassing your local WiFi firewall.
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
                {presets.map(p => (
                  <button key={p.url} className="btn btn-ghost" onClick={() => { setUrl(p.url); handleProxy(p.url); }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!loading && result?.error && (
            <div className="viewport-error">
              <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
              <h3 style={{ color: 'var(--clr-red)', marginBottom: 8 }}>Request Failed</h3>
              <p style={{ color: 'var(--clr-text-muted)', maxWidth: 480, textAlign: 'center' }}>
                {result.error}
              </p>
              <p style={{ color: 'var(--clr-text-dim)', fontSize: 12, marginTop: 12 }}>
                Note: Some sites block automated requests. Try a different URL.
              </p>
            </div>
          )}

          {!loading && result && !result.error && (
            <>
              {/* Render mode — HTML in iframe via srcDoc */}
              {isHtml && viewMode === 'render' && (
                <iframe
                  srcDoc={result.body}
                  className="browser-iframe"
                  title="Proxied content"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              )}
              {/* Source / JSON mode */}
              {(!isHtml || viewMode === 'source') && (
                <div className="source-view">
                  <pre className="source-pre">
                    {result.contentType.includes('json')
                      ? (() => { try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; } })()
                      : result.body.length > 8000 ? result.body.slice(0, 8000) + '\n\n... (truncated)' : result.body
                    }
                  </pre>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LiveLogs({ refreshTrigger }: { refreshTrigger: number }) {
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs?limit=20');
      const data = await res.json();
      setLogs(data.logs || []);
      setIsDemo(data.demo);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs, refreshTrigger]);
  useEffect(() => {
    const id = setInterval(fetchLogs, 8000);
    return () => clearInterval(id);
  }, [fetchLogs]);

  return (
    <div className="section">
      <h2 className="section-title">
        <Activity size={18} color="var(--clr-primary)" />
        Live Request Logs
      </h2>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--clr-green)', display: 'inline-block', animation: 'pulse-dot 2s infinite' }} />
            Real-time Activity
            {isDemo && <span style={{ fontSize: '11px', color: 'var(--clr-yellow)', fontWeight: 400, marginLeft: 8 }}>(demo data)</span>}
          </div>
          <button className="btn btn-sm btn-ghost" onClick={fetchLogs} id="refresh-logs-btn">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state">
              <div className="spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--clr-primary)' }} />
              Loading logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📋</div>
              No requests yet — try the browser above
            </div>
          ) : (
            <table className="log-table">
              <thead>
                <tr>
                  <th>Status</th><th>Method</th><th>Target URL</th><th>Latency</th><th>Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td><StatusBadge code={log.status_code} success={log.success} /></td>
                    <td><span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--clr-cyan)' }}>{log.method}</span></td>
                    <td><span className="url-cell" title={log.target_url}>{log.target_url}</span></td>
                    <td><span className={`latency-cell ${latencyClass(log.latency_ms)}`}>{log.latency_ms}ms</span></td>
                    <td><span className="time-cell">{timeAgo(log.created_at)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function RulesManager() {
  const [rules, setRules] = useState<ProxyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [pattern, setPattern] = useState('');
  const [action, setAction] = useState<'allow' | 'block'>('allow');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [isDemo, setIsDemo] = useState(false);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/rules');
      const data = await res.json();
      setRules(data.rules || []);
      setIsDemo(data.demo);
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchRules(); }, []);

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, action, description }),
      });
      const data = await res.json();
      if (data.rule) {
        setRules(prev => [data.rule, ...prev]);
        setPattern('');
        setDescription('');
        setShowForm(false);
      }
    } catch { /* silent */ }
    finally { setSaving(false); }
  };

  return (
    <div className="section">
      <h2 className="section-title">
        <Settings size={18} color="var(--clr-primary)" />
        Proxy Rules
      </h2>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            Allow / Block Rules
            {isDemo && <span style={{ fontSize: '11px', color: 'var(--clr-yellow)', fontWeight: 400, marginLeft: 8 }}>(demo data)</span>}
          </div>
          <button id="add-rule-btn" className="btn btn-sm btn-primary" onClick={() => setShowForm(!showForm)}>
            <Plus size={13} /> Add Rule
          </button>
        </div>
        {showForm && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--clr-border)', background: 'var(--clr-surface-2)' }}>
            <form onSubmit={addRule} style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 180 }}>
                <label style={{ fontSize: '11px', color: 'var(--clr-text-muted)', display: 'block', marginBottom: 6 }}>URL Pattern</label>
                <input id="rule-pattern-input" className="url-input" style={{ height: 40, fontSize: '12px', padding: '0 12px' }}
                  placeholder="*.example.com" value={pattern} onChange={e => setPattern(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: '11px', color: 'var(--clr-text-muted)', display: 'block', marginBottom: 6 }}>Action</label>
                <select id="rule-action-select" className="method-select" style={{ height: 40 }}
                  value={action} onChange={e => setAction(e.target.value as 'allow' | 'block')}>
                  <option value="allow">Allow</option>
                  <option value="block">Block</option>
                </select>
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: '11px', color: 'var(--clr-text-muted)', display: 'block', marginBottom: 6 }}>Description</label>
                <input id="rule-desc-input" className="url-input" style={{ height: 40, fontSize: '12px', padding: '0 12px' }}
                  placeholder="Rule description..." value={description} onChange={e => setDescription(e.target.value)} />
              </div>
              <button id="save-rule-btn" type="submit" className="btn btn-primary btn-sm" disabled={saving}>
                {saving ? <div className="spinner" /> : <Check size={13} />} Save
              </button>
            </form>
          </div>
        )}
        <div>
          {loading ? (
            <div className="empty-state"><div className="spinner" style={{ width: 24, height: 24, borderTopColor: 'var(--clr-primary)' }} /></div>
          ) : rules.length === 0 ? (
            <div className="empty-state"><div className="empty-state-icon">🛡️</div>No rules configured</div>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className="rule-row">
                <span className={`action-badge action-${rule.action}`}>{rule.action === 'allow' ? '✓' : '✕'} {rule.action}</span>
                <span className="rule-pattern">{rule.pattern}</span>
                <span className="rule-desc">{rule.description}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Home() {
  const [bypassEnabled, setBypassEnabled] = useState(true);
  const [logRefresh, setLogRefresh] = useState(0);
  const [user, setUser] = useState<User | null>(null);

  const triggerLogRefresh = () => setLogRefresh(n => n + 1);

  // Subscribe to Supabase auth state changes
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const features = [
    { icon: '🖥️', iconClass: 'feature-icon-orange', title: 'Built-in Browser',   desc: 'Renders proxied websites inline — browse blocked sites directly in the app.' },
    { icon: '🔒', iconClass: 'feature-icon-blue',   title: 'SSRF Protected',      desc: 'Private IP ranges, localhost, and internal addresses are automatically blocked.' },
    { icon: '📊', iconClass: 'feature-icon-cyan',   title: 'Real-time Logs',      desc: 'Every proxied request logged to Supabase with latency, status, and URL.' },
    { icon: '🛡️', iconClass: 'feature-icon-green',  title: 'Rule Engine',         desc: 'Create allow/block rules based on URL patterns to control what gets proxied.' },
    { icon: '🌍', iconClass: 'feature-icon-purple', title: 'Global Edge Network', desc: 'Traffic exits from Vercel edge nodes across 30+ global regions.' },
    { icon: '☕', iconClass: 'feature-icon-red',    title: 'Java Backend',        desc: 'Spring Boot microservice with java.net.http.HttpClient — deploy on Railway.' },
  ];

  return (
    <>
      <div className="bg-grid" />
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />
      <div className="bg-orb bg-orb-3" />

      {/* Navbar */}
      <nav className="navbar">
        <div className="navbar-inner">
          <a href="/" className="logo">
            <div className="logo-icon">🌐</div>
            <span className="logo-text">Net<span>Bypass</span></span>
          </a>
          <div className="nav-links">
            <span className="badge-live">Operational</span>
            <a href="#browser" className="nav-link">Browser</a>
            <a href="#logs" className="nav-link">Logs</a>
            <a href="#rules" className="nav-link">Rules</a>

            {/* Auth status */}
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: 12,
                  color: 'var(--clr-text)',
                  fontFamily: 'var(--font-mono)',
                  background: 'rgba(246, 130, 31, 0.1)',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid rgba(246, 130, 31, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}>
                  <UserIcon size={12} color="var(--clr-primary)" />
                  {user.email?.split('@')[0]}
                </span>
                <button
                  onClick={handleSignOut}
                  className="btn btn-sm btn-ghost"
                  title="Sign Out"
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  <LogOut size={12} /> Sign Out
                </button>
              </div>
            ) : (
              <a href="/login" className="btn btn-sm btn-primary" style={{ fontSize: 12 }}>
                <LogIn size={13} /> Sign In
              </a>
            )}

            <label className="toggle" htmlFor="bypass-toggle" title="Toggle bypass">
              <input id="bypass-toggle" type="checkbox" checked={bypassEnabled}
                onChange={e => setBypassEnabled(e.target.checked)} />
              <div className="toggle-track" />
              <div className="toggle-thumb" />
            </label>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <div className="app-container">
          <div className="hero-eyebrow fade-up">
            <Shield size={12} />
            Cloudflare-Inspired Network Bypass
          </div>
          <h1 className="hero-title fade-up fade-up-delay-1">
            Browse Any Site<br />
            <span className="gradient-text">Through Our Edge</span>
          </h1>
          <p className="hero-sub fade-up fade-up-delay-2">
            Enter any URL and browse it through Vercel's global serverless edge —
            bypassing local WiFi firewalls, just like Cloudflare WARP.
          </p>
          <div className="stats-row fade-up fade-up-delay-3">
            <div className="stat-item">
              <div className="stat-number" style={{ color: 'var(--clr-primary)' }}>30+</div>
              <div className="stat-label">Edge Regions</div>
            </div>
            <div className="stat-item">
              <div className="stat-number" style={{ color: 'var(--clr-cyan)' }}>&lt;50ms</div>
              <div className="stat-label">Avg Latency</div>
            </div>
            <div className="stat-item">
              <div className="stat-number" style={{ color: 'var(--clr-green)' }}>100%</div>
              <div className="stat-label">Serverless</div>
            </div>
            <div className="stat-item">
              <div className="stat-number" style={{ color: 'var(--clr-purple)' }}>∞</div>
              <div className="stat-label">Scalable</div>
            </div>
          </div>
          <div style={{ maxWidth: 700, margin: '0 auto 40px', opacity: 0.9 }}>
            <NetworkDiagram />
          </div>
          <a href="#browser" className="btn btn-primary" style={{ margin: '0 auto' }}>
            Open Browser <ChevronRight size={15} />
          </a>
        </div>
      </section>

      {/* Features */}
      <section className="section" id="features">
        <div className="app-container">
          <div className="grid-3">
            {features.map((f) => (
              <div key={f.title} className="card feature-card">
                <div className={`feature-icon ${f.iconClass}`}>{f.icon}</div>
                <div className="feature-card-title">{f.title}</div>
                <div className="feature-card-desc">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Proxy Browser — the main feature */}
      <section className="section" id="browser">
        <div className="app-container">
          <h2 className="section-title">
            <Monitor size={18} color="var(--clr-primary)" />
            NetBypass Browser
          </h2>
          <div className="demo-banner">
            <AlertTriangle size={15} />
            Enter any URL below. The page is fetched server-side through Vercel's edge and rendered here —
            your WiFi only sees traffic to <strong>netbypass-app.vercel.app</strong>.
          </div>
          <ProxyBrowser onNewLog={triggerLogRefresh} />
        </div>
      </section>

      {/* API Reference */}
      <section className="section" id="api">
        <div className="app-container">
          <h2 className="section-title">
            <Server size={18} color="var(--clr-primary)" />
            API Reference
          </h2>
          <div className="grid-2">
            <div className="card">
              <div className="card-header">
                <div className="card-title">Proxy Endpoint</div>
                <span className="status-badge status-2xx">GET / POST</span>
              </div>
              <div className="card-body">
                <div className="response-box">
                  <div className="response-body" style={{ color: 'var(--clr-cyan)' }}>
{`GET /api/proxy?url=<target_url>
POST /api/proxy?url=<target_url>

# Example
GET /api/proxy?url=https://example.com

# Response Headers
X-Proxied-By: NetBypass/1.0
X-Latency-Ms: 142
X-Status-Code: 200`}
                  </div>
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Other Endpoints</div>
              </div>
              <div className="card-body">
                <div className="response-box">
                  <div className="response-body" style={{ color: 'var(--clr-cyan)' }}>
{`# Request Logs
GET /api/logs?limit=20

# Proxy Rules
GET  /api/rules
POST /api/rules
  { pattern, action, description }

# Service Status
GET /api/status`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logs */}
      <section id="logs">
        <div className="app-container">
          <LiveLogs refreshTrigger={logRefresh} />
        </div>
      </section>

      {/* Rules */}
      <section id="rules">
        <div className="app-container">
          <RulesManager />
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="app-container">
          <p>
            NetBypass — Built with{' '}
            <a href="https://nextjs.org" target="_blank" rel="noopener noreferrer">Next.js</a>{' '}
            · Java{' '}
            <a href="https://spring.io/projects/spring-boot" target="_blank" rel="noopener noreferrer">Spring Boot</a>{' '}
            · Deployed on{' '}
            <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">Vercel</a>{' '}
            · Database by{' '}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">Supabase</a>
          </p>
          <p style={{ marginTop: 8, fontSize: 11, color: 'var(--clr-text-dim)' }}>
            For educational purposes. Use responsibly. © 2025 NetBypass
          </p>
        </div>
      </footer>
    </>
  );
}
