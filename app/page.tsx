'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import AiAssistant from '@/components/AiAssistant';
import {
  Shield, Zap, Globe, Lock, Activity, Settings,
  RefreshCw, Send, Copy, Check, AlertTriangle,
  Server, ChevronRight, Plus, ExternalLink,
  Monitor, Code, Eye, User as UserIcon, LogOut, LogIn,
  RotateCw, Home as HomeIcon, Download, Sparkles, ArrowLeft, Layers
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
  response_size?: number;
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

type ActiveView = 'showcase' | 'browser' | 'ai' | 'logs' | 'rules';

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

function StatusBadge({ code, success }: { code: number; success: boolean }) {
  const cls = statusClass(code, success);
  const label = !success || code === 0 ? 'ERR' : String(code);
  return <span className={`status-badge ${cls}`}>{label}</span>;
}

// ─── Proxy Browser Component ──────────────────────────────
function ProxyBrowser({ onNewLog }: { onNewLog: () => void }) {
  const [url, setUrl] = useState('https://example.com');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ProxyResult | null>(null);
  const [viewMode, setViewMode] = useState<'render' | 'source'>('render');
  const [copied, setCopied] = useState(false);

  const handleProxy = async (targetUrl?: string) => {
    const proxyTarget = targetUrl || url;
    if (!proxyTarget.trim()) return;

    let normalised = proxyTarget.trim();
    if (!/^https?:\/\//i.test(normalised)) {
      if (normalised.includes(' ') || !normalised.includes('.')) {
        normalised = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(normalised)}`;
      } else {
        normalised = `https://${normalised}`;
      }
    }

    setUrl(normalised);
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

  const presets = [
    { label: 'Google Search', url: 'https://html.duckduckgo.com' },
    { label: 'YouTube', url: 'https://www.youtube.com' },
    { label: 'Wikipedia', url: 'https://en.wikipedia.org' },
    { label: 'Example.com', url: 'https://example.com' },
    { label: 'httpbin API', url: 'https://httpbin.org/get' },
    { label: 'GitHub API', url: 'https://api.github.com' },
  ];

  return (
    <div className="proxy-browser fade-up" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="browser-chrome" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="browser-toolbar">
          <div className="browser-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

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

        <div className="browser-presets">
          {presets.map((p) => (
            <button key={p.url} className="preset-chip" onClick={() => { setUrl(p.url); handleProxy(p.url); }}>
              {p.label}
            </button>
          ))}
        </div>

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

        <div className="browser-viewport" style={{ minHeight: 480 }}>
          {loading && (
            <div className="viewport-loading">
              <div className="spinner" style={{ width: 32, height: 32, borderTopColor: 'var(--clr-primary)' }} />
              <p>Routing through Vercel Edge…</p>
            </div>
          )}

          {!loading && !result && (
            <div className="viewport-empty">
              <div style={{ fontSize: 48, marginBottom: 16 }}>🌐</div>
              <h3 style={{ color: 'var(--clr-text)', marginBottom: 8 }}>NetBypass Inbuilt Browser</h3>
              <p style={{ color: 'var(--clr-text-muted)', maxWidth: 420, textAlign: 'center', lineHeight: 1.6 }}>
                Enter any URL or search terms above and click <strong>Go</strong>.<br />
                Your request is routed through Vercel's global edge network,<br />
                bypassing your local WiFi firewall with zero 404 errors.
              </p>
            </div>
          )}

          {!loading && result && !result.error && (
            <>
              {isHtml && viewMode === 'render' && (
                <iframe
                  srcDoc={result.body}
                  className="browser-iframe"
                  title="Proxied content"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              )}
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

// ─── Main Application Component ───────────────────────────
export default function Home() {
  const [currentView, setCurrentView] = useState<ActiveView>('showcase');
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [logs, setLogs] = useState<ProxyLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch {
      /* silent */
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return (
    <div className="app-shell" style={{ minHeight: '100vh', background: 'var(--clr-bg)' }}>
      {/* Global Header / Navigation Bar */}
      <header className="app-navbar" style={{
        padding: '14px 28px',
        borderBottom: '1px solid var(--clr-border)',
        background: 'var(--clr-surface-light)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 100
      }}>
        {/* Brand / Return Gesture */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button
            type="button"
            onClick={() => setCurrentView('showcase')}
            className="logo"
            style={{ border: 'none', background: 'none', cursor: 'pointer' }}
            title="Return to Main Showcase Page"
          >
            <div className="logo-icon">🌐</div>
            <span className="logo-text">Net<span>Bypass</span></span>
          </button>

          {currentView !== 'showcase' && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setCurrentView('showcase')}
              style={{ fontSize: 12, gap: 6, color: 'var(--clr-primary)' }}
            >
              <ArrowLeft size={14} /> Return to Main Page
            </button>
          )}
        </div>

        {/* Center Navigation Links */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            className={`btn btn-sm ${currentView === 'showcase' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCurrentView('showcase')}
          >
            <HomeIcon size={14} /> Main Page
          </button>

          <button
            className={`btn btn-sm ${currentView === 'browser' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCurrentView('browser')}
          >
            <Globe size={14} /> Inbuilt Browser
          </button>

          <button
            className={`btn btn-sm ${currentView === 'ai' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCurrentView('ai')}
          >
            <Sparkles size={14} color="var(--clr-primary)" /> AI Assistant
          </button>

          <button
            className={`btn btn-sm ${currentView === 'logs' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setCurrentView('logs')}
          >
            <Activity size={14} /> Request Logs
          </button>
        </nav>

        {/* User Auth Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => setAiDrawerOpen(!aiDrawerOpen)}
            style={{ gap: 6, background: 'rgba(246, 130, 31, 0.12)', color: 'var(--clr-primary)' }}
          >
            <Sparkles size={14} /> AI Replybot
          </button>

          {user ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="user-badge" style={{ fontSize: 12 }}>
                <UserIcon size={12} /> {user.email?.split('@')[0]}
              </span>
              <button onClick={handleSignOut} className="btn btn-sm btn-ghost" title="Sign Out">
                <LogOut size={14} color="var(--clr-red)" />
              </button>
            </div>
          ) : (
            <a href="/login" className="btn btn-sm btn-primary">
              <LogIn size={14} /> Sign In
            </a>
          )}
        </div>
      </header>

      {/* Floating AI Assistant Drawer */}
      {aiDrawerOpen && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          width: 440,
          height: 600,
          maxHeight: 'calc(100vh - 100px)',
          zIndex: 1000,
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}>
          <AiAssistant onClose={() => setAiDrawerOpen(false)} compact />
        </div>
      )}

      {/* Main Content Area */}
      <main className="container" style={{ paddingTop: 24, paddingBottom: 60 }}>
        {/* view switch: return gesture header */}
        {currentView !== 'showcase' && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            padding: '12px 18px',
            background: 'var(--clr-surface-light)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--clr-border)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={() => setCurrentView('showcase')}
                style={{ gap: 6 }}
              >
                <ArrowLeft size={14} /> Return to Main Page
              </button>
              <span style={{ fontSize: 13, color: 'var(--clr-text-muted)' }}>
                Currently viewing: <strong>{currentView.toUpperCase()}</strong>
              </span>
            </div>
          </div>
        )}

        {/* View 1: Main Showcase Landing Page */}
        {currentView === 'showcase' && (
          <div className="showcase-landing fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
            {/* Hero Banner */}
            <div className="hero-banner" style={{ textAlign: 'center', padding: '40px 20px 20px' }}>
              <div className="badge badge-primary" style={{ margin: '0 auto 16px', display: 'inline-flex' }}>
                <Zap size={13} /> Cloudflare-Style Global Edge Proxy Engine
              </div>
              <h1 style={{ fontSize: 38, fontWeight: 800, color: 'var(--clr-text)', marginBottom: 12 }}>
                Bypass Local WiFi Firewalls & Access the Web Privately
              </h1>
              <p style={{ fontSize: 16, color: 'var(--clr-text-muted)', maxWidth: 680, margin: '0 auto 24px', lineHeight: 1.6 }}>
                NetBypass routes all your web requests through Vercel's global edge network and JDK 17 Spring Boot servers — your local WiFi network operator only sees encrypted HTTPS traffic to NetBypass!
              </p>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button className="btn btn-primary btn-lg" onClick={() => setCurrentView('browser')}>
                  <Globe size={18} /> Launch Inbuilt Browser
                </button>
                <button className="btn btn-ghost btn-lg" onClick={() => setCurrentView('ai')}>
                  <Sparkles size={18} color="var(--clr-primary)" /> Open AI Assistant
                </button>
              </div>
            </div>

            {/* Inbuilt Browser Showcase Section */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0 }}>
                    🌐 Inbuilt Proxy Browser
                  </h2>
                  <p style={{ fontSize: 13, color: 'var(--clr-text-muted)', margin: 0 }}>
                    Enter any website URL or search phrase below to browse freely without WiFi restrictions.
                  </p>
                </div>
                <button className="btn btn-sm btn-ghost" onClick={() => setCurrentView('browser')}>
                  Full Screen Browser →
                </button>
              </div>

              <ProxyBrowser onNewLog={fetchLogs} />
            </section>

            {/* Embedded Generative AI Assistant Section */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--clr-text)', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={20} color="var(--clr-primary)" /> Generative AI Assistant & Learn Engine
                </h2>
                <p style={{ fontSize: 13, color: 'var(--clr-text-muted)', margin: '4px 0 0' }}>
                  Ask questions, upload documents/images, and receive clear step-by-step explanations with real-time web search grounding.
                </p>
              </div>

              <div style={{ height: 500 }}>
                <AiAssistant />
              </div>
            </section>

            {/* Live Metrics Grid */}
            <div className="metrics-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div className="metric-card card">
                <span className="metric-label">Avg Edge Latency</span>
                <span className="metric-value" style={{ color: 'var(--clr-green)' }}>24 ms</span>
              </div>
              <div className="metric-card card">
                <span className="metric-label">Global Edge Nodes</span>
                <span className="metric-value">30+ Locations</span>
              </div>
              <div className="metric-card card">
                <span className="metric-label">Backend Engine</span>
                <span className="metric-value" style={{ color: 'var(--clr-cyan)' }}>Spring Boot 3.2</span>
              </div>
              <div className="metric-card card">
                <span className="metric-label">Encryption</span>
                <span className="metric-value">TLS 1.3 / HTTPS</span>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Full Screen Inbuilt Browser */}
        {currentView === 'browser' && <ProxyBrowser onNewLog={fetchLogs} />}

        {/* View 3: Full Screen AI Assistant */}
        {currentView === 'ai' && (
          <div style={{ height: 'calc(100vh - 160px)' }}>
            <AiAssistant />
          </div>
        )}

        {/* View 4: Request Logs */}
        {currentView === 'logs' && (
          <div className="card fade-up">
            <div className="card-header">
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--clr-text)' }}>
                Real-Time Proxy Logs
              </h2>
              <button className="btn btn-sm btn-ghost" onClick={fetchLogs} disabled={logsLoading}>
                <RefreshCw size={13} className={logsLoading ? 'spinner-sm' : ''} /> Refresh
              </button>
            </div>
            <div className="table-responsive">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Method</th>
                    <th>Target URL</th>
                    <th>Latency</th>
                    <th>Size</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '30px 0', color: 'var(--clr-text-dim)' }}>
                        No logs recorded yet. Use the browser to generate traffic!
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id}>
                        <td><StatusBadge code={log.status_code} success={log.success} /></td>
                        <td><span className={`method-badge method-${log.method.toLowerCase()}`}>{log.method}</span></td>
                        <td className="url-cell">{log.target_url}</td>
                        <td><span className={`latency-tag ${latencyClass(log.latency_ms)}`}>{log.latency_ms}ms</span></td>
                        <td>{(log.response_size ? log.response_size / 1024 : 0).toFixed(1)} KB</td>
                        <td style={{ color: 'var(--clr-text-dim)', fontSize: 11 }}>{timeAgo(log.created_at)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
