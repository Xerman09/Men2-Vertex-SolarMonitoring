'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap,
  Radio,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Building2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';

export function ConnectDeyeModal() {
  const { showConnectModal, setShowConnectModal } = useRole();
  const { refreshAccounts, selectAccountAndPlant } = useAccount();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [name, setName] = useState('');
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [baseUrl, setBaseUrl] = useState('https://api.deyecloud.com');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showAppSecret, setShowAppSecret] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  loadingRef.current = loading;

  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState<{
    plants: number;
    devices: number;
    accountName: string;
  } | null>(null);

  const resetAndCloseState = useCallback(() => {
    setShowConnectModal(false);
    setError('');
    setSuccessData(null);
  }, [setShowConnectModal]);

  const requestModalClose = useCallback(() => {
    if (loadingRef.current) return;
    const dialog = dialogRef.current;
    if (dialog?.open) {
      dialog.close();
    } else {
      resetAndCloseState();
    }
  }, [resetAndCloseState]);

  // Sync top-layer modal open/closed state and closedby attribute
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.setAttribute('closedby', loading ? 'none' : 'any');

    if (showConnectModal && !dialog.open) {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
    } else if (!showConnectModal && dialog.open) {
      dialog.close();
    }
  }, [showConnectModal, loading]);

  // Progressive fallback for browsers without <dialog closedby="any">
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || 'closedBy' in HTMLDialogElement.prototype) return;

    const outside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };

    let pressedOutside = false;
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = dialog.open && !loadingRef.current && outside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && dialog.open && !loadingRef.current && outside(e)) {
        dialog.close();
      }
      pressedOutside = false;
    };

    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);
    return () => {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId.trim() || !appSecret.trim() || !email.trim() || !password) {
      setError('Please fill in all required DeyeCloud developer credentials.');
      return;
    }

    setLoading(true);
    setError('');
    setSuccessData(null);

    try {
      const res = await fetch('/api/deye/accounts/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          appId: appId.trim(),
          appSecret: appSecret.trim(),
          email: email.trim(),
          password,
          baseUrl: baseUrl.trim() || 'https://api.deyecloud.com',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessData({
          plants: data.plantsDiscovered || 0,
          devices: data.devicesDiscovered || 0,
          accountName: data.account?.name || name || 'Your Solar Plant',
        });

        // Trigger account context refresh to pull newly discovered stations
        await refreshAccounts(true, true);

        if (data.account?.id && data.defaultStationId) {
          selectAccountAndPlant(data.account.id, data.defaultStationId);
        }

        setTimeout(() => {
          setShowConnectModal(false);
          setSuccessData(null);
        }, 2500);
      } else {
        setError(data.error || 'Failed to connect DeyeCloud account. Please check credentials.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Network error. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="connect-modal-title"
      onCancel={(e) => {
        if (loadingRef.current) e.preventDefault();
      }}
      onClose={(e) => {
        e.currentTarget.returnValue = '';
        resetAndCloseState();
      }}
      className="vos-modal w-[calc(100%-2rem)] max-w-lg rounded-2xl bg-card border border-border/80 text-foreground p-6 sm:p-7 shadow-2xl overflow-y-auto"
    >
      {showConnectModal && (
        <div className="relative">
          {/* Ambient Top Glow */}
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-72 h-20 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

          <button
            type="button"
            onClick={requestModalClose}
            disabled={loading}
            aria-label="Close modal"
            className="absolute -top-2 -right-2 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center shadow-xs">
            <Radio size={20} className="animate-pulse" />
          </div>
          <div>
            <h2 id="connect-modal-title" className="text-lg font-bold text-foreground font-headline">
              Connect DeyeCloud Account
            </h2>
            <p className="text-xs text-muted-foreground">
              Link your developer credentials to auto-discover stations and inverters.
            </p>
          </div>
        </div>

        {/* Developer Portal Guide Box */}
        <div className="mb-4 p-3 rounded-xl bg-muted/40 border border-border/60 text-xs text-muted-foreground flex items-start gap-2.5">
          <Zap size={15} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="text-foreground font-medium block mb-0.5">Where to find these credentials:</span>
            <span>
              Log in to{' '}
              <a
                href="https://open.deyecloud.com"
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5 font-semibold"
              >
                open.deyecloud.com <ExternalLink size={10} />
              </a>{' '}
              &gt; Developer Center &gt; App Management to obtain your App ID and App Secret.
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2 text-xs text-rose-500 animate-in fade-in-50">
            <AlertCircle size={15} className="shrink-0 mt-0.5" />
            <span className="font-medium leading-relaxed">{error}</span>
          </div>
        )}

        {successData ? (
          <div className="py-6 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-3 animate-in zoom-in-95">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center mx-auto">
              <CheckCircle2 size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground font-headline">
                {successData.accountName} Connected!
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Discovered <span className="font-semibold text-emerald-400">{successData.plants} solar station(s)</span> and{' '}
                <span className="font-semibold text-cyan-400">{successData.devices} hardware device(s)</span>.
              </p>
            </div>
            <div className="pt-2">
              <span className="text-[11px] font-mono text-muted-foreground">
                Initializing live synoptics stream...
              </span>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label htmlFor="connect-name" className="block text-xs font-semibold text-foreground mb-1">
                Plant or Site Profile Name
              </label>
              <div className="relative">
                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="connect-name"
                  type="text"
                  autoFocus
                  placeholder="e.g. My Rooftop Solar"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border/70 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary font-sans"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="connect-appid" className="block text-xs font-semibold text-foreground mb-1">
                  App ID <span className="text-rose-500">*</span>
                </label>
                <input
                  id="connect-appid"
                  type="text"
                  required
                  placeholder="e.g. 20240918..."
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border/70 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>

              <div>
                <label htmlFor="connect-appsecret" className="block text-xs font-semibold text-foreground mb-1">
                  App Secret <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    id="connect-appsecret"
                    type={showAppSecret ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••••••"
                    value={appSecret}
                    onChange={(e) => setAppSecret(e.target.value)}
                    className="w-full pl-3 pr-8 py-2 rounded-xl bg-background border border-border/70 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAppSecret(!showAppSecret)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showAppSecret ? 'Hide App Secret' : 'Show App Secret'}
                  >
                    {showAppSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="connect-email" className="block text-xs font-semibold text-foreground mb-1">
                  DeyeCloud Account Email <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="connect-email"
                    type="email"
                    required
                    placeholder="deye@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-background border border-border/70 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="connect-password" className="block text-xs font-semibold text-foreground mb-1">
                  DeyeCloud Password <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    id="connect-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-background border border-border/70 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Advanced Options Accordion */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>Advanced Endpoint Configuration</span>
              </button>

              {showAdvanced && (
                <div className="mt-2 p-3 rounded-xl bg-muted/30 border border-border/50 animate-in fade-in-50">
                  <label htmlFor="connect-baseurl" className="block text-[11px] font-semibold text-muted-foreground mb-1">
                    DeyeCloud API Base URL (Region Server)
                  </label>
                  <input
                    id="connect-baseurl"
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.deyecloud.com"
                    className="w-full px-3 py-1.5 rounded-lg bg-background border border-border/70 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                  />
                  <span className="text-[10px] text-muted-foreground mt-1 block">
                    Default is global server: <code>https://api.deyecloud.com</code>
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                disabled={loading}
                onClick={requestModalClose}
                className="text-xs h-9"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading || !appId.trim() || !appSecret.trim() || !email.trim() || !password}
                className="text-xs h-9 font-semibold bg-amber-500 hover:bg-amber-600 text-white shadow-md cursor-pointer"
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Discovering Plants...</span>
                  </div>
                ) : (
                  <span>Connect &amp; Discover Plants</span>
                )}
              </Button>
            </div>
          </form>
        )}
        </div>
      )}
    </dialog>
  );
}
