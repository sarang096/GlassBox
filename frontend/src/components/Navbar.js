'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Hexagon, LogOut } from 'lucide-react';

export default function Navbar() {
  const { user, logout } = useAuth();

  return (
    <nav className="navbar" id="main-navbar">
      <div className="navbar-inner">
        <Link href={user ? '/dashboard' : '/'} className="navbar-logo">
          <span className="navbar-logo-icon"><Hexagon size={18} strokeWidth={2.5} /></span>
          GroupHub
        </Link>

        <div className="navbar-actions">
          {user ? (
            <>
              <div className="navbar-user">
                <div className="navbar-avatar">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="navbar-username">{user.username}</span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={logout} id="logout-btn" style={{ padding: '6px 10px' }} title="Logout">
                <LogOut size={16} />
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm" id="nav-login-btn">
                Sign In
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm" id="nav-register-btn">
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
