'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import Sidebar, { NavTab } from '@/components/Sidebar';
import AiAssistant from '@/components/AiAssistant';
import {
  Shield, Zap, Globe, Lock, Activity, Settings,
  RefreshCw, Send, Copy, Check, ExternalLink,
  Code, Eye, User as UserIcon, LogOut, LogIn,
  RotateCw, Home as HomeIcon, Download, Sparkles, ArrowLeft
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
function ProxyBrowser({ onNewLog, onReturnHome }: { onNewLog: () => void; onReturnHome?: () => void }) {
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

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === 'NETBYPASS_NAVIGATE' && e.data.url) {
        handleProxy(e.data.url);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleProxy();
  };

  const copyProxyUrl = (e: React.MouseEvent) => {
    e.preventDefault();
    const link = `${window.location.origin}/api/proxy?url=${encodeURIComponent(url)}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadPageContent = (e: React.MouseEvent) => {
    e.preventDefault();
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
    <div className="proxy-browser fade-up" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="browser-chrome" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div className="browser-toolbar">
          <div className="browser-dots">
            <span className="dot dot-red" />
            <span className="dot dot-yellow" />
            <span className="dot dot-green" />
          </div>

          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            {onReturnHome && (
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={(e) => { e.preventDefault(); onReturnHome(); }}
                title="Return Back to Home"
                style={{ padding: '4px 8px', fontSize: 11, gap: 4, color: 'var(--clr-primary)' }}
              >
                <ArrowLeft size={13} /> Return Back
              </button>
            )}
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={(e) => { e.preventDefault(); handleProxy(url); }}
              title="Reload page"
              disabled={loading}
              style={{ padding: '6px' }}
            >
              <RotateCw size={13} className={loading ? 'spinner-sm' : ''} />
            </button>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={(e) => { e.preventDefault(); setUrl('https://example.com'); handleProxy('https://example.com'); }}
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
                type="button"
                className="btn btn-sm btn-ghost"
                onClick={downloadPageContent}
                title="Download Page Content"
              >
                <Download size={13} />
              </button>
            )}
            <button type="button" className="btn btn-sm btn-ghost" onClick={copyProxyUrl} title="Copy proxy link">
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
            <button
              key={p.url}
              type="button"
              className="preset-chip"
              onClick={(e) => { e.preventDefault(); setUrl(p.url); handleProxy(p.url); }}
            >
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
                  type="button"
                  className={`view-btn ${viewMode === 'render' ? 'active' : ''}`}
                  onClick={() => setViewMode('render')}
                >
                  <Eye size={11} /> Render
                </button>
                <button
                  type="button"
                  className={`view-btn ${viewMode === 'source' ? 'active' : ''}`}
                  onClick={() => setViewMode('source')}
                >
                  <Code size={11} /> Source
                </button>
              </div>
            )}
          </div>
        )}

        <div className="browser-viewport" style={{ flex: 1 }}>
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

// ─── Main Application Shell ───────────────────────────────
export default function Home() {
  const [activeTab, setActiveTab] = useState<NavTab>('ai');
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
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--clr-bg)' }}>
      {/* Left Sidebar Navigation Drawer */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        user={user}
        onSignOut={handleSignOut}
      />

      {/* Main Content Workspace */}
      <main style={{ flex: 1, height: '100vh', overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Flashy Attractive Hero Banner */}
        <div style={{
          background: 'linear-gradient(135deg, rgba(246, 130, 31, 0.12), rgba(56, 189, 248, 0.08))',
          border: '1px solid rgba(246, 130, 31, 0.25)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px 30px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                background: 'var(--clr-primary)',
                color: '#fff',
                fontSize: 11,
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: 20,
                letterSpacing: 0.5,
                textTransform: 'uppercase'
              }}>
                ⚡ NextGen Web Bypass & AI
              </span>
              <span style={{ fontSize: 12, color: 'var(--clr-green)', display: 'flex', alignItems: 'center', gap: 4 }}>
                ● Edge Proxy & Real-Time Search Active
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveTab('browser')}
              className="btn btn-sm btn-ghost"
              style={{ fontSize: 12, color: 'var(--clr-primary)' }}
            >
              Open Inbuilt Browser →
            </button>
          </div>

          <h1 style={{
            fontSize: 32,
            fontWeight: 800,
            color: '#fff',
            margin: 0,
            background: 'linear-gradient(90deg, #ffffff, var(--clr-primary), #38bdf8)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            Unrestricted Web Access & Real-Time AI Search
          </h1>

          <p style={{ fontSize: 14, color: 'var(--clr-text-muted)', margin: 0, maxWidth: 820, lineHeight: 1.6 }}>
            Bypass local WiFi firewalls with Vercel Edge proxy nodes and ask our Real-Time AI Assistant anything. Upload files, images, or documents for instant analysis with live search grounding!
          </p>
        </div>

        {/* Tab View 1: AI Assistant (Home Tab) */}
        {activeTab === 'ai' && (
          <div style={{ flex: 1, minHeight: 600 }}>
            <AiAssistant />
          </div>
        )}

        {/* Tab View 2: Inbuilt NetBypass Browser */}
        {activeTab === 'browser' && (
          <div style={{ flex: 1, minHeight: 600 }}>
            <ProxyBrowser onNewLog={fetchLogs} onReturnHome={() => setActiveTab('ai')} />
          </div>
        )}

        {/* Tab View 3: Traffic & Request Audit Logs */}
        {activeTab === 'logs' && (
          <div className="card fade-up">
            <div className="card-header">
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--clr-text)' }}>
                Real-Time Proxy Audit Logs
              </h2>
              <button type="button" className="btn btn-sm btn-ghost" onClick={fetchLogs} disabled={logsLoading}>
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
                        No request logs yet. Browse websites using the Inbuilt Browser to record traffic!
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

        {/* Tab View 4: Security Rules */}
        {activeTab === 'rules' && (
          <div className="card fade-up" style={{ padding: 24 }}>
            <h2 style={{ color: 'var(--clr-text)', fontSize: 18, marginBottom: 12 }}>🛡️ Security & Firewall Rules</h2>
            <p style={{ color: 'var(--clr-text-muted)', fontSize: 14 }}>
              SSRF Protection actively blocks local IP ranges (127.0.0.1, 10.x.x.x, 192.168.x.x) and protects client requests.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
