'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Sparkles, Send, Paperclip, Globe, FileText, Image as ImageIcon,
  Check, Copy, RefreshCw, Trash2, Bot, User, Code, CornerDownLeft, Zap
} from 'lucide-react';

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: Array<{ name: string; type: string; content?: string }>;
  webSearchUsed?: boolean;
};

type FileAttachment = {
  name: string;
  type: string;
  size: number;
  content?: string;
};

interface AiAssistantProps {
  onClose?: () => void;
  compact?: boolean;
}

export default function AiAssistant({ onClose, compact = false }: AiAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-1',
      role: 'assistant',
      content: `### 👋 Welcome to NetBypass AI Assistant!

I am your **Generative AI Replybot** (powered by Gemini & real-time search engine). I can help you with:

- 🌐 **Web & Network Concepts**: Explain how Cloudflare, proxies, and edge networks bypass WiFi firewalls.
- 💻 **Code & Debugging**: Write, refactor, and fix code in Java, Python, JavaScript, Next.js, and TypeScript.
- 📁 **File & Image Analysis**: Upload code files, text documents, or images using the attachment icon below.
- 🔍 **Real-Time Answers**: Grounded with real-time web search for up-to-date concepts and technical documentation.

*How can I assist you today?*`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [webSearch, setWebSearch] = useState(true);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Handle File Attachments
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const textContent = event.target?.result as string;
        setAttachments((prev) => [
          ...prev,
          {
            name: file.name,
            type: file.type || 'document',
            size: file.size,
            content: textContent,
          },
        ]);
      };
      if (file.type.startsWith('image/')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // Submit Prompt to AI API Route
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const prompt = input.trim();
    if (!prompt && attachments.length === 0) return;
    if (loading) return;

    const userMessageId = `user-${Date.now()}`;
    const userMsg: Message = {
      id: userMessageId,
      role: 'user',
      content: prompt || (attachments.length > 0 ? `Analyzed attached files: ${attachments.map(a => a.name).join(', ')}` : ''),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      attachments: attachments.map((a) => ({ name: a.name, type: a.type, content: a.content })),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    const currentAttachments = [...attachments];
    setAttachments([]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          attachments: currentAttachments,
          searchEnabled: webSearch,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'AI request failed');

      const assistantMsg: Message = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: data.content,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        webSearchUsed: data.webSearchUsed,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorMsg: Message = {
        id: `ai-err-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ **AI Error**: ${err instanceof Error ? err.message : 'Failed to connect to AI server. Please try again.'}`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        role: 'assistant',
        content: 'Conversation cleared. How can I help you next?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const promptSuggestions = [
    'How does NetBypass bypass WiFi firewalls?',
    'Write a Java Spring Boot proxy controller example',
    'Explain SSRF protection with code snippets',
    'How do I deploy Java backend to Railway?',
  ];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      maxHeight: 'calc(100vh - 40px)',
      background: 'var(--clr-bg)',
      borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--clr-border)',
      boxShadow: 'var(--shadow-card)',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Header Bar */}
      <div style={{
        padding: '14px 20px',
        background: 'var(--clr-surface-light)',
        borderBottom: '1px solid var(--clr-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, var(--clr-primary), var(--clr-accent-blue))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <Sparkles size={16} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--clr-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              NetBypass AI Assistant
              <span style={{
                fontSize: 10,
                background: 'rgba(16, 185, 129, 0.15)',
                color: 'var(--clr-green)',
                padding: '2px 8px',
                borderRadius: 12,
                fontWeight: 600,
                border: '1px solid rgba(16, 185, 129, 0.3)'
              }}>
                Gemini Engine Active
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--clr-text-muted)' }}>
              Real-time search & file analysis ready
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            className={`btn btn-sm ${webSearch ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setWebSearch(!webSearch)}
            title="Toggle Real-time Web Search Grounding"
            style={{ fontSize: 11, padding: '4px 10px', gap: 5 }}
          >
            <Globe size={12} />
            Web Search: {webSearch ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={clearChat}
            title="Clear Chat History"
            style={{ padding: '6px' }}
          >
            <Trash2 size={13} />
          </button>

          {onClose && (
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={onClose}
              title="Close AI Assistant"
              style={{ padding: '6px', color: 'var(--clr-text-muted)' }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Messages Stream */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20
      }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              gap: 14,
              maxWidth: msg.role === 'user' ? '85%' : '100%',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              flexDirection: msg.role === 'user' ? 'row-reverse' : 'row'
            }}
          >
            {/* Avatar */}
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: msg.role === 'user'
                ? 'var(--clr-primary)'
                : 'linear-gradient(135deg, var(--clr-accent-blue), var(--clr-accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              flexShrink: 0
            }}>
              {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
            </div>

            {/* Bubble */}
            <div style={{
              background: msg.role === 'user' ? 'var(--clr-surface-light)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${msg.role === 'user' ? 'var(--clr-primary-glow)' : 'var(--clr-border)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              color: 'var(--clr-text)',
              fontSize: 14,
              lineHeight: 1.6,
              position: 'relative'
            }}>
              {/* Attachments preview inside message */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {msg.attachments.map((att, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: 11,
                        background: 'rgba(246, 130, 31, 0.15)',
                        color: 'var(--clr-primary)',
                        padding: '3px 8px',
                        borderRadius: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4
                      }}
                    >
                      <FileText size={11} /> {att.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Message text with basic markdown rendering */}
              <div
                style={{ whiteSpace: 'pre-wrap' }}
                dangerouslySetInnerHTML={{
                  __html: formatMarkdown(msg.content)
                }}
              />

              {/* Message Footer */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 10,
                paddingTop: 8,
                borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                fontSize: 11,
                color: 'var(--clr-text-dim)'
              }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {msg.timestamp}
                  {msg.webSearchUsed && (
                    <span style={{ color: 'var(--clr-cyan)', display: 'flex', alignItems: 'center', gap: 3 }}>
                      <Globe size={10} /> Web Grounded
                    </span>
                  )}
                </span>
                <button
                  onClick={() => copyText(msg.id, msg.content)}
                  className="btn btn-sm btn-ghost"
                  style={{ padding: '2px 6px', fontSize: 10 }}
                  title="Copy message"
                >
                  {copiedId === msg.id ? <Check size={11} color="var(--clr-green)" /> : <Copy size={11} />}
                </button>
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: 14, alignSelf: 'flex-start' }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--clr-accent-blue), var(--clr-accent-purple))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff'
            }}>
              <Bot size={15} />
            </div>
            <div style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid var(--clr-border)',
              borderRadius: 'var(--radius-md)',
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              color: 'var(--clr-text-muted)',
              fontSize: 13
            }}>
              <div className="spinner spinner-sm" style={{ borderTopColor: 'var(--clr-primary)' }} />
              Gemini AI is generating answer & searching web...
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Prompt Suggestion Chips */}
      {messages.length <= 2 && (
        <div style={{
          padding: '0 20px 10px',
          display: 'flex',
          gap: 8,
          overflowX: 'auto',
          flexShrink: 0
        }}>
          {promptSuggestions.map((s, i) => (
            <button
              key={i}
              className="preset-chip"
              onClick={() => { setInput(s); }}
              style={{ fontSize: 12, padding: '6px 12px', whiteSpace: 'nowrap' }}
            >
              ✨ {s}
            </button>
          ))}
        </div>
      )}

      {/* Attachment Previews above input */}
      {attachments.length > 0 && (
        <div style={{
          padding: '8px 20px 0',
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          background: 'var(--clr-surface-light)',
          borderTop: '1px solid var(--clr-border)'
        }}>
          {attachments.map((att, index) => (
            <div
              key={index}
              style={{
                fontSize: 11,
                background: 'rgba(246, 130, 31, 0.15)',
                color: 'var(--clr-primary)',
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid rgba(246, 130, 31, 0.3)'
              }}
            >
              <FileText size={12} />
              <span>{att.name} ({(att.size / 1024).toFixed(1)} KB)</span>
              <button
                type="button"
                onClick={() => removeAttachment(index)}
                style={{ background: 'none', border: 'none', color: 'var(--clr-red)', cursor: 'pointer', marginLeft: 4 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input Toolbar */}
      <form
        onSubmit={handleSubmit}
        style={{
          padding: '14px 20px',
          background: 'var(--clr-surface-light)',
          borderTop: '1px solid var(--clr-border)',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexShrink: 0
        }}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          multiple
          style={{ display: 'none' }}
        />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          title="Upload Document / Image / Code file"
          style={{ padding: '8px 12px', flexShrink: 0 }}
        >
          <Paperclip size={16} color="var(--clr-primary)" />
        </button>

        <input
          type="text"
          className="address-input"
          placeholder="Ask AI anything or upload a file (e.g. How does NetBypass proxy work?)..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            background: 'rgba(0,0,0,0.4)',
            border: '1px solid var(--clr-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            color: 'var(--clr-text)',
            fontSize: 14
          }}
        />

        <button
          type="submit"
          className="btn btn-primary"
          disabled={loading || (!input.trim() && attachments.length === 0)}
          style={{ padding: '10px 18px', flexShrink: 0 }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}

// Basic markdown formatting helper (headings, code blocks, bold text)
function formatMarkdown(text: string): string {
  if (!text) return '';
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks ```lang ... ```
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre style="background: rgba(0,0,0,0.6); padding: 12px; borderRadius: 6px; overflowX: auto; fontFamily: var(--font-mono); fontSize: 13px; border: 1px solid var(--clr-border); margin: 8px 0; color: #38bdf8;"><code>${code.trim()}</code></pre>`;
  });

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code style="background: rgba(255,255,255,0.1); padding: 2px 6px; borderRadius: 4px; fontFamily: var(--font-mono); fontSize: 12px;">$1</code>');

  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Headings ###
  html = html.replace(/^### (.*$)/gim, '<h4 style="color: var(--clr-primary); margin: 10px 0 6px; fontSize: 15px; fontWeight: 700;">$1</h4>');
  html = html.replace(/^#### (.*$)/gim, '<h5 style="color: var(--clr-text); margin: 8px 0 4px; fontSize: 13px; fontWeight: 600;">$1</h5>');

  return html;
}
