'use client';

import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  Sparkles, Globe, Activity, Shield, Settings,
  LogOut, LogIn, User as UserIcon, ChevronLeft, ChevronRight, Zap
} from 'lucide-react';

export type NavTab = 'ai' | 'browser' | 'logs' | 'rules' | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  user: User | null;
  onSignOut: () => void;
}

export default function Sidebar({ activeTab, onTabChange, user, onSignOut }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'ai', label: 'AI Assistant', icon: <Sparkles size={18} color="var(--clr-primary)" />, badge: 'Gemini' },
    { id: 'browser', label: 'NetBypass Browser', icon: <Globe size={18} color="var(--clr-accent-blue)" /> },
    { id: 'logs', label: 'Traffic & Logs', icon: <Activity size={18} color="var(--clr-cyan)" /> },
    { id: 'rules', label: 'Security Rules', icon: <Shield size={18} color="var(--clr-green)" /> },
  ];

  return (
    <aside style={{
      width: collapsed ? 72 : 240,
      height: '100vh',
      background: 'var(--clr-surface-light)',
      borderRight: '1px solid var(--clr-border)',
      display: 'flex',
      flexDirection: 'column',
      transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      position: 'relative',
      zIndex: 50,
      flexShrink: 0
    }}>
      {/* Collapse Toggle Button */}
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        style={{
          position: 'absolute',
          right: -12,
          top: 24,
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--clr-primary)',
          border: 'none',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          boxShadow: 'var(--shadow-glow)',
          zIndex: 60
        }}
        title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {/* App Logo */}
      <div style={{
        padding: collapsed ? '20px 0' : '20px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderBottom: '1px solid var(--clr-border)'
      }}>
        <a href="/" className="logo" style={{ gap: 10 }}>
          <div className="logo-icon" style={{ width: 34, height: 34, fontSize: 18 }}>🌐</div>
          {!collapsed && (
            <span className="logo-text" style={{ fontSize: 18 }}>
              Net<span>Bypass</span>
            </span>
          )}
        </a>
      </div>

      {/* Navigation List */}
      <nav style={{ flex: 1, padding: '16px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onTabChange(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: collapsed ? '12px 0' : '10px 14px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 'var(--radius-md)',
                background: isActive ? 'rgba(246, 130, 31, 0.15)' : 'transparent',
                color: isActive ? 'var(--clr-primary)' : 'var(--clr-text-muted)',
                border: isActive ? '1px solid rgba(246, 130, 31, 0.3)' : '1px solid transparent',
                fontWeight: isActive ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left'
              }}
            >
              {item.icon}
              {!collapsed && (
                <span style={{ flex: 1 }}>{item.label}</span>
              )}
              {!collapsed && item.badge && (
                <span style={{
                  fontSize: 10,
                  background: 'rgba(246, 130, 31, 0.2)',
                  color: 'var(--clr-primary)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  fontWeight: 700
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User / Auth Footer */}
      <div style={{
        padding: collapsed ? '16px 0' : '16px',
        borderTop: '1px solid var(--clr-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        alignItems: collapsed ? 'center' : 'stretch'
      }}>
        {user ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            justifyContent: collapsed ? 'center' : 'space-between',
            background: 'rgba(0,0,0,0.3)',
            padding: collapsed ? '8px' : '8px 12px',
            borderRadius: 'var(--radius-sm)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'var(--clr-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                flexShrink: 0
              }}>
                <UserIcon size={14} />
              </div>
              {!collapsed && (
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--clr-text)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                    {user.email?.split('@')[0]}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--clr-green)' }}>● Authenticated</div>
                </div>
              )}
            </div>

            {!collapsed && (
              <button
                type="button"
                onClick={onSignOut}
                className="btn btn-sm btn-ghost"
                title="Sign Out"
                style={{ padding: 4 }}
              >
                <LogOut size={14} color="var(--clr-red)" />
              </button>
            )}
          </div>
        ) : (
          <a
            href="/login"
            className="btn btn-sm btn-primary"
            style={{
              justifyContent: 'center',
              width: '100%',
              fontSize: 12,
              padding: collapsed ? '8px' : '8px 12px'
            }}
          >
            <LogIn size={14} />
            {!collapsed && 'Sign In / Register'}
          </a>
        )}
      </div>
    </aside>
  );
}
