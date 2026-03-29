'use client';

import Link from 'next/link';
import Navbar from '@/components/Navbar';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.push('/dashboard');
  }, [user, loading, router]);

  return (
    <>
      <Navbar />

      <section className="hero" id="hero-section">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot"></span>
            A Better Way to Hire
          </div>

          <h1>
            Test Real Skills,<br />
            <span className="gradient-text">Not LeetCode.</span>
          </h1>

          <p className="hero-desc">
            Create workspaces with real project files. Candidates get their own copy to work on.
            Review everyone&#39;s code independently — no cheating, no generic puzzles.
          </p>

          <div className="hero-buttons">
            <Link href="/register" className="btn btn-primary btn-lg" id="hero-get-started">
              Start Hiring →
            </Link>
            <Link href="/login" className="btn btn-secondary btn-lg" id="hero-sign-in">
              I&#39;m a Candidate
            </Link>
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <div className="hero-stat-value">📁</div>
              <div className="hero-stat-label">Real Project Files</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">🔒</div>
              <div className="hero-stat-label">Independent Copies</div>
            </div>
            <div className="hero-stat">
              <div className="hero-stat-value">👁️</div>
              <div className="hero-stat-label">Admin Oversight</div>
            </div>
          </div>
        </div>
      </section>

      <section className="features-section" id="features-section">
        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon">🏢</div>
            <h3>Create a Workspace</h3>
            <p>Set up your hiring workspace, define join fields (name, resume, etc.), and share a unique invite code.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">📝</div>
            <h3>Add Project Files</h3>
            <p>Create code files in a VS Code–styled editor. Every candidate gets their own independent copy to work on.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">🔍</div>
            <h3>Review Each Candidate</h3>
            <p>View every candidate&#39;s version of each file. Compare approaches. Candidates never see each other&#39;s work.</p>
          </div>
        </div>
      </section>
    </>
  );
}
