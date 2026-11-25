import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  Shield,
  ShieldCheck,
  Database,
  Cpu,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  Send,
  Layers,
  RefreshCw,
  FileText,
  Zap,
  ChevronDown,
  ChevronUp,
  Server,
  Clock,
  Lock,
  LogIn,
} from 'lucide-react';
import AnimatedCounter from './AnimatedCounter';
import { useAuth } from '../context/AuthContext';

/**
 * Wraps each LangGraph pipeline node with an animated rotating conic-gradient
 * border beam and pulsing live indicator ring while `isRunning` is true.
 */
function PipelineNodeCard({ isRunning, containerClassName, innerClassName, isDark, children }) {
  return (
    <div
      className={`relative rounded-xl p-[1.5px] overflow-hidden transition-all duration-300 ${
        isRunning
          ? isDark
            ? 'shadow-[0_0_20px_rgba(16,185,129,0.28)]'
            : 'shadow-[0_0_16px_rgba(16,185,129,0.22)]'
          : ''
      } ${containerClassName}`}
    >
      {isRunning && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-[-120%] animate-border-beam"
          style={{
            background: isDark
              ? 'conic-gradient(from 0deg, transparent 0deg 255deg, #10b981 295deg, #06b6d4 330deg, #3b82f6 360deg)'
              : 'conic-gradient(from 0deg, transparent 0deg 250deg, #059669 295deg, #0284c7 335deg, #10b981 360deg)',
          }}
        />
      )}
      <div
        className={`relative z-10 rounded-[10.5px] p-3 transition-colors duration-300 ${innerClassName}`}
      >
        {children}
      </div>
    </div>
  );
}

function LivePulseRing() {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0" title="Executing live node">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald shadow-[0_0_8px_rgba(16,185,129,0.85)]" />
    </span>
  );
}

