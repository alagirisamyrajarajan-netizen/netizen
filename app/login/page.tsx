'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Shield, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2, UserPlus, LogIn } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // ── Google OAuth Login ──────────────────────────────────────────────
  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`,
        },
      });
      if (authError) throw authError;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign in failed');
      setLoading(false);
    }
  };

  // ── Email / Password Auth ──────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
        router.push('/');
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.user && !data.session) {
          setMessage('Account created! Please check your email to confirm your registration.');
        } else {
          setMessage('Account created successfully! Redirecting...');
          setTimeout(() => router.push('/'), 1500);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Background Grids & Orbs */}
      <div className="bg-grid" />
      <div className="bg-orb bg-orb-1" />
      <div className="bg-orb bg-orb-2" />

      <div style={{
        width: '100%',
        maxWidth: 440,
        position: 'relative',
        zIndex: 10
      }}>
        {/* Logo Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="/" className="logo" style={{ justifyContent: 'center', fontSize: 24, marginBottom: 8 }}>
            <div className="logo-icon" style={{ width: 40, height: 40, fontSize: 20 }}>🌐</div>
            <span className="logo-text">Net<span>Bypass</span></span>
          </a>
          <p style={{ color: 'var(--clr-text-muted)', fontSize: 14 }}>
            Cloudflare-inspired Network Bypass Dashboard
          </p>
        </div>

        {/* Card */}
        <div className="card" style={{
          padding: 32,
          boxShadow: 'var(--shadow-card), 0 0 80px rgba(246, 130, 31, 0.08)'
        }}>
          {/* Mode Switcher Tabs */}
          <div style={{
            display: 'flex',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 'var(--radius-md)',
            padding: 4,
            marginBottom: 24
          }}>
            <button
              type="button"
              className={`view-btn ${mode === 'signin' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
              onClick={() => { setMode('signin'); setError(null); setMessage(null); }}
            >
              <LogIn size={14} /> Sign In
            </button>
            <button
              type="button"
              className={`view-btn ${mode === 'signup' ? 'active' : ''}`}
              style={{ flex: 1, justifyContent: 'center', padding: '8px 16px', fontSize: 13, fontWeight: 600 }}
              onClick={() => { setMode('signup'); setError(null); setMessage(null); }}
            >
              <UserPlus size={14} /> Register
            </button>
          </div>

          {/* Google OAuth Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            style={{
              width: '100%',
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: '#ffffff',
              color: '#1f2937',
              fontWeight: 600,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              transition: 'all 0.2s',
              marginBottom: 20
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20,
            color: 'var(--clr-text-dim)',
            fontSize: 12
          }}>
            <div style={{ flex: 1, height: 1, background: 'var(--clr-border)' }} />
            <span>OR EMAIL</span>
            <div style={{ flex: 1, height: 1, background: 'var(--clr-border)' }} />
          </div>

          {/* Alerts */}
          {error && (
            <div style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: 'var(--clr-red)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <AlertCircle size={15} style={{ flexShrink: 0 }} />
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--clr-green)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 13,
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
              {message}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 6 }}>
                Email Address
              </label>
              <div className="address-wrap">
                <Mail size={14} color="var(--clr-text-muted)" style={{ flexShrink: 0 }} />
                <input
                  type="email"
                  className="address-input"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 12, color: 'var(--clr-text-muted)', display: 'block', marginBottom: 6 }}>
                Password
              </label>
              <div className="address-wrap">
                <Lock size={14} color="var(--clr-text-muted)" style={{ flexShrink: 0 }} />
                <input
                  type="password"
                  className="address-input"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', height: 44, justifyContent: 'center', fontSize: 14 }}
              disabled={loading}
            >
              {loading ? (
                <div className="spinner" style={{ width: 18, height: 18, borderTopColor: '#fff' }} />
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <ArrowRight size={15} />
                </>
              )}
            </button>
          </form>

          {/* Footer note */}
          <p style={{
            fontSize: 12,
            color: 'var(--clr-text-dim)',
            textAlign: 'center',
            marginTop: 20,
            lineHeight: 1.5
          }}>
            By signing in, you agree to NetBypass acceptable use policies.
            Powered by Supabase Auth.
          </p>
        </div>
      </div>
    </main>
  );
}
