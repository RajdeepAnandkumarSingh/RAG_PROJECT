import React from 'react';
import {
  Shield,
  ShieldAlert,
  Zap,
  Database,
  Layers,
  Cpu,
  Sparkles,
  CheckCircle2,
  PauseCircle,
  GitBranch,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';

function RunningRing() {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden="true">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-80" />
      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.9)]" />
    </span>
  );
}

function Connector({ active, variant = 'emerald', isDark }) {
  const colorClass = active
    ? variant === 'crimson'
      ? 'text-red-400'
      : variant === 'amber'
      ? 'text-amber-400'
      : variant === 'blue'
      ? 'text-blue-400'
      : variant === 'cyan'
      ? 'text-cyan-400'
      : 'text-emerald-400'
    : isDark
    ? 'text-slate-600'
    : 'text-slate-400';

  return <ChevronRight className={`w-3 h-3 flex-shrink-0 transition-colors ${colorClass}`} />;
}

function LatencyTag({ ms, isDark, tone = 'emerald' }) {
  if (ms === null || ms === undefined) return null;

  const toneClass =
    tone === 'cyan'
      ? isDark
        ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30'
        : 'bg-cyan-100 text-cyan-800 border-cyan-300'
      : tone === 'crimson'
      ? isDark
        ? 'bg-red-500/20 text-red-200 border-red-400/30'
        : 'bg-red-100 text-red-800 border-red-300'
      : tone === 'blue'
      ? isDark
        ? 'bg-blue-500/20 text-blue-200 border-blue-400/30'
        : 'bg-blue-100 text-blue-800 border-blue-300'
      : tone === 'amber'
      ? isDark
        ? 'bg-amber-500/20 text-amber-200 border-amber-400/30'
        : 'bg-amber-100 text-amber-800 border-amber-300'
      : isDark
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : 'bg-emerald-100/80 text-emerald-800 border-emerald-200';

  return (
    <span className={`px-1 py-0.2 rounded border text-[9px] font-mono leading-tight ${toneClass}`}>
      {ms}ms
    </span>
  );
}