export default function RetrievalInspector({
  activeStages,
  retrievedChunks = [],
  intent = '',
  onSupervisorResume,
  isResuming = false,
  theme = 'dark',
  telemetry = null,
  onOpenAuthModal,
}) {
  const { user, isSupervisor, loginAsDemo } = useAuth();
  const [overrideText, setOverrideText] = useState('');
  const [expandedChunkIdx, setExpandedChunkIdx] = useState(0);
  const [demoSigningIn, setDemoSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const isDark = theme === 'dark';
  const isPaused = activeStages?.hitl?.isPaused;

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const handleDemoSupervisorLogin = async () => {
    if (demoSigningIn || cooldownSeconds > 0) return;
    setDemoSigningIn(true);
    setAuthError('');
    try {
      await loginAsDemo('supervisor');
    } catch (err) {
      if (err?.status === 429) {
        setCooldownSeconds(Number(err.retryAfter) > 0 ? Number(err.retryAfter) : 60);
      }
      setAuthError(err?.detail || err?.message || 'Unable to sign in as Demo Supervisor.');
    } finally {
      setDemoSigningIn(false);
    }
  };

  const handleResumeSubmit = (e) => {
    e.preventDefault();
    if (!isSupervisor || !overrideText.trim() || isResuming) return;
    if (onSupervisorResume) {
      onSupervisorResume(activeStages?.hitl?.threadId, overrideText);
      setOverrideText('');
    }
  };

  const toggleChunkExpand = (idx) => {
    setExpandedChunkIdx((prev) => (prev === idx ? -1 : idx));
  };

  const getScoreBadgeStyle = (score) => {
    if (score >= 0.8) {
      return isDark
        ? 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
    if (score >= 0.5) {
      return isDark
        ? 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30'
        : 'bg-cyan-50 text-cyan-700 border-cyan-200';
    }
    return isDark
      ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      : 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const guardrailRunning = activeStages?.guardrail?.status === 'running';
  const cacheRunning = activeStages?.cache?.status === 'running';
  const retrievalRunning = activeStages?.retrieval?.status === 'running';
  const cragRunning = activeStages?.crag?.status === 'running';

  const latencyPillClass = isDark
    ? 'bg-primary/10 text-primary-light border-primary/20'
    : 'bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold';

  return (
    <motion.aside
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.55, ease: 'easeOut' }}
      className={`w-80 border-r flex flex-col z-20 h-screen overflow-hidden backdrop-blur-md transition-colors ${
        isDark
          ? 'bg-[#090D18]/85 border-[#1E293B] text-slate-100'
          : 'bg-white/80 border-emerald-200/75 text-slate-900 shadow-sm'
      }`}
    >
      {/* Header */}
      <div
        className={`p-5 border-b flex items-center justify-between backdrop-blur-md ${
          isDark
            ? 'border-[#1E293B] bg-[#0F1629]/60'
            : 'border-emerald-200/70 bg-emerald-50/45'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`w-8 h-8 rounded-lg flex items-center justify-center border ${
              isDark
                ? 'bg-accent-emerald/15 border-accent-emerald/30'
                : 'bg-emerald-100/80 border-emerald-200'
            }`}
          >
            <Activity className="text-accent-emerald w-4 h-4" />
          </div>
          <div>
            <h2
              className={`text-xs font-bold uppercase tracking-widest ${
                isDark ? 'text-slate-100' : 'text-slate-900'
              }`}
            >
              Retrieval Inspector
            </h2>
            <p className={`text-[10px] font-mono ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              LangGraph Live Telemetry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-emerald opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-accent-emerald" />
          </span>
          <span
            className={`text-[10px] font-mono font-semibold ${
              isDark ? 'text-emerald-400' : 'text-emerald-700'
            }`}
          >
            LIVE
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
        {/* Pipeline Execution Node Badges */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest px-0.5">
            <span
              className={`flex items-center gap-1.5 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              <Layers className="w-3 h-3 text-accent-emerald" />
              Pipeline Node Tracing
            </span>
            <span className={`font-mono text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              4 NODES
            </span>
          </div>

          <div className="space-y-2">
            {/* 1. Guardrail & Routing Node */}
            <PipelineNodeCard
              isDark={isDark}
              isRunning={guardrailRunning}
              containerClassName={
                guardrailRunning
                  ? 'bg-emerald-500/20'
                  : activeStages?.guardrail?.status === 'flagged'
                  ? isDark
                    ? 'bg-red-500/35'
                    : 'bg-red-300'
                  : activeStages?.guardrail?.status === 'completed'
                  ? isDark
                    ? 'bg-[#1E293B]'
                    : 'bg-emerald-200/80'
                  : isDark
                  ? 'bg-white/10 opacity-65'
                  : 'bg-emerald-200/60 opacity-70'
              }
              innerClassName={
                guardrailRunning
                  ? isDark
                    ? 'bg-[#0B1120]/95'
                    : 'bg-white/95'
                  : activeStages?.guardrail?.status === 'flagged'
                  ? isDark
                    ? 'bg-red-950/50'
                    : 'bg-red-50/95'
                  : activeStages?.guardrail?.status === 'completed'
                  ? isDark
                    ? 'bg-[#0F1629]/85 backdrop-blur-md'
                    : 'bg-white/90 backdrop-blur-md'
                  : isDark
                  ? 'bg-[#0F1629]/55'
                  : 'bg-white/70'
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {guardrailRunning ? (
                    <LivePulseRing />
                  ) : (
                    <Shield className="w-3.5 h-3.5 text-primary-light" />
                  )}
                  Guardrail & Routing
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${latencyPillClass}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <AnimatedCounter
                      value={activeStages?.guardrail?.latency ?? 142}
                      suffix="ms"
                    />
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                      activeStages?.guardrail?.classification === 'prompt_injection'
                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                        : activeStages?.guardrail?.classification === 'escalation_hitl'
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        : isDark
                        ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    }`}
                  >
                    {activeStages?.guardrail?.classification || (guardrailRunning ? 'RUNNING' : 'IDLE')}
                  </span>
                </div>
              </div>
              {activeStages?.guardrail?.pii_redacted && (
                <div
                  className={`mt-1.5 flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border ${
                    isDark
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-amber-700 bg-amber-50 border-amber-200'
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" /> PII Auto-Redacted
                </div>
              )}
            </PipelineNodeCard>

            {/* 2. Semantic Cache Node */}
            <PipelineNodeCard
              isDark={isDark}
              isRunning={cacheRunning}
              containerClassName={
                cacheRunning
                  ? 'bg-emerald-500/20'
                  : activeStages?.cache?.status === 'hit'
                  ? isDark
                    ? 'bg-accent-emerald/45 shadow-sm shadow-accent-emerald/15'
                    : 'bg-emerald-300 shadow-xs'
                  : activeStages?.cache?.status === 'miss'
                  ? isDark
                    ? 'bg-[#1E293B]'
                    : 'bg-emerald-200/80'
                  : isDark
                  ? 'bg-white/10 opacity-65'
                  : 'bg-emerald-200/60 opacity-70'
              }
              innerClassName={
                cacheRunning
                  ? isDark
                    ? 'bg-[#0B1120]/95'
                    : 'bg-white/95'
                  : activeStages?.cache?.status === 'hit'
                  ? isDark
                    ? 'bg-emerald-950/45 backdrop-blur-md'
                    : 'bg-emerald-50/95 backdrop-blur-md'
                  : activeStages?.cache?.status === 'miss'
                  ? isDark
                    ? 'bg-[#0F1629]/85 backdrop-blur-md'
                    : 'bg-white/90 backdrop-blur-md'
                  : isDark
                  ? 'bg-[#0F1629]/55'
                  : 'bg-white/70'
              }
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {cacheRunning ? (
                    <LivePulseRing />
                  ) : (
                    <Zap
                      className={`w-3.5 h-3.5 ${
                        activeStages?.cache?.status === 'hit'
                          ? 'text-accent-emerald animate-pulse'
                          : 'text-amber-500'
                      }`}
                    />
                  )}
                  Semantic Cache
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${latencyPillClass}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <AnimatedCounter
                      value={activeStages?.cache?.latency ?? 18}
                      suffix="ms"
                    />
                  </span>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                      activeStages?.cache?.status === 'hit'
                        ? isDark
                          ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : activeStages?.cache?.status === 'miss'
                        ? isDark
                          ? 'bg-white/10 text-slate-300 border border-white/10'
                          : 'bg-slate-100 text-slate-600 border border-slate-200'
                        : cacheRunning
                        ? isDark
                          ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/35'
                          : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : isDark
                        ? 'bg-white/5 text-slate-500 border border-white/5'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {activeStages?.cache?.status === 'hit'
                      ? `HIT (${Math.round((activeStages?.cache?.similarity || 0.94) * 100)}%)`
                      : activeStages?.cache?.status === 'miss'
                      ? 'MISS'
                      : cacheRunning
                      ? 'LOOKUP'
                      : 'IDLE'}
                  </span>
                </div>
              </div>
              {activeStages?.cache?.status === 'hit' && (
                <div
                  className={`mt-1.5 flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border truncate ${
                    isDark
                      ? 'text-accent-emerald bg-accent-emerald/10 border-accent-emerald/20'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  }`}
                  title={`Matched: ${activeStages?.cache?.matchedQuery || ''}`}
                >
                  <CheckCircle className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">Bypassed LLM & Vector Retrieval</span>
                </div>
              )}
            </PipelineNodeCard>

            {/* 3. Hybrid Retrieval Node */}
            <PipelineNodeCard
              isDark={isDark}
              isRunning={retrievalRunning}
              containerClassName={
                retrievalRunning
                  ? 'bg-emerald-500/20'
                  : activeStages?.retrieval?.status === 'completed'
                  ? isDark
                    ? 'bg-[#1E293B]'
                    : 'bg-emerald-200/80'
                  : isDark
                  ? 'bg-white/10 opacity-65'
                  : 'bg-emerald-200/60 opacity-70'
              }
              innerClassName={
                retrievalRunning
                  ? isDark
                    ? 'bg-[#0B1120]/95'
                    : 'bg-white/95'
                  : activeStages?.retrieval?.status === 'completed'
                  ? isDark
                    ? 'bg-[#0F1629]/85 backdrop-blur-md'
                    : 'bg-white/90 backdrop-blur-md'
                  : isDark
                  ? 'bg-[#0F1629]/55'
                  : 'bg-white/70'
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {retrievalRunning ? (
                    <LivePulseRing />
                  ) : (
                    <Database className="w-3.5 h-3.5 text-accent-cyan" />
                  )}
                  Hybrid Retrieve
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${latencyPillClass}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <AnimatedCounter
                      value={activeStages?.retrieval?.latency ?? 185}
                      suffix="ms"
                    />
                  </span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                      isDark
                        ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/25'
                        : 'bg-cyan-50 text-cyan-700 border-cyan-200 font-semibold'
                    }`}
                  >
                    {retrievedChunks.length > 0 ? `${retrievedChunks.length} Chunks` : 'Dense + BM25'}
                  </span>
                </div>
              </div>
            </PipelineNodeCard>

            {/* 4. CRAG Document Relevance Grader Node */}
            <PipelineNodeCard
              isDark={isDark}
              isRunning={cragRunning}
              containerClassName={
                cragRunning
                  ? 'bg-emerald-500/20'
                  : activeStages?.crag?.status === 'relevant'
                  ? isDark
                    ? 'bg-accent-emerald/35'
                    : 'bg-emerald-300'
                  : activeStages?.crag?.status === 'irrelevant'
                  ? isDark
                    ? 'bg-amber-500/35'
                    : 'bg-amber-300'
                  : isDark
                  ? 'bg-white/10 opacity-65'
                  : 'bg-emerald-200/60 opacity-70'
              }
              innerClassName={
                cragRunning
                  ? isDark
                    ? 'bg-[#0B1120]/95'
                    : 'bg-white/95'
                  : activeStages?.crag?.status === 'relevant'
                  ? isDark
                    ? 'bg-emerald-950/35 backdrop-blur-md'
                    : 'bg-emerald-50/95 backdrop-blur-md'
                  : activeStages?.crag?.status === 'irrelevant'
                  ? isDark
                    ? 'bg-amber-950/35 backdrop-blur-md'
                    : 'bg-amber-50/95 backdrop-blur-md'
                  : isDark
                  ? 'bg-[#0F1629]/55'
                  : 'bg-white/70'
              }
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[11px] font-bold flex items-center gap-1.5 ${
                    isDark ? 'text-slate-100' : 'text-slate-800'
                  }`}
                >
                  {cragRunning ? (
                    <LivePulseRing />
                  ) : (
                    <Cpu className="w-3.5 h-3.5 text-accent-purple" />
                  )}
                  CRAG Document Grader
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${latencyPillClass}`}
                  >
                    <Clock className="w-2.5 h-2.5" />
                    <AnimatedCounter
                      value={activeStages?.crag?.latency ?? 210}
                      suffix="ms"
                    />
                  </span>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${
                      activeStages?.crag?.is_relevant === true
                        ? isDark
                          ? 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                        : activeStages?.crag?.is_relevant === false
                        ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                        : cragRunning
                        ? isDark
                          ? 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/35'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : isDark
                        ? 'bg-white/5 text-slate-400 border-white/10'
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}
                  >
                    {activeStages?.crag?.is_relevant === true
                      ? `Pass (${Math.round((activeStages?.crag?.score || 1.0) * 100)}%)`
                      : activeStages?.crag?.is_relevant === false
                      ? `Retry #${activeStages?.crag?.retry_count || 1}`
                      : cragRunning
                      ? 'Grading'
                      : 'Awaiting'}
                  </span>
                </div>
              </div>
            </PipelineNodeCard>
          </div>
        </div>

        {/* INLINE HUMAN AGENT OVERRIDE CARD (HITL) */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -6 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              className={`p-4 rounded-2xl border shadow-lg space-y-3 backdrop-blur-md ${
                isDark
                  ? 'bg-gradient-to-b from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-amber-500/5'
                  : 'bg-amber-50/90 border-amber-300 shadow-amber-500/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div
                  className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                    isDark ? 'text-amber-400' : 'text-amber-800'
                  }`}
                >
                  <UserCheck className="w-4 h-4 animate-pulse" />
                  <span>Human Override</span>
                </div>
                <span
                  className={`text-[9px] font-mono px-2 py-0.5 rounded-full border animate-pulse ${
                    isDark
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-amber-200 text-amber-900 border-amber-300'
                  }`}
                >
                  HITL PAUSED
                </span>
              </div>

              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {activeStages?.hitl?.reason ||
                  'Pipeline interrupted before human_review_node. Supervisor input required to resume.'}
              </p>

              {isSupervisor ? (
                <form onSubmit={handleResumeSubmit} className="space-y-2">
                  <textarea
                    rows={3}
                    value={overrideText}
                    onChange={(e) => setOverrideText(e.target.value)}
                    placeholder="Enter supervisor override or instructions..."
                    className={`w-full border rounded-xl p-2.5 text-xs focus:outline-none focus:ring-1 resize-none font-medium ${
                      isDark
                        ? 'bg-[#090D16] border-amber-500/30 text-slate-100 placeholder:text-slate-500 focus:border-amber-500 focus:ring-amber-500/30'
                        : 'bg-white border-amber-300 text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:ring-amber-400'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={isResuming || !overrideText.trim()}
                    className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.99] text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none shadow-sm"
                  >
                    {isResuming ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Resuming Thread...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Dispatch Override</span>
                      </>
                    )}
                  </button>
                </form>
              ) : (
                <div
                  className={`p-3 rounded-xl border space-y-2.5 ${
                    isDark
                      ? 'bg-[#090D16]/85 border-amber-500/25'
                      : 'bg-white/90 border-amber-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    <Lock className="w-3.5 h-3.5 flex-shrink-0" />
                    <span>Supervisor Clearance Required</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                    {user
                      ? `Signed in as ${user.full_name || user.email} (ANALYST). Only Supervisor accounts can dispatch HITL overrides.`
                      : 'Guest Mode active. Sign in as a Supervisor to approve and resume escalated conversations.'}
                  </p>

                  {cooldownSeconds > 0 && (
                    <div className="text-[10px] font-mono font-semibold text-red-400">
                      Security cooldown active — retry in {cooldownSeconds}s
                    </div>
                  )}

                  {authError && cooldownSeconds === 0 && (
                    <div className="text-[10px] font-medium text-red-400">{authError}</div>
                  )}

                  <div className="space-y-1.5">
                    <button
                      type="button"
                      onClick={handleDemoSupervisorLogin}
                      disabled={demoSigningIn || cooldownSeconds > 0}
                      className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.99] text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all disabled:opacity-45 disabled:pointer-events-none shadow-sm"
                    >
                      {demoSigningIn ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Sign In as Demo Supervisor</span>
                    </button>

                    {onOpenAuthModal && (
                      <button
                        type="button"
                        onClick={onOpenAuthModal}
                        className={`w-full py-1.5 rounded-xl border text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isDark
                            ? 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-300'
                            : 'bg-amber-50 hover:bg-amber-100 border-amber-200 text-amber-900'
                        }`}
                      >
                        <LogIn className="w-3 h-3" />
                        <span>Sign In with Credentials</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top-4 FlashRank Reranked Chunks OR Active Engine Topology */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest px-0.5">
            <span
              className={`flex items-center gap-1.5 ${
                isDark ? 'text-slate-400' : 'text-slate-600'
              }`}
            >
              <Database className="w-3 h-3 text-accent-emerald" />
              <span>Top-4 FlashRank Chunks</span>
            </span>
            <span
              className={`text-[9px] px-2 py-0.5 rounded-full border font-mono ${
                isDark
                  ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold'
              }`}
            >
              {retrievedChunks.length} / 4 Active
            </span>
          </div>

          <div className="space-y-2.5">
            {retrievedChunks.length > 0 ? (
              <AnimatePresence>
                {retrievedChunks.map((chunk, idx) => {
                  const score = chunk.score || 0;
                  const isExpanded = expandedChunkIdx === idx;
                  const scorePercent = Math.min(Math.max(Math.round(score * 100), 5), 100);

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ delay: idx * 0.05 }}
                      className={`p-3 rounded-xl border backdrop-blur-md transition-all ${
                        isDark
                          ? 'bg-[#0F1629]/80 hover:bg-[#161F36]/90 border-[#1E293B]'
                          : 'bg-white/85 hover:bg-emerald-50/40 border-emerald-200/75 shadow-xs'
                      }`}
                    >
                      {/* Card Header */}
                      <div
                        onClick={() => toggleChunkExpand(idx)}
                        className="cursor-pointer select-none space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-primary-light flex-shrink-0" />
                            <span
                              className={`text-[11px] font-mono font-bold truncate max-w-[130px] ${
                                isDark ? 'text-slate-100' : 'text-slate-800'
                              }`}
                              title={chunk.source || `CHUNK_${idx + 1}`}
                            >
                              {chunk.source || `CHUNK_${idx + 1}`}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getScoreBadgeStyle(
                                score
                              )}`}
                            >
                              {score.toFixed(4)}
                            </span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            )}
                          </div>
                        </div>

                        {/* Relevance Score Bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                            <span>Dense + Sparse RRF</span>
                            <span>{scorePercent}% Match</span>
                          </div>
                          <div
                            className={`w-full h-1.5 rounded-full overflow-hidden ${
                              isDark ? 'bg-slate-800' : 'bg-emerald-100'
                            }`}
                          >
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                score >= 0.8
                                  ? 'bg-accent-emerald'
                                  : score >= 0.5
                                  ? 'bg-accent-cyan'
                                  : 'bg-amber-500'
                              }`}
                              style={{ width: `${scorePercent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Content Preview / Full */}
                      <div className="mt-2 pt-2 border-t border-dashed border-slate-700/30">
                        <p
                          className={`text-xs leading-relaxed ${
                            isDark ? 'text-slate-300' : 'text-slate-600'
                          } ${isExpanded ? '' : 'line-clamp-2'}`}
                        >
                          {chunk.content}
                        </p>
                        {isExpanded && chunk.metadata && (
                          <div className="mt-2 pt-1.5 border-t border-slate-700/20 flex flex-wrap gap-1.5 text-[9px] font-mono text-slate-500">
                            {chunk.metadata.source && (
                              <span
                                className={`px-1.5 py-0.5 rounded border ${
                                  isDark
                                    ? 'bg-slate-800/50 border-slate-700/40 text-slate-300'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                }`}
                              >
                                src: {chunk.metadata.source}
                              </span>
                            )}
                            <span
                              className={`px-1.5 py-0.5 rounded border ${
                                isDark
                                  ? 'bg-slate-800/50 border-slate-700/40 text-slate-300'
                                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                              }`}
                            >
                              reranker: FlashRank
                            </span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            ) : (
              /* ACTIVE ENGINE TOPOLOGY CARD */
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-3.5 rounded-xl border space-y-3 backdrop-blur-md ${
                  isDark
                    ? 'bg-[#0F1629]/80 border-[#1E293B]'
                    : 'bg-white/85 border-emerald-200/75 shadow-xs'
                }`}
              >
                <div
                  className={`flex items-center justify-between pb-2 border-b ${
                    isDark ? 'border-slate-700/40' : 'border-emerald-100'
                  }`}
                >
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      isDark ? 'text-slate-200' : 'text-slate-800'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5 text-accent-emerald" />
                    Active Engine Topology
                  </span>
                  <span
                    className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                      isDark
                        ? 'bg-accent-emerald/15 text-accent-emerald'
                        : 'bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200'
                    }`}
                  >
                    v2.0 PRO
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Embedding Model
                    </span>
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      {telemetry?.embedding_model || 'all-MiniLM-L6-v2'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Cross-Encoder
                    </span>
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      ms-marco-MiniLM-L-12
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      CRAG Policy
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-accent-emerald">
                      max_retries = 2
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Langfuse Tracing
                    </span>
                    <span className="font-mono text-[10px] font-semibold flex items-center gap-1 text-accent-cyan">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                      Active (v2 Session)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      Hybrid Strategy
                    </span>
                    <span
                      className={`font-mono text-[10px] font-semibold ${
                        isDark ? 'text-slate-300' : 'text-slate-700'
                      }`}
                    >
                      Dense + BM25 (RRF)
                    </span>
                  </div>
                </div>

                <div
                  className={`pt-2 border-t text-[10px] italic text-center ${
                    isDark
                      ? 'border-slate-700/40 text-slate-500'
                      : 'border-emerald-100 text-slate-500'
                  }`}
                >
                  Awaiting query execution to stream live chunks...
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Detected Intent Footer */}
      <div
        className={`p-4 border-t backdrop-blur-md transition-colors ${
          isDark
            ? 'border-[#1E293B] bg-[#090D18]/85'
            : 'border-emerald-200/75 bg-emerald-50/45'
        }`}
      >
        <div
          className={`text-[10px] uppercase font-bold mb-1.5 tracking-widest ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          Active Thread Intent
        </div>
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
            intent === 'escalation_hitl' || isPaused
              ? isDark
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-amber-50 text-amber-800 border-amber-200'
              : intent === 'prompt_injection'
              ? isDark
                ? 'bg-red-500/10 text-red-400 border-red-500/20'
                : 'bg-red-50 text-red-800 border-red-200'
              : intent
              ? isDark
                ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : isDark
              ? 'bg-white/5 text-slate-500 border-white/5'
              : 'bg-white/90 text-slate-500 border-emerald-200/80'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              intent === 'escalation_hitl' || isPaused
                ? 'bg-amber-400 animate-ping'
                : intent === 'prompt_injection'
                ? 'bg-red-400'
                : intent
                ? 'bg-accent-emerald'
                : 'bg-slate-400'
            }`}
          />
          <span className="font-mono text-[11px] truncate">
            {intent || 'Listening for triggers...'}
          </span>
        </div>
      </div>
    </motion.aside>
  );
}
