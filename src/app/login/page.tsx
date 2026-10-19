'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRole } from '@/lib/role-context';
import {
  Sun,
  Zap,
  Shield,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Database,
  CheckCircle2,
  AlertCircle,
  Building2,
  TrendingUp,
  User,
  Radio,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useRole();

  const [activeTab, setActiveTab] = useState<'signin' | 'register'>('signin');

  // Sign In fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Register fields
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;

    setLoading(true);
    setError('');

    try {
      const res = await login(email, password);
      if (res.success) {
        const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
        const redirectParam = searchParams?.get('redirect');
        router.replace(redirectParam || '/analytics');
      } else {
        setError(res.error || 'Invalid username/email or password.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed. Please check your connection.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regEmail.trim() || !regPassword || !regName.trim()) {
      setRegError('Please complete all required fields.');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('Passwords do not match.');
      return;
    }
    if (regPassword.length < 6) {
      setRegError('Password must be at least 6 characters long.');
      return;
    }

    setRegLoading(true);
    setRegError('');

    try {
      const res = await register({
        email: regEmail.trim(),
        password: regPassword,
        fullName: regName.trim(),
      });
      if (res.success) {
        // Direct new customer to analytics where the Connect Deye prompt will guide them
        router.replace('/analytics?onboarding=true');
      } else {
        setRegError(res.error || 'Failed to create account.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Registration failed. Please try again.';
      setRegError(message);
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-card/50 to-background p-4 sm:p-6 lg:p-8 relative overflow-hidden">
      {/* Background Solar Flare & Glow Effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl border border-border/80 bg-card/70 backdrop-blur-xl shadow-2xl overflow-hidden relative z-10">
        {/* Left / Info Branding Panel (Desktop) */}
        <div className="lg:col-span-5 p-8 lg:p-10 bg-muted/40 border-b lg:border-b-0 lg:border-r border-border/60 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-8">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-400 text-white flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Sun size={26} className="animate-spin-slow" />
              </div>
              <div>
                <h1 className="text-xl font-bold font-headline tracking-tight text-foreground">
                  VOSolar
                </h1>
                <p className="text-[11px] font-mono text-muted-foreground uppercase tracking-wider">
                  Telemetry Operations
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-foreground leading-snug">
                Mission Control &amp; Photovoltaic Synoptics
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                High-frequency inverter telemetry, battery state-of-charge profiling, and multi-tenant plant monitoring.
              </p>
            </div>

            {/* Feature Highlights */}
            <div className="mt-8 space-y-3.5">
              <div className="flex items-start gap-3 text-xs text-muted-foreground">
                <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap size={13} />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Zero-Latency Telemetry</span>
                  <span>Instant inverter power harvest and battery charge cycle metrics.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-muted-foreground">
                <div className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Building2 size={13} />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Customer Plant Scoping</span>
                  <span>Customers monitor strictly their personal DeyeCloud stations.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 text-xs text-muted-foreground">
                <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Shield size={13} />
                </div>
                <div>
                  <span className="font-semibold text-foreground block">Direct DeyeCloud Link</span>
                  <span>Auto-discover inverters and loggers with your developer keys.</span>
                </div>
              </div>
            </div>
          </div>

          {/* Cloud Database Pill */}
          <div className="mt-8 pt-4 border-t border-border/50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
              <Database size={13} className="text-cyan-500" />
              <span>Database Sync</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-emerald-500/10 text-emerald-500 border border-emerald-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </span>
          </div>
        </div>

        {/* Right / Auth Form Panel */}
        <div className="lg:col-span-7 p-8 lg:p-12 flex flex-col justify-center">
          <div className="max-w-md mx-auto w-full">
            {/* Tab Switcher */}
            <div className="flex rounded-2xl bg-muted/70 p-1 mb-6 border border-border/60">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('signin');
                  setError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'signin'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('register');
                  setRegError('');
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                  activeTab === 'register'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Create Account
              </button>
            </div>

            {activeTab === 'signin' ? (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground font-headline">
                    Sign In to Portal
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter your registered email or username to access your solar monitoring.
                  </p>
                </div>

                {error && (
                  <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-500 animate-in fade-in-50">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{error}</span>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="login-username" className="block text-xs font-semibold text-foreground mb-1.5">
                      Username or Email
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="login-username"
                        type="text"
                        required
                        autoFocus
                        placeholder="Username or email address"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (error) setError('');
                        }}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="login-password" className="block text-xs font-semibold text-foreground mb-1.5">
                      Password
                    </label>
                    <div className="relative">
                      <Lock
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        placeholder="••••••••••••"
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (error) setError('');
                        }}
                        className="w-full pl-10 pr-11 py-2.5 rounded-xl bg-background border border-border/80 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={loading || !email.trim() || !password}
                      className="w-full py-2.5 h-11 text-xs font-semibold uppercase tracking-wider bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all cursor-pointer"
                    >
                      {loading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                          <span>Authenticating...</span>
                        </div>
                      ) : (
                        <span>Sign In to Dashboard</span>
                      )}
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground font-headline">
                    Create Customer Account
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Register your customer portal profile to link and monitor your solar plants.
                  </p>
                </div>

                {regError && (
                  <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-500 animate-in fade-in-50">
                    <AlertCircle size={15} className="shrink-0 mt-0.5" />
                    <span className="font-medium leading-relaxed">{regError}</span>
                  </div>
                )}

                <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
                  <div>
                    <label htmlFor="reg-name" className="block text-xs font-semibold text-foreground mb-1.5">
                      Full Name or Company
                    </label>
                    <div className="relative">
                      <User
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="reg-name"
                        type="text"
                        required
                        autoFocus
                        placeholder="e.g. John Doe"
                        value={regName}
                        onChange={(e) => setRegName(e.target.value)}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs font-sans"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="reg-email" className="block text-xs font-semibold text-foreground mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      />
                      <input
                        id="reg-email"
                        type="email"
                        required
                        placeholder="john@example.com"
                        value={regEmail}
                        onChange={(e) => {
                          setRegEmail(e.target.value);
                          if (regError) setRegError('');
                        }}
                        className="w-full pl-10 pr-3.5 py-2.5 rounded-xl bg-background border border-border/80 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="reg-password" className="block text-xs font-semibold text-foreground mb-1.5">
                        Password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-password"
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          placeholder="••••••••"
                          value={regPassword}
                          onChange={(e) => {
                            setRegPassword(e.target.value);
                            if (regError) setRegError('');
                          }}
                          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/80 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reg-confirm-password" className="block text-xs font-semibold text-foreground mb-1.5">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <input
                          id="reg-confirm-password"
                          type={showRegPassword ? 'text' : 'password'}
                          required
                          placeholder="••••••••"
                          value={regConfirmPassword}
                          onChange={(e) => {
                            setRegConfirmPassword(e.target.value);
                            if (regError) setRegError('');
                          }}
                          className="w-full px-3 py-2.5 rounded-xl bg-background border border-border/80 text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-2xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowRegPassword(!showRegPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer p-1"
                          aria-label={showRegPassword ? 'Hide password' : 'Show password'}
                        >
                          {showRegPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      type="submit"
                      disabled={regLoading || !regEmail.trim() || !regPassword || !regName.trim()}
                      className="w-full py-2.5 h-11 text-xs font-semibold uppercase tracking-wider bg-emerald-600 hover:bg-emerald-700 text-white shadow-md transition-all cursor-pointer"
                    >
                      {regLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span>Creating Account...</span>
                        </div>
                      ) : (
                        <span>Create Account &amp; Proceed</span>
                      )}
                    </Button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