export default function LivePipelineStrip({
  activeStages,
  intent = '',
  loading = false,
  retrievedChunks = [],
  theme = 'dark',
  onOpenArchitecture,
}) {
  const isDark = theme === 'dark';

  const cache = activeStages?.cache || {};
  const guardrail = activeStages?.guardrail || {};
  const retrieval = activeStages?.retrieval || {};
  const flashrank = activeStages?.flashrank || {};
  const crag = activeStages?.crag || {};
  const generator = activeStages?.generator || {};
  const safeRefusal = activeStages?.safeRefusal || {};
  const orderTool = activeStages?.orderTool || {};
  const hitl = activeStages?.hitl || {};

  const isBranch1 =
    intent === 'prompt_injection' ||
    guardrail.status === 'flagged' ||
    Boolean(safeRefusal.triggered);
  const isBranch2 =
    intent === 'escalation_hitl' ||
    intent === 'human_review' ||
    Boolean(hitl.isPaused) ||
    Boolean(hitl.resolved);
  const isBranch3 =
    intent === 'live_order_tool' || Boolean(orderTool.triggered);
  const isCacheHit = cache.status === 'hit' || Boolean(cache.hit);
  const isEarlyExit = isBranch1 || isBranch2 || isBranch3;

  // Derive per-node visual states
  const guardrailRunning =
    guardrail.status === 'running' ||
    (loading && guardrail.status === 'idle' && cache.status === 'miss');
  const guardrailDone = guardrail.status === 'completed';

  const cacheRunning = cache.status === 'running';
  const cacheDone = cache.status === 'miss' || isCacheHit;

  const retrievalRunning = retrieval.status === 'running';
  const retrievalDone = retrieval.status === 'completed' && !isCacheHit && !isEarlyExit;

  const flashrankRunning =
    flashrank.status === 'running' || (retrievalRunning && !isCacheHit);
  const flashrankDone =
    (flashrank.status === 'completed' || retrievalDone) && !isCacheHit && !isEarlyExit;

  const cragRunning = crag.status === 'running';
  const cragRelevant = crag.status === 'relevant' && !isCacheHit && !isEarlyExit;
  const cragRetry = crag.status === 'irrelevant' && !isCacheHit && !isEarlyExit;

  const generatorRunning = generator.status === 'running';
  const generatorDone =
    generator.status === 'completed' && !isEarlyExit;

  const baseIdleStyle = isDark
    ? 'bg-[#0B1120]/80 border-[#1E293B] text-slate-400'
    : 'bg-slate-50/90 border-slate-200 text-slate-600';

  const runningStyle = isDark
    ? 'bg-emerald-500/15 border-emerald-400/70 text-emerald-200 ring-2 ring-emerald-500/35 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
    : 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-400/40 shadow-xs';

  const doneStyle = isDark
    ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-200'
    : 'bg-emerald-50/90 border-emerald-300 text-emerald-900';

  const bypassedStyle = isDark
    ? 'bg-[#0B1120]/40 border-[#1E293B]/60 text-slate-500 opacity-55'
    : 'bg-slate-50/60 border-slate-200/70 text-slate-400 opacity-60';

  const cyanStyle = isDark
    ? 'bg-cyan-500/15 border-cyan-400/60 text-cyan-200 shadow-[0_0_12px_rgba(6,182,212,0.22)]'
    : 'bg-cyan-50 border-cyan-400 text-cyan-900 shadow-xs';

  const crimsonStyle = isDark
    ? 'bg-red-500/15 border-red-500/60 text-red-200 shadow-[0_0_12px_rgba(239,68,68,0.25)]'
    : 'bg-red-50 border-red-400 text-red-800 shadow-xs';

  const amberStyle = isDark
    ? 'bg-amber-500/15 border-amber-400/65 text-amber-200 ring-2 ring-amber-500/30 shadow-[0_0_12px_rgba(245,158,11,0.22)]'
    : 'bg-amber-50 border-amber-400 text-amber-900 ring-2 ring-amber-400/30 shadow-xs';

  const blueStyle = isDark
    ? 'bg-blue-500/15 border-blue-400/60 text-blue-200 shadow-[0_0_12px_rgba(59,130,246,0.24)]'
    : 'bg-blue-50 border-blue-400 text-blue-900 shadow-xs';

  const nodePillClass =
    'flex-shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-mono font-semibold transition-all duration-200';

  return (
    <div className="max-w-5xl mx-auto mb-2.5">
      <div
        className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl border backdrop-blur-md transition-colors ${
          isDark
            ? 'bg-[#0F1629]/90 border-[#1E293B] text-slate-200 shadow-sm'
            : 'bg-white/95 border-emerald-200/85 text-slate-800 shadow-xs'
        }`}
      >
        {/* Scrollable Pipeline Node Strip */}
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none min-w-0 py-0.5">
          {/* 1. Guardrail */}
          <div
            title={
              guardrail.classification
                ? `Guardrail Classification: ${guardrail.classification}`
                : 'Guardrail & Intent Router'
            }
            className={`${nodePillClass} ${
              isBranch1
                ? crimsonStyle
                : guardrailRunning
                ? runningStyle
                : guardrailDone
                ? doneStyle
                : baseIdleStyle
            }`}
          >
            {guardrailRunning ? (
              <RunningRing />
            ) : isBranch1 ? (
              <ShieldAlert className="w-3 h-3 text-red-400 flex-shrink-0" />
            ) : guardrailDone ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Shield className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>Guardrail</span>
            {guardrail.pii_redacted && (
              <span
                className={`px-1 rounded text-[8px] font-bold uppercase ${
                  isDark ? 'bg-purple-500/25 text-purple-200' : 'bg-purple-100 text-purple-800'
                }`}
              >
                PII
              </span>
            )}
            <LatencyTag
              ms={guardrail.latency}
              isDark={isDark}
              tone={isBranch1 ? 'crimson' : 'emerald'}
            />
          </div>

          {/* Inline Branch 1 / 2 / 3 Active State Badge */}
          {isBranch1 && (
            <>
              <Connector active variant="crimson" isDark={isDark} />
              <div
                className={`${nodePillClass} ${crimsonStyle}`}
                title="Branch 1 Triggered: Safe Refusal Guardrail"
              >
                <ShieldAlert className="w-3 h-3 text-red-400 flex-shrink-0" />
                <span>safe_refusal</span>
                <span
                  className={`px-1 rounded text-[8px] font-bold uppercase ${
                    isDark ? 'bg-red-500/30 text-red-200' : 'bg-red-200 text-red-900'
                  }`}
                >
                  BLOCKED
                </span>
              </div>
            </>
          )}

          {isBranch2 && (
            <>
              <Connector active variant="amber" isDark={isDark} />
              <div
                className={`${nodePillClass} ${hitl.resolved ? doneStyle : amberStyle}`}
                title={hitl.reason || 'Branch 2 Triggered: Human-in-the-Loop Supervisor Interrupt'}
              >
                {hitl.resolved ? (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                ) : (
                  <PauseCircle className="w-3 h-3 text-amber-400 animate-pulse flex-shrink-0" />
                )}
                <span>human_review_node</span>
                <span
                  className={`px-1 rounded text-[8px] font-bold uppercase ${
                    hitl.resolved
                      ? isDark
                        ? 'bg-emerald-500/25 text-emerald-200'
                        : 'bg-emerald-100 text-emerald-800'
                      : isDark
                      ? 'bg-amber-500/30 text-amber-200'
                      : 'bg-amber-200 text-amber-900'
                  }`}
                >
                  {hitl.resolved ? 'RESUMED' : 'PAUSED'}
                </span>
              </div>
            </>
          )}

          {isBranch3 && (
            <>
              <Connector active variant="blue" isDark={isDark} />
              <div
                className={`${nodePillClass} ${blueStyle}`}
                title="Branch 3 Triggered: SQLite Live Order Lookup"
              >
                {orderTool.status === 'running' ? (
                  <RunningRing />
                ) : (
                  <Database className="w-3 h-3 text-blue-400 flex-shrink-0" />
                )}
                <span>live_order_tool</span>
                <span
                  className={`px-1 rounded text-[8px] font-bold uppercase ${
                    isDark ? 'bg-blue-500/30 text-blue-200' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  SQLite
                </span>
                <LatencyTag ms={orderTool.latency} isDark={isDark} tone="blue" />
              </div>
            </>
          )}

          <Connector active={cacheDone || cacheRunning} variant={isCacheHit ? 'cyan' : 'emerald'} isDark={isDark} />

          {/* 2. Semantic Cache */}
          <div
            title={
              isCacheHit
                ? `Semantic Cache HIT (${Math.round((cache.similarity || 1) * 100)}%)`
                : 'Redis Semantic Cache Lookup'
            }
            className={`${nodePillClass} ${
              isCacheHit
                ? cyanStyle
                : cacheRunning
                ? runningStyle
                : cacheDone
                ? doneStyle
                : isEarlyExit
                ? bypassedStyle
                : baseIdleStyle
            }`}
          >
            {cacheRunning ? (
              <RunningRing />
            ) : isCacheHit ? (
              <Zap className="w-3 h-3 text-cyan-400 flex-shrink-0" />
            ) : cacheDone ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Zap className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>Semantic Cache</span>
            {isCacheHit && (
              <span
                className={`px-1 rounded text-[8px] font-bold uppercase ${
                  isDark ? 'bg-cyan-500/30 text-cyan-100' : 'bg-cyan-100 text-cyan-900'
                }`}
              >
                HIT {Math.round((cache.similarity || 1) * 100)}%
              </span>
            )}
            {cache.status === 'miss' && (
              <span
                className={`px-1 rounded text-[8px] font-semibold uppercase ${
                  isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-200/80 text-slate-700'
                }`}
              >
                MISS
              </span>
            )}
            <LatencyTag
              ms={cache.latency}
              isDark={isDark}
              tone={isCacheHit ? 'cyan' : 'emerald'}
            />
          </div>

          <Connector active={retrievalDone || retrievalRunning} isDark={isDark} />

          {/* 3. Hybrid RRF */}
          <div
            title="ChromaDB Dense + BM25Okapi Sparse Fusion (RRF k=60)"
            className={`${nodePillClass} ${
              isCacheHit || isEarlyExit
                ? bypassedStyle
                : retrievalRunning
                ? runningStyle
                : retrievalDone
                ? doneStyle
                : baseIdleStyle
            }`}
          >
            {retrievalRunning ? (
              <RunningRing />
            ) : retrievalDone ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Layers className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>Hybrid RRF</span>
            <LatencyTag ms={!isCacheHit && !isEarlyExit ? retrieval.latency : null} isDark={isDark} />
          </div>

          <Connector active={flashrankDone || flashrankRunning} isDark={isDark} />

          {/* 4. FlashRank */}
          <div
            title="FlashRank Cross-Encoder Neural Reranker (Top-4)"
            className={`${nodePillClass} ${
              isCacheHit || isEarlyExit
                ? bypassedStyle
                : flashrankRunning
                ? runningStyle
                : flashrankDone
                ? doneStyle
                : baseIdleStyle
            }`}
          >
            {flashrankRunning ? (
              <RunningRing />
            ) : flashrankDone ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Sparkles className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>FlashRank</span>
            {flashrankDone && retrievedChunks.length > 0 && (
              <span
                className={`px-1 rounded text-[8px] font-bold ${
                  isDark ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                Top-{retrievedChunks.length}
              </span>
            )}
            <LatencyTag
              ms={flashrankDone ? flashrank.latency ?? retrieval.latency : null}
              isDark={isDark}
            />
          </div>

          <Connector
            active={cragRelevant || cragRetry || cragRunning}
            variant={cragRetry ? 'amber' : 'emerald'}
            isDark={isDark}
          />

          {/* 5. CRAG Grader */}
          <div
            title="Corrective RAG Document Relevance Grader"
            className={`${nodePillClass} ${
              isCacheHit || isEarlyExit
                ? bypassedStyle
                : cragRunning
                ? runningStyle
                : cragRetry
                ? amberStyle
                : cragRelevant
                ? doneStyle
                : baseIdleStyle
            }`}
          >
            {cragRunning ? (
              <RunningRing />
            ) : cragRetry ? (
              <RotateCcw className="w-3 h-3 text-amber-400 flex-shrink-0" />
            ) : cragRelevant ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Cpu className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>CRAG Grader</span>
            {cragRetry && (
              <span
                className={`px-1 rounded text-[8px] font-bold uppercase ${
                  isDark ? 'bg-amber-500/25 text-amber-200' : 'bg-amber-100 text-amber-800'
                }`}
              >
                Retry #{(crag.retry_count || 0) + 1}
              </span>
            )}
            <LatencyTag
              ms={!isCacheHit && !isEarlyExit ? crag.latency : null}
              isDark={isDark}
              tone={cragRetry ? 'amber' : 'emerald'}
            />
          </div>

          <Connector
            active={generatorDone || generatorRunning}
            variant={isCacheHit ? 'cyan' : 'emerald'}
            isDark={isDark}
          />

          {/* 6. Generator */}
          <div
            title={isCacheHit ? 'Bypassed via Semantic Cache' : 'ChatGroq Answer Generator'}
            className={`${nodePillClass} ${
              isEarlyExit
                ? bypassedStyle
                : isCacheHit && generatorDone
                ? cyanStyle
                : generatorRunning
                ? runningStyle
                : generatorDone
                ? doneStyle
                : baseIdleStyle
            }`}
          >
            {generatorRunning ? (
              <RunningRing />
            ) : isCacheHit && generatorDone ? (
              <Zap className="w-3 h-3 text-cyan-400 flex-shrink-0" />
            ) : generatorDone ? (
              <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
            ) : (
              <Sparkles className="w-3 h-3 opacity-70 flex-shrink-0" />
            )}
            <span>Generator</span>
            {isCacheHit && generatorDone ? (
              <span
                className={`px-1 rounded text-[8px] font-bold uppercase ${
                  isDark ? 'bg-cyan-500/25 text-cyan-100' : 'bg-cyan-100 text-cyan-800'
                }`}
              >
                CACHED
              </span>
            ) : (
              <LatencyTag ms={!isEarlyExit ? generator.latency : null} isDark={isDark} />
            )}
          </div>
        </div>

        {/* Right Side: Live Graph Modal Trigger */}
        <button
          type="button"
          onClick={onOpenArchitecture}
          title="Open Live Interactive LangGraph Node Visualizer"
          className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all active:scale-95 ${
            isDark
              ? 'bg-accent-emerald/15 hover:bg-accent-emerald/25 border-accent-emerald/40 text-emerald-300 hover:text-white'
              : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800 hover:text-emerald-950 shadow-2xs'
          }`}
        >
          {(loading || hitl.isPaused) && (
            <span className="relative flex h-1.5 w-1.5">
              <span
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  hitl.isPaused ? 'bg-amber-400' : 'bg-emerald-400'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  hitl.isPaused ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
              />
            </span>
          )}
          <GitBranch className="w-3.5 h-3.5" />
          <span className="whitespace-nowrap">Live Graph</span>
        </button>
      </div>
    </div>
  );
}
