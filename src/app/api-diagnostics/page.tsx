'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Radio,
  Terminal,
  Play,
  Copy,
  Check,
  Send,
  AlertCircle,
  Activity,
  Key,
  Server,
  RefreshCw,
  Lock,
} from 'lucide-react';
import { ApiHealthMetrics } from '@/lib/types';
import { useAccount } from '@/lib/account-context';
import { useRole } from '@/lib/role-context';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export default function ApiDiagnosticsPage() {
  const { selectedAccountId, selectedAccount, isFleetView, totalAccounts } = useAccount();
  const { isAdmin, setShowAuthModal } = useRole();
  const [health, setHealth] = useState<ApiHealthMetrics | null>(null);
  const [currentLang, setCurrentLang] = useState<'curl' | 'python' | 'node'>('curl');
  const [currentPreset, setCurrentPreset] = useState<'telemetry' | 'station' | 'workmode'>('telemetry');
  const [copied, setCopied] = useState(false);

  // Playground Execution State
  const [executing, setExecuting] = useState(false);
  const [responseOutput, setResponseOutput] = useState<string | null>(null);

  // Workmode Command Form State
  const [selectedMode, setSelectedMode] = useState<'PEAK_SHAVING' | 'BATTERY_FIRST' | 'LOAD_FIRST' | 'SELLING_FIRST'>('PEAK_SHAVING');
  const [gridCharge, setGridCharge] = useState(true);
  const [dispatchStatus, setDispatchStatus] = useState<{ message: string; success: boolean } | null>(null);
  const [dispatching, setDispatching] = useState(false);

  const fetchHealth = () => {
    const query = isFleetView ? '' : `?accountId=${encodeURIComponent(selectedAccountId)}`;
    fetch(`/api/deye/health${query}`)
      .then((r) => r.json())
      .then((data) => setHealth(data))
      .catch((e) => console.error(e));
  };

  useEffect(() => {
    fetchHealth();
  }, [selectedAccountId, isFleetView]);

  const snippets = {
    curl: {
      station: `curl -X GET "https://api.deyecloud.com/v1.0/station/latest?station_id=SP_04" \\\n  -H "Authorization: Bearer deye_live_token_77a988d" \\\n  -H "Accept: application/json"`,
      telemetry: `curl -X GET "https://api.deyecloud.com/v1.0/device/inverter/telemetry?device_sn=2209X891104" \\\n  -H "Authorization: Bearer deye_live_token_77a988d" \\\n  -H "Content-Type: application/json"`,
      workmode: `curl -X POST "https://api.deyecloud.com/v1.0/control/workmode" \\\n  -H "Authorization: Bearer deye_live_token_77a988d" \\\n  -H "Content-Type: application/json" \\\n  -d '{"device_sn": "2209X891104", "mode": "PEAK_SHAVING", "grid_charge": true}'`,
    },
    python: {
      station: `import requests\n\nurl = "https://api.deyecloud.com/v1.0/station/latest"\nheaders = {"Authorization": "Bearer deye_live_token_77a988d"}\nres = requests.get(url, params={"station_id": "SP_04"}, headers=headers)\nprint(res.json())`,
      telemetry: `import requests\n\nurl = "https://api.deyecloud.com/v1.0/device/inverter/telemetry"\nheaders = {"Authorization": "Bearer deye_live_token_77a988d"}\nres = requests.get(url, params={"device_sn": "2209X891104"}, headers=headers)\nprint(res.json())`,
      workmode: `import requests\n\nurl = "https://api.deyecloud.com/v1.0/control/workmode"\npayload = {"device_sn": "2209X891104", "mode": "PEAK_SHAVING", "grid_charge": True}\nres = requests.post(url, json=payload, headers={"Authorization": "Bearer deye_live_token_77a988d"})\nprint(res.status_code, res.json())`,
    },
    node: {
      station: `const axios = require('axios');\n\nconst { data } = await axios.get('https://api.deyecloud.com/v1.0/station/latest', {\n  params: { station_id: 'SP_04' },\n  headers: { Authorization: 'Bearer deye_live_token_77a988d' }\n});\nconsole.log(data);`,
      telemetry: `const axios = require('axios');\n\nconst { data } = await axios.get('https://api.deyecloud.com/v1.0/device/inverter/telemetry', {\n  params: { device_sn: '2209X891104' },\n  headers: { Authorization: 'Bearer deye_live_token_77a988d' }\n});\nconsole.log(data);`,
      workmode: `const axios = require('axios');\n\nconst { data } = await axios.post('https://api.deyecloud.com/v1.0/control/workmode', {\n  device_sn: '2209X891104',\n  mode: 'PEAK_SHAVING',\n  grid_charge: true\n}, {\n  headers: { Authorization: 'Bearer deye_live_token_77a988d' }\n});\nconsole.log(data);`,
    },
  };

  const copyCode = () => {
    const code = snippets[currentLang][currentPreset];
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const executePlayground = async () => {
    setExecuting(true);
    setResponseOutput(null);

    try {
      const query = isFleetView ? '' : `?accountId=${encodeURIComponent(selectedAccountId)}`;
      let endpoint = `/api/deye/telemetry${query}`;
      let method = 'GET';
      let bodyData = undefined;

      if (currentPreset === 'station') {
        endpoint = `/api/deye/station${query}`;
      } else if (currentPreset === 'workmode') {
        endpoint = '/api/deye/control';
        method = 'POST';
        bodyData = JSON.stringify({
          deviceSn: '2209X891104',
          mode: 'PEAK_SHAVING',
          gridCharge: true,
          accountId: isFleetView ? undefined : selectedAccountId,
        });
      }

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: bodyData,
      });

      const json = await res.json();
      setResponseOutput(JSON.stringify(json, null, 2));
    } catch (err) {
      setResponseOutput(JSON.stringify({ error: String(err) }, null, 2));
    } finally {
      setExecuting(false);
    }
  };

  const handleDispatchControl = async (e: React.FormEvent) => {
    e.preventDefault();
    setDispatching(true);
    setDispatchStatus(null);

    try {
      const res = await fetch('/api/deye/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceSn: '2209X891104',
          mode: selectedMode,
          gridCharge,
          accountId: isFleetView ? undefined : selectedAccountId,
        }),
      });

      const json = await res.json();
      if (res.ok) {
        setDispatchStatus({
          message: `Control signal acknowledged! Mode updated to ${selectedMode} (Grid Charge: ${gridCharge ? 'YES' : 'NO'}).`,
          success: true,
        });
      } else {
        setDispatchStatus({
          message: json.error || 'Failed to dispatch command to inverter cloud.',
          success: false,
        });
      }
    } catch (err) {
      setDispatchStatus({
        message: String(err),
        success: false,
      });
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full max-w-[1600px] mx-auto pb-12">
      {/* Top Header with VOS Design Standards */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-headline">
                  API & Diagnostics Console
                </h1>
                <Badge variant="outline" className="border-emerald-500/30 text-emerald-500 bg-emerald-500/10 font-mono text-[10px]">
                  Database / DeyeCloud
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Inspect OAuth token caches, probe latency, send real-time control dispatches, and test REST endpoints.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchHealth}
            className="gap-2 h-8 text-xs font-semibold"
          >
            <RefreshCw size={14} className="text-muted-foreground" />
            <span>Health Check</span>
          </Button>

          <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 bg-emerald-500/10 font-mono text-xs">
            Database Synced
          </Badge>
        </div>
      </div>

      {/* Health Metrics Grid in VOS Format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              API Ping Latency
            </span>
            <Activity size={16} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-emerald-500">
              {health?.pingMs ?? 14}
            </span>
            <span className="text-xs text-muted-foreground font-mono">ms</span>
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">
            {health?.region || 'Frankfurt eu1 Gateway'}
          </span>
        </Card>

        <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              OAuth Token Cache
            </span>
            <Key size={16} className="text-cyan-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-cyan-500">
              {health?.tokenExpiresAt ? 'ACTIVE' : 'READY'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">
            Auto-refreshing Bearer token
          </span>
        </Card>

        <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Rate Limit Capacity
            </span>
            <Server size={16} className="text-primary" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-primary">
              {health ? health.rateLimitMax - health.rateLimitUsed : 984}
            </span>
            <span className="text-xs text-muted-foreground font-mono">/ {health?.rateLimitMax || 1000} req</span>
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">
            Refreshes every 60 seconds
          </span>
        </Card>

        <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-1">
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
              Inverter Cloud State
            </span>
            <Radio size={16} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-black font-mono text-emerald-500">
              {health?.status || 'ONLINE'}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-1 block">
            Cloud polling active
          </span>
        </Card>
      </div>

      {/* Main Console & Command Dispatcher */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Interactive Endpoint Tester & Code Snippets */}
        <Card className="border-border/60 bg-card/80 p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-border/50">
              <div className="flex items-center gap-2">
                <Terminal size={18} className="text-cyan-500" />
                <span className="text-sm font-bold text-foreground">
                  REST Endpoint Inspector
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {(['curl', 'python', 'node'] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setCurrentLang(lang)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                      currentLang === lang
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Preset Selector */}
            <div className="flex items-center gap-2 mb-3">
              {(['telemetry', 'station', 'workmode'] as const).map((preset) => (
                <button
                  key={preset}
                  onClick={() => setCurrentPreset(preset)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    currentPreset === preset
                      ? 'bg-muted text-foreground border border-border/70 shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {preset.toUpperCase()}
                </button>
              ))}
            </div>

            {/* Code Block Container */}
            <div className="relative bg-muted/40 border border-border/60 rounded-xl p-3.5 font-mono text-xs overflow-x-auto">
              <button
                onClick={copyCode}
                className="absolute top-2.5 right-2.5 p-1.5 rounded-lg bg-card/80 hover:bg-card text-muted-foreground hover:text-foreground border border-border/50 transition-colors cursor-pointer"
                title="Copy code"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
              <pre className="text-foreground leading-relaxed">
                {snippets[currentLang][currentPreset]}
              </pre>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground font-mono">
              Database / DeyeCloud OpenAPI
            </span>
            <Button
              onClick={executePlayground}
              disabled={executing}
              size="sm"
              className="gap-2 bg-cyan-600 hover:bg-cyan-700 text-white font-semibold"
            >
              <Play size={13} className={executing ? 'animate-spin' : ''} />
              <span>{executing ? 'Executing...' : 'Run Query'}</span>
            </Button>
          </div>
        </Card>

        {/* Workmode Command Dispatcher */}
        <Card className="border-border/60 bg-card/80 p-6 shadow-sm">
          <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border/50">
            <Send size={18} className="text-primary" />
            <span className="text-sm font-bold text-foreground">
              Direct Inverter Command Dispatcher
            </span>
          </div>

          <form onSubmit={handleDispatchControl} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Target Inverter Hardware SN
              </label>
              <input
                type="text"
                disabled
                value="2209X891104 (SUN-120K-SG01HP3-EU-AM2)"
                className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground font-mono text-xs cursor-not-allowed"
              />
            </div>

            <div>
              <label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground block mb-1">
                Operating Workmode
              </label>
              <select
                value={selectedMode}
                onChange={(e: any) => setSelectedMode(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-muted/40 border border-border/60 text-foreground text-xs focus:outline-none focus:border-primary cursor-pointer font-sans"
              >
                <option value="PEAK_SHAVING">PEAK_SHAVING (Optimizes TOU Arbitrage)</option>
                <option value="BATTERY_FIRST">BATTERY_FIRST (Prioritize ESS Reserve)</option>
                <option value="LOAD_FIRST">LOAD_FIRST (Maximize Self-Consumption)</option>
                <option value="SELLING_FIRST">SELLING_FIRST (Grid Feed-in Priority)</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/50">
              <div>
                <span className="text-xs font-bold text-foreground block">
                  Force Grid Charging
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Allow grid power to top off battery pack during off-peak hours
                </span>
              </div>
              <input
                type="checkbox"
                checked={gridCharge}
                onChange={(e) => setGridCharge(e.target.checked)}
                className="h-4 w-4 accent-primary cursor-pointer rounded"
              />
            </div>

            {dispatchStatus && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  dispatchStatus.success
                    ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/20'
                    : 'bg-destructive/15 text-destructive border border-destructive/20'
                }`}
              >
                {dispatchStatus.success ? <Check size={15} /> : <AlertCircle size={15} />}
                <span>{dispatchStatus.message}</span>
              </div>
            )}

            {isAdmin ? (
              <Button
                type="submit"
                disabled={dispatching}
                className="mt-2 bg-primary text-primary-foreground font-semibold gap-2"
              >
                <Send size={14} className={dispatching ? 'animate-spin' : ''} />
                <span>{dispatching ? 'Dispatching...' : 'Transmit Inverter Control Signal'}</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setShowAuthModal(true)}
                variant="outline"
                className="mt-2 border-amber-500/30 text-amber-500 hover:bg-amber-500/10 font-semibold gap-2"
              >
                <Lock size={14} />
                <span>Restricted to Admin (Click to Unlock)</span>
              </Button>
            )}
          </form>
        </Card>
      </div>

      {/* Response Terminal */}
      {responseOutput && (
        <Card className="border-border/60 bg-card/80 p-5 shadow-xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
            <span className="text-xs font-bold font-mono text-emerald-500">
              HTTP 200 OK — Telemetry Response Payload
            </span>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setResponseOutput(null)}
              className="text-xs"
            >
              Clear
            </Button>
          </div>
          <pre className="p-3 bg-muted/40 border border-border/50 rounded-xl text-xs font-mono text-foreground overflow-x-auto max-h-72">
            {responseOutput}
          </pre>
        </Card>
      )}
    </div>
  );
}
