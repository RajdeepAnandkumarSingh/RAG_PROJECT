import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react';
import {
  X,
  Database,
  Cpu,
  Layers,
  RefreshCw,
  GitBranch,
  Shield,
  ShieldAlert,
  Zap,
  PauseCircle,
  Sparkles,
  Play,
  Flag,
  Send,
  Activity,
  Clock,
  Info,
} from 'lucide-react';

const NODE_CATALOG = {
  start: {
    label: 'START: User Query',
    category: 'ENTRY POINT',
    branch: 'core',
    role: 'Receives the raw user prompt and initializes the thread-scoped LangGraph StateGraph payload.',
  },
  guardrail_and_router: {
    label: 'guardrail_and_router',
    category: 'SECURITY & ROUTING',
    branch: 'core',
    role: 'Scrubs PII (emails, phones, cards) and classifies intent across 4 deterministic branches via Groq router LLM.',
  },
  safe_refusal: {
    label: 'safe_refusal',
    category: 'BRANCH 1 · SECURITY',
    branch: 'branch1',
    role: 'Immediately isolates prompt injection, jailbreak, or exfiltration attempts without touching vector stores or tools.',
  },
  end_refusal: {
    label: 'END (Safe Refusal)',
    category: 'BRANCH 1 · TERMINAL',
    branch: 'branch1',
    role: 'Terminates execution with a policy-compliant defensive refusal response.',
  },
  human_review_node: {
    label: 'human_review_node (INTERRUPT)',
    category: 'BRANCH 2 · HITL PAUSE',
    branch: 'branch2',
    role: 'Halts execution via LangGraph MemorySaver interrupt_before checkpoint when legal threats or high-risk escalations are detected.',
  },
  chat_resume: {
    label: 'POST /api/chat/resume',
    category: 'BRANCH 2 · OVERRIDE',
    branch: 'branch2',
    role: 'Supervisor submits an override message from the Retrieval Inspector to atomically update thread state and resume the graph.',
  },
  end_hitl: {
    label: 'END (Supervisor Resolution)',
    category: 'BRANCH 2 · TERMINAL',
    branch: 'branch2',
    role: 'Completes the escalated thread with the verified supervisor resolution.',
  },
  live_order_tool: {
    label: 'live_order_tool (SQLite SELECT)',
    category: 'BRANCH 3 · SQL TOOL',
    branch: 'branch3',
    role: 'Extracts validated Order IDs and executes non-blocking parameterized SQL SELECT queries against data/nexus_structured.db.',
  },
  end_order: {
    label: 'END (Order Status)',
    category: 'BRANCH 3 · TERMINAL',
    branch: 'branch3',
    role: 'Returns real-time carrier, item, and delivery status grounded directly in SQLite.',
  },
  semantic_cache: {
    label: 'semantic_cache',
    category: 'BRANCH 4 · REDIS CACHE',
    branch: 'branch4',
    role: 'Embeds query with all-MiniLM-L6-v2 (ONNX) and checks Redis cosine similarity (>= 0.92) for sub-15ms cache hits.',
  },
  hybrid_retrieve: {
    label: 'hybrid_retrieve (ChromaDB + BM25)',
    category: 'BRANCH 4 · HYBRID RRF',
    branch: 'branch4',
    role: 'Executes ChromaDB 384-dim dense search + BM25Okapi sparse keyword retrieval fused with Reciprocal Rank Fusion (k=60).',
  },
  flashrank_rerank: {
    label: 'flashrank_rerank',
    category: 'BRANCH 4 · RERANKER',
    branch: 'branch4',
    role: 'Applies ms-marco-MiniLM-L-12-v2 cross-encoder scoring to select the Top-4 highest-precision context chunks.',
  },
  crag_grader: {
    label: 'crag_grader',
    category: 'BRANCH 4 · CRAG',
    branch: 'branch4',
    role: 'Evaluates chunk relevance with structured Pydantic output; passes to generator or triggers query reformulation.',
  },
  query_rewriter: {
    label: 'query_rewriter',
    category: 'BRANCH 4 · SELF-CORRECTION',
    branch: 'branch4',
    role: 'Reformulates ambiguous queries and loops back to hybrid_retrieve (bounded by max_retries = 2).',
  },
  generator: {
    label: 'generator',
    category: 'BRANCH 4 · SYNTHESIS',
    branch: 'branch4',
    role: 'Synthesizes a grounded response using Groq generator LLM strictly constrained to the Top-4 verified chunks.',
  },
  end_rag: {
    label: 'END (Grounded Response)',
    category: 'BRANCH 4 · TERMINAL',
    branch: 'branch4',
    role: 'Delivers the final grounded answer via SSE and asynchronously persists it into Redis Semantic Cache.',
  },
};

function getIconForNode(nodeId) {
  switch (nodeId) {
    case 'start':
      return Play;
    case 'guardrail_and_router':
      return Shield;
    case 'safe_refusal':
      return ShieldAlert;
    case 'human_review_node':
      return PauseCircle;
    case 'chat_resume':
      return Send;
    case 'live_order_tool':
      return Database;
    case 'semantic_cache':
      return Zap;
    case 'hybrid_retrieve':
      return Layers;
    case 'flashrank_rerank':
      return Sparkles;
    case 'crag_grader':
      return Cpu;
    case 'query_rewriter':
      return RefreshCw;
    case 'generator':
      return Sparkles;
    default:
      return Flag;
  }
}

function LangGraphFlowNode({ data, selected }) {
  const {
    nodeId,
    label,
    category,
    status,
    badgeText,
    latency,
    isDark,
    dimmed,
    reverseHandles,
  } = data;

  const Icon = getIconForNode(nodeId);

  const statusStyles = {
    idle: isDark
      ? 'bg-[#0F1629]/95 border-[#1E293B] text-slate-200 hover:border-slate-600'
      : 'bg-white/95 border-slate-300 text-slate-800 hover:border-emerald-400 shadow-xs',
    running: isDark
      ? 'bg-emerald-950/75 border-emerald-400 text-emerald-100 shadow-[0_0_22px_rgba(16,185,129,0.42)] ring-2 ring-emerald-400/40'
      : 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-[0_0_16px_rgba(16,185,129,0.25)] ring-2 ring-emerald-400/40',
    completed: isDark
      ? 'bg-emerald-950/45 border-emerald-500/75 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.22)]'
      : 'bg-emerald-50/90 border-emerald-500 text-emerald-950 shadow-sm',
    hit: isDark
      ? 'bg-cyan-950/60 border-cyan-400 text-cyan-100 shadow-[0_0_20px_rgba(6,182,212,0.35)]'
      : 'bg-cyan-50 border-cyan-500 text-cyan-950 shadow-sm',
    flagged: isDark
      ? 'bg-red-950/60 border-red-500 text-red-100 shadow-[0_0_20px_rgba(239,68,68,0.38)]'
      : 'bg-red-50 border-red-500 text-red-950 shadow-sm',
    paused: isDark
      ? 'bg-amber-950/60 border-amber-400 text-amber-100 shadow-[0_0_20px_rgba(245,158,11,0.38)] ring-2 ring-amber-400/35'
      : 'bg-amber-50 border-amber-500 text-amber-950 shadow-sm ring-2 ring-amber-400/35',
    sql: isDark
      ? 'bg-blue-950/60 border-blue-400 text-blue-100 shadow-[0_0_20px_rgba(59,130,246,0.35)]'
      : 'bg-blue-50 border-blue-500 text-blue-950 shadow-sm',
    retry: isDark
      ? 'bg-amber-950/50 border-amber-400/80 text-amber-100 shadow-[0_0_16px_rgba(245,158,11,0.28)]'
      : 'bg-amber-50 border-amber-500 text-amber-950 shadow-sm',
  };

  const badgeColors = {
    idle: isDark
      ? 'bg-slate-800/80 text-slate-400 border-slate-700'
      : 'bg-slate-100 text-slate-600 border-slate-200',
    running: isDark
      ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300',
    completed: isDark
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
      : 'bg-emerald-100 text-emerald-800 border-emerald-300',
    hit: isDark
      ? 'bg-cyan-500/25 text-cyan-200 border-cyan-400/50'
      : 'bg-cyan-100 text-cyan-800 border-cyan-300',
    flagged: isDark
      ? 'bg-red-500/25 text-red-200 border-red-400/50'
      : 'bg-red-100 text-red-800 border-red-300',
    paused: isDark
      ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
      : 'bg-amber-100 text-amber-900 border-amber-300',
    sql: isDark
      ? 'bg-blue-500/25 text-blue-200 border-blue-400/50'
      : 'bg-blue-100 text-blue-800 border-blue-300',
    retry: isDark
      ? 'bg-amber-500/25 text-amber-200 border-amber-400/50'
      : 'bg-amber-100 text-amber-800 border-amber-300',
  };

  const handleClass = `!w-2 !h-2 !border-2 ${
    isDark ? '!bg-slate-900 !border-slate-500' : '!bg-white !border-slate-400'
  }`;

  return (
    <div
      className={`w-[210px] rounded-xl border-2 px-3 py-2.5 transition-all duration-200 cursor-pointer select-none backdrop-blur-md ${
        statusStyles[status] || statusStyles.idle
      } ${selected ? (isDark ? 'ring-2 ring-white/80' : 'ring-2 ring-slate-900/70') : ''} ${
        dimmed ? 'opacity-40' : 'opacity-100'
      }`}
    >
      <Handle
        type="target"
        position={reverseHandles ? Position.Right : Position.Left}
        className={handleClass}
      />
      <Handle
        type="source"
        position={reverseHandles ? Position.Left : Position.Right}
        className={handleClass}
      />
      <Handle id="top-source" type="source" position={Position.Top} className={handleClass} />
      <Handle id="top-target" type="target" position={Position.Top} className={handleClass} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} className={handleClass} />
      <Handle id="bottom-target" type="target" position={Position.Bottom} className={handleClass} />

      <div className="flex items-center justify-between gap-1.5 mb-1">
        <span
          className={`text-[8.5px] font-mono font-bold uppercase tracking-wider truncate ${
            isDark ? 'text-slate-400' : 'text-slate-500'
          }`}
        >
          {category}
        </span>
        {status === 'running' && (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-3.5 h-3.5 flex-shrink-0 opacity-90" />
        <span className="text-[11px] font-mono font-bold leading-snug break-words">
          {label}
        </span>
      </div>

      <div className="flex items-center justify-between gap-1.5">
        <span
          className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded border ${
            badgeColors[status] || badgeColors.idle
          }`}
        >
          {badgeText || status.toUpperCase()}
        </span>
        {latency !== null && latency !== undefined && (
          <span
            className={`text-[9px] font-mono flex items-center gap-0.5 ${
              isDark ? 'text-slate-300' : 'text-slate-700 font-semibold'
            }`}
          >
            <Clock className="w-2.5 h-2.5" />
            {latency}ms
          </span>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { langGraphNode: LangGraphFlowNode };

export default function PipelineArchitectureModal({
  isOpen,
  onClose,
  theme = 'dark',
  activeStages = null,
  intent = '',
  retrievedChunks = [],
  telemetry = null,
  threadId = '',
  latestQuery = '',
}) {
  const [branchFilter, setBranchFilter] = useState('live');
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [rfInstance, setRfInstance] = useState(null);
  const isDark = theme === 'dark';

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Refit canvas cleanly when modal opens or filter changes
  useEffect(() => {
    if (isOpen && rfInstance) {
      const timer = setTimeout(() => {
        rfInstance.fitView({ padding: 0.14, duration: 280 });
      }, 90);
      return () => clearTimeout(timer);
    }
  }, [isOpen, branchFilter, selectedNodeId, rfInstance]);

  const cache = activeStages?.cache || {};
  const guardrail = activeStages?.guardrail || {};
  const retrieval = activeStages?.retrieval || {};
  const flashrank = activeStages?.flashrank || {};
  const crag = activeStages?.crag || {};
  const generator = activeStages?.generator || {};
  const safeRefusal = activeStages?.safeRefusal || {};
  const orderTool = activeStages?.orderTool || {};
  const hitl = activeStages?.hitl || {};

  // Determine active runtime branch from SSE state
  const liveBranch = useMemo(() => {
    if (
      intent === 'prompt_injection' ||
      guardrail.status === 'flagged' ||
      safeRefusal.triggered
    ) {
      return 'branch1';
    }
    if (
      intent === 'escalation_hitl' ||
      intent === 'human_review' ||
      hitl.isPaused ||
      hitl.resolved
    ) {
      return 'branch2';
    }
    if (intent === 'live_order_tool' || orderTool.triggered) {
      return 'branch3';
    }
    if (cache.hit) {
      return 'branch4_hit';
    }
    if (
      intent === 'safe_rag' ||
      retrieval.status !== 'idle' ||
      crag.status !== 'idle' ||
      generator.status !== 'idle'
    ) {
      return 'branch4_rag';
    }
    return 'idle';
  }, [intent, guardrail.status, safeRefusal.triggered, hitl.isPaused, hitl.resolved, orderTool.triggered, cache.hit, retrieval.status, crag.status, generator.status]);

  const activeFocusBranch = branchFilter === 'live' ? liveBranch : branchFilter;

  const nodeStateMap = useMemo(() => {
    const hasStarted =
      liveBranch !== 'idle' ||
      cache.status === 'running' ||
      guardrail.status !== 'idle';

    const cragRetried = (crag.retry_count || 0) > 0 || crag.status === 'irrelevant';

    return {
      start: {
        status: hasStarted ? 'completed' : 'idle',
        badgeText: hasStarted ? 'DISPATCHED' : 'READY',
        latency: null,
      },
      guardrail_and_router: {
        status:
          guardrail.status === 'flagged'
            ? 'flagged'
            : guardrail.status === 'completed'
            ? 'completed'
            : guardrail.status === 'running'
            ? 'running'
            : 'idle',
        badgeText:
          guardrail.classification ||
          (guardrail.status === 'running' ? 'ROUTING' : 'IDLE'),
        latency: guardrail.latency,
      },
      safe_refusal: {
        status: liveBranch === 'branch1' ? 'flagged' : 'idle',
        badgeText: liveBranch === 'branch1' ? 'TRIGGERED' : 'STANDBY',
        latency: safeRefusal.latency,
      },
      end_refusal: {
        status: liveBranch === 'branch1' && safeRefusal.status === 'triggered' ? 'flagged' : 'idle',
        badgeText: liveBranch === 'branch1' ? 'REFUSED' : 'END',
        latency: null,
      },
      human_review_node: {
        status: hitl.isPaused
          ? 'paused'
          : hitl.resolved
          ? 'completed'
          : liveBranch === 'branch2'
          ? 'paused'
          : 'idle',
        badgeText: hitl.isPaused
          ? 'INTERRUPT'
          : hitl.resolved
          ? 'RESUMED'
          : 'STANDBY',
        latency: hitl.latency,
      },
      chat_resume: {
        status: hitl.resolved ? 'completed' : hitl.isPaused ? 'paused' : 'idle',
        badgeText: hitl.resolved
          ? 'OVERRIDE SENT'
          : hitl.isPaused
          ? 'AWAITING INPUT'
          : 'ENDPOINT',
        latency: null,
      },
      end_hitl: {
        status: hitl.resolved ? 'completed' : 'idle',
        badgeText: hitl.resolved ? 'RESOLVED' : 'END',
        latency: null,
      },
      live_order_tool: {
        status:
          orderTool.status === 'completed'
            ? 'sql'
            : orderTool.status === 'running' || liveBranch === 'branch3'
            ? 'sql'
            : 'idle',
        badgeText:
          orderTool.status === 'completed'
            ? 'SQL HIT'
            : liveBranch === 'branch3'
            ? 'QUERYING'
            : 'STANDBY',
        latency: orderTool.latency,
      },
      end_order: {
        status: orderTool.status === 'completed' ? 'sql' : 'idle',
        badgeText: orderTool.status === 'completed' ? 'DELIVERED' : 'END',
        latency: null,
      },
      semantic_cache: {
        status:
          cache.hit
            ? 'hit'
            : cache.status === 'running'
            ? 'running'
            : cache.status === 'miss'
            ? 'completed'
            : 'idle',
        badgeText: cache.hit
          ? `HIT ${Math.round((cache.similarity || 1) * 100)}%`
          : cache.status === 'miss'
          ? 'MISS'
          : cache.status === 'running'
          ? 'LOOKUP'
          : 'IDLE',
        latency: cache.latency,
      },
      hybrid_retrieve: {
        status:
          cache.hit
            ? 'idle'
            : retrieval.status === 'completed'
            ? 'completed'
            : retrieval.status === 'running'
            ? 'running'
            : 'idle',
        badgeText: cache.hit
          ? 'BYPASSED'
          : retrieval.status === 'completed'
          ? `${retrieval.count || retrievedChunks.length} FUSED`
          : retrieval.status === 'running'
          ? 'SEARCHING'
          : 'IDLE',
        latency: cache.hit ? null : retrieval.latency,
      },
      flashrank_rerank: {
        status:
          cache.hit
            ? 'idle'
            : flashrank.status === 'completed' || retrieval.status === 'completed'
            ? 'completed'
            : flashrank.status === 'running' || retrieval.status === 'running'
            ? 'running'
            : 'idle',
        badgeText: cache.hit
          ? 'BYPASSED'
          : flashrank.status === 'completed' || retrieval.status === 'completed'
          ? `TOP-${retrievedChunks.length || flashrank.count || 4}`
          : flashrank.status === 'running'
          ? 'SCORING'
          : 'IDLE',
        latency: cache.hit ? null : flashrank.latency ?? retrieval.latency,
      },
      crag_grader: {
        status:
          cache.hit
            ? 'idle'
            : crag.status === 'relevant'
            ? 'completed'
            : crag.status === 'irrelevant'
            ? 'retry'
            : crag.status === 'running'
            ? 'running'
            : 'idle',
        badgeText: cache.hit
          ? 'BYPASSED'
          : crag.status === 'relevant'
          ? `PASS ${Math.round((crag.score || 1) * 100)}%`
          : crag.status === 'irrelevant'
          ? `RETRY #${(crag.retry_count || 0) + 1}`
          : crag.status === 'running'
          ? 'GRADING'
          : 'IDLE',
        latency: cache.hit ? null : crag.latency,
      },
      query_rewriter: {
        status: cragRetried ? 'retry' : 'idle',
        badgeText: cragRetried ? `RETRIES: ${crag.retry_count || 1}` : 'LOOP (MAX 2)',
        latency: null,
      },
      generator: {
        status:
          cache.hit
            ? 'idle'
            : generator.status === 'completed'
            ? 'completed'
            : generator.status === 'running'
            ? 'running'
            : 'idle',
        badgeText: cache.hit
          ? 'BYPASSED'
          : generator.status === 'completed'
          ? 'GENERATED'
          : generator.status === 'running'
          ? 'STREAMING'
          : 'IDLE',
        latency: cache.hit ? null : generator.latency,
      },
      end_rag: {
        status:
          cache.hit && generator.status === 'completed'
            ? 'hit'
            : generator.status === 'completed'
            ? 'completed'
            : 'idle',
        badgeText:
          cache.hit && generator.status === 'completed'
            ? 'CACHE FAST-PATH'
            : generator.status === 'completed'
            ? 'DELIVERED'
            : 'END',
        latency: null,
      },
    };
  }, [
    liveBranch,
    cache,
    guardrail,
    retrieval,
    flashrank,
    crag,
    generator,
    safeRefusal,
    orderTool,
    hitl,
    retrievedChunks.length,
  ]);

  const isNodeDimmed = useCallback(
    (nodeId) => {
      if (activeFocusBranch === 'idle' || activeFocusBranch === 'all') return false;
      const branch = NODE_CATALOG[nodeId]?.branch;
      if (branch === 'core') return false;
      if (activeFocusBranch === 'branch4_hit') {
        return !['semantic_cache', 'end_rag'].includes(nodeId);
      }
      if (activeFocusBranch === 'branch4_rag' || activeFocusBranch === 'branch4') {
        return branch !== 'branch4';
      }
      return branch !== activeFocusBranch;
    },
    [activeFocusBranch]
  );

  const nodes = useMemo(() => {
    const positions = {
      start: { x: 20, y: 215 },
      guardrail_and_router: { x: 265, y: 215 },
      // Branch 1
      safe_refusal: { x: 540, y: 20 },
      end_refusal: { x: 800, y: 20 },
      // Branch 2
      human_review_node: { x: 540, y: 145 },
      chat_resume: { x: 800, y: 145 },
      end_hitl: { x: 1060, y: 145 },
      // Branch 3
      live_order_tool: { x: 540, y: 270 },
      end_order: { x: 800, y: 270 },
      // Branch 4
      semantic_cache: { x: 540, y: 425 },
      hybrid_retrieve: { x: 795, y: 425 },
      flashrank_rerank: { x: 1050, y: 425 },
      crag_grader: { x: 1305, y: 425 },
      query_rewriter: { x: 1050, y: 565 },
      generator: { x: 1560, y: 425 },
      end_rag: { x: 1815, y: 425 },
    };

    return Object.keys(NODE_CATALOG).map((id) => {
      const meta = NODE_CATALOG[id];
      const runtime = nodeStateMap[id] || { status: 'idle', badgeText: 'IDLE', latency: null };
      return {
        id,
        type: 'langGraphNode',
        position: positions[id],
        data: {
          nodeId: id,
          label: meta.label,
          category: meta.category,
          status: runtime.status,
          badgeText: runtime.badgeText,
          latency: runtime.latency,
          isDark,
          dimmed: isNodeDimmed(id),
          reverseHandles: id === 'query_rewriter',
        },
      };
    });
  }, [nodeStateMap, isDark, isNodeDimmed]);

  const edges = useMemo(() => {
    const idleStroke = isDark ? '#334155' : '#94A3B8';
    const cragRetried = (crag.retry_count || 0) > 0 || crag.status === 'irrelevant';

    const buildEdge = (id, source, target, opts = {}) => {
      const {
        branch,
        label = '',
        color = '#10B981',
        dashed = false,
        sourceHandle,
        targetHandle,
        isLoopEdge = false,
        isCacheFastPath = false,
      } = opts;

      let active = false;
      if (activeFocusBranch !== 'idle' && activeFocusBranch !== 'all') {
        if (branch === 'core') {
          active = true;
        } else if (activeFocusBranch === 'branch4_hit') {
          active = branch === 'branch4_entry' || isCacheFastPath;
        } else if (activeFocusBranch === 'branch4_rag' || activeFocusBranch === 'branch4') {
          if (isCacheFastPath) active = false;
          else if (isLoopEdge) active = activeFocusBranch === 'branch4' || cragRetried;
          else active = branch === 'branch4' || branch === 'branch4_entry';
        } else {
          active = branch === activeFocusBranch;
        }
      }

      const muted = activeFocusBranch !== 'idle' && activeFocusBranch !== 'all' && !active;
      const stroke = active ? color : idleStroke;

      return {
        id,
        source,
        target,
        sourceHandle,
        targetHandle,
        label,
        animated: active,
        type: isLoopEdge || isCacheFastPath ? 'smoothstep' : 'default',
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: 16,
          height: 16,
        },
        style: {
          stroke,
          strokeWidth: active ? 2.6 : 1.5,
          strokeDasharray: dashed ? '6 4' : undefined,
          opacity: muted ? 0.25 : 0.95,
        },
        labelStyle: {
          fill: active ? color : isDark ? '#94A3B8' : '#475569',
          fontSize: 10,
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontWeight: active ? 700 : 500,
        },
        labelBgStyle: {
          fill: isDark ? '#0B1120' : '#FFFFFF',
          fillOpacity: 0.9,
        },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 4,
      };
    };

    return [
      buildEdge('e-start-guardrail', 'start', 'guardrail_and_router', {
        branch: 'core',
        color:
          liveBranch === 'branch1'
            ? '#EF4444'
            : liveBranch === 'branch2'
            ? '#F59E0B'
            : liveBranch === 'branch3'
            ? '#3B82F6'
            : liveBranch === 'branch4_hit'
            ? '#06B6D4'
            : '#10B981',
      }),
      // Branch 1
      buildEdge('e-guardrail-refusal', 'guardrail_and_router', 'safe_refusal', {
        branch: 'branch1',
        label: 'prompt_injection',
        color: '#EF4444',
      }),
      buildEdge('e-refusal-end', 'safe_refusal', 'end_refusal', {
        branch: 'branch1',
        color: '#EF4444',
      }),
      // Branch 2
      buildEdge('e-guardrail-hitl', 'guardrail_and_router', 'human_review_node', {
        branch: 'branch2',
        label: 'escalation_hitl',
        color: '#F59E0B',
      }),
      buildEdge('e-hitl-resume', 'human_review_node', 'chat_resume', {
        branch: 'branch2',
        label: 'Supervisor Override',
        color: '#F59E0B',
      }),
      buildEdge('e-resume-end', 'chat_resume', 'end_hitl', {
        branch: 'branch2',
        color: '#F59E0B',
      }),
      // Branch 3
      buildEdge('e-guardrail-order', 'guardrail_and_router', 'live_order_tool', {
        branch: 'branch3',
        label: 'live_order_tool',
        color: '#3B82F6',
      }),
      buildEdge('e-order-end', 'live_order_tool', 'end_order', {
        branch: 'branch3',
        color: '#3B82F6',
      }),
      // Branch 4
      buildEdge('e-guardrail-cache', 'guardrail_and_router', 'semantic_cache', {
        branch: 'branch4_entry',
        label: 'safe_rag',
        color: liveBranch === 'branch4_hit' ? '#06B6D4' : '#10B981',
      }),
      buildEdge('e-cache-hit-end', 'semantic_cache', 'end_rag', {
        branch: 'branch4_hit',
        label: 'Cache HIT (<15ms)',
        color: '#06B6D4',
        dashed: true,
        sourceHandle: 'top-source',
        targetHandle: 'top-target',
        isCacheFastPath: true,
      }),
      buildEdge('e-cache-retrieve', 'semantic_cache', 'hybrid_retrieve', {
        branch: 'branch4',
        label: 'MISS',
        color: '#10B981',
      }),
      buildEdge('e-retrieve-flashrank', 'hybrid_retrieve', 'flashrank_rerank', {
        branch: 'branch4',
        color: '#10B981',
      }),
      buildEdge('e-flashrank-crag', 'flashrank_rerank', 'crag_grader', {
        branch: 'branch4',
        color: '#10B981',
      }),
      buildEdge('e-crag-generator', 'crag_grader', 'generator', {
        branch: 'branch4',
        label: 'Relevant',
        color: '#10B981',
      }),
      buildEdge('e-generator-end', 'generator', 'end_rag', {
        branch: 'branch4',
        color: '#10B981',
      }),
      // CRAG Loop-Back
      buildEdge('e-crag-rewriter', 'crag_grader', 'query_rewriter', {
        branch: 'branch4',
        label: 'Irrelevant (Retry)',
        color: '#F59E0B',
        dashed: true,
        sourceHandle: 'bottom-source',
        isLoopEdge: true,
      }),
      buildEdge('e-rewriter-retrieve', 'query_rewriter', 'hybrid_retrieve', {
        branch: 'branch4',
        label: 'Reformulated Query',
        color: '#F59E0B',
        dashed: true,
        targetHandle: 'bottom-target',
        isLoopEdge: true,
      }),
    ];
  }, [isDark, activeFocusBranch, liveBranch, crag.retry_count, crag.status]);

  const selectedMeta = selectedNodeId ? NODE_CATALOG[selectedNodeId] : null;
  const selectedRuntime = selectedNodeId ? nodeStateMap[selectedNodeId] : null;

  const filterButtons = [
    { id: 'live', label: 'Live Execution' },
    { id: 'all', label: 'Full Topology' },
    { id: 'branch1', label: '1. Safe Refusal' },
    { id: 'branch2', label: '2. HITL Interrupt' },
    { id: 'branch3', label: '3. SQLite Order' },
    { id: 'branch4', label: '4. Hybrid CRAG' },
  ];

  const renderNodeTelemetryDetails = (nodeId) => {
    switch (nodeId) {
      case 'guardrail_and_router':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Classification" value={guardrail.classification || 'Idle'} isDark={isDark} />
            <TelemetryRow
              label="PII Redacted"
              value={guardrail.pii_redacted ? 'Yes (Masked)' : 'No'}
              isDark={isDark}
            />
            <TelemetryRow
              label="Confidence"
              value={
                guardrail.confidence !== null && guardrail.confidence !== undefined
                  ? `${Math.round(guardrail.confidence * 100)}%`
                  : 'N/A'
              }
              isDark={isDark}
            />
            {guardrail.reasoning && (
              <div
                className={`p-2 rounded-lg border text-[10px] leading-relaxed font-sans ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {guardrail.reasoning}
              </div>
            )}
          </div>
        );
      case 'semantic_cache':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow
              label="Cache Status"
              value={cache.hit ? 'HIT' : cache.status === 'miss' ? 'MISS' : 'IDLE'}
              isDark={isDark}
            />
            <TelemetryRow
              label="Similarity"
              value={cache.hit ? `${(cache.similarity * 100).toFixed(2)}%` : 'Below 92.0%'}
              isDark={isDark}
            />
            <TelemetryRow label="Threshold" value=">= 0.92 Cosine" isDark={isDark} />
            {cache.matchedQuery && (
              <div
                className={`p-2 rounded-lg border text-[10px] font-sans ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-cyan-200' : 'bg-cyan-50 border-cyan-200 text-cyan-900'
                }`}
              >
                <div className="font-bold uppercase text-[9px] opacity-75 mb-0.5">Matched Query</div>
                {cache.matchedQuery}
              </div>
            )}
          </div>
        );
      case 'hybrid_retrieve':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Dense Vectors" value={`${telemetry?.chroma_chunk_count ?? 86} chunks`} isDark={isDark} />
            <TelemetryRow label="BM25 Sparse" value={telemetry?.bm25_status || 'Active'} isDark={isDark} />
            <TelemetryRow label="RRF Constant" value="k = 60" isDark={isDark} />
            <TelemetryRow label="Returned Chunks" value={`${retrievedChunks.length} chunks`} isDark={isDark} />
          </div>
        );
      case 'flashrank_rerank':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Model" value={telemetry?.reranker_model || 'ms-marco-MiniLM-L-12-v2'} isDark={isDark} />
            <TelemetryRow label="Top-K Selected" value={`${retrievedChunks.length || 0} / 4`} isDark={isDark} />
            {retrievedChunks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className={`text-[9px] uppercase font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Top FlashRank Scores
                </div>
                {retrievedChunks.slice(0, 4).map((chunk, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center justify-between px-2 py-1 rounded border text-[10px] ${
                      isDark ? 'bg-[#070A14] border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <span className="truncate max-w-[155px]">{chunk.source || `Chunk #${idx + 1}`}</span>
                    <span className="text-emerald-400 font-bold">{Number(chunk.score || 0).toFixed(4)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case 'crag_grader':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow
              label="Verdict"
              value={
                crag.is_relevant === true
                  ? 'RELEVANT (PASS)'
                  : crag.is_relevant === false
                  ? 'IRRELEVANT (REWRITE)'
                  : 'Awaiting'
              }
              isDark={isDark}
            />
            <TelemetryRow
              label="Score"
              value={crag.score ? `${Math.round(crag.score * 100)}%` : 'N/A'}
              isDark={isDark}
            />
            <TelemetryRow label="Retry Count" value={`${crag.retry_count ?? 0} / 2`} isDark={isDark} />
            {crag.reasoning && (
              <div
                className={`p-2 rounded-lg border text-[10px] leading-relaxed font-sans ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {crag.reasoning}
              </div>
            )}
          </div>
        );
      case 'query_rewriter':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Retry Count" value={`${crag.retry_count ?? 0}`} isDark={isDark} />
            <TelemetryRow label="Max Retries" value="2" isDark={isDark} />
            <TelemetryRow
              label="Loop Triggered"
              value={(crag.retry_count || 0) > 0 || crag.status === 'irrelevant' ? 'Yes' : 'No'}
              isDark={isDark}
            />
          </div>
        );
      case 'live_order_tool':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Database" value="data/nexus_structured.db" isDark={isDark} />
            <TelemetryRow
              label="Indexed Rows"
              value={(telemetry?.sqlite_row_count ?? 26872).toLocaleString()}
              isDark={isDark}
            />
            <TelemetryRow
              label="Tool Status"
              value={orderTool.triggered ? 'Executed' : 'Standby'}
              isDark={isDark}
            />
            {orderTool.orderData && (
              <pre
                className={`p-2 rounded-lg border text-[10px] overflow-x-auto ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-900'
                }`}
              >
                {JSON.stringify(orderTool.orderData, null, 2)}
              </pre>
            )}
          </div>
        );
      case 'human_review_node':
      case 'chat_resume':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow
              label="HITL State"
              value={hitl.isPaused ? 'PAUSED' : hitl.resolved ? 'RESUMED' : 'IDLE'}
              isDark={isDark}
            />
            <TelemetryRow label="Thread ID" value={hitl.threadId || threadId || 'N/A'} isDark={isDark} />
            {hitl.reason && (
              <div
                className={`p-2 rounded-lg border text-[10px] leading-relaxed font-sans ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {hitl.reason}
              </div>
            )}
          </div>
        );
      case 'generator':
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Generator LLM" value={telemetry?.groq_model || 'openai/gpt-oss-120b'} isDark={isDark} />
            <TelemetryRow
              label="Execution"
              value={cache.hit ? 'Bypassed (Cache Hit)' : generator.status === 'completed' ? 'Completed' : 'Idle'}
              isDark={isDark}
            />
            <TelemetryRow label="Context Chunks" value={`${retrievedChunks.length}`} isDark={isDark} />
          </div>
        );
      default:
        return (
          <div className="space-y-2 text-[11px] font-mono">
            <TelemetryRow label="Thread ID" value={threadId || 'N/A'} isDark={isDark} />
            <TelemetryRow label="Active Intent" value={intent || 'Listening'} isDark={isDark} />
            {latestQuery && (
              <div
                className={`p-2 rounded-lg border text-[10px] leading-relaxed font-sans ${
                  isDark ? 'bg-[#070A14] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="font-bold uppercase text-[9px] opacity-75 mb-0.5">Latest Query</div>
                {latestQuery}
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-hidden">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.8 }}
            className={`relative w-full max-w-6xl h-[88vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-md ${
              isDark
                ? 'bg-[#0B1120]/95 border-[#1E293B] text-slate-100'
                : 'bg-white/95 border-emerald-200/85 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div
              className={`px-5 py-4 border-b flex items-center justify-between gap-4 ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/85'
                  : 'border-emerald-100 bg-emerald-50/50'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                    isDark
                      ? 'bg-accent-emerald/15 border-accent-emerald/30'
                      : 'bg-emerald-100/80 border-emerald-200'
                  }`}
                >
                  <GitBranch className="w-5 h-5 text-accent-emerald" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-base font-bold tracking-tight">
                      Live Interactive LangGraph Node Visualizer
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                        isDark
                          ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      @xyflow/react
                    </span>
                    {liveBranch !== 'idle' && (
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase flex items-center gap-1 ${
                          liveBranch === 'branch1'
                            ? isDark
                              ? 'bg-red-500/20 text-red-300 border-red-500/40'
                              : 'bg-red-50 text-red-700 border-red-300'
                            : liveBranch === 'branch2'
                            ? isDark
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-amber-50 text-amber-800 border-amber-300'
                            : liveBranch === 'branch3'
                            ? isDark
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : 'bg-blue-50 text-blue-700 border-blue-300'
                            : liveBranch === 'branch4_hit'
                            ? isDark
                              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                              : 'bg-cyan-50 text-cyan-800 border-cyan-300'
                            : isDark
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        }`}
                      >
                        <Activity className="w-3 h-3" />
                        Active: {intent || liveBranch}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Zoom, pan, and click any node to inspect live SSE telemetry across all 4 StateGraph branches.
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className={`p-2 rounded-xl border transition-colors flex-shrink-0 ${
                  isDark
                    ? 'border-white/10 hover:bg-white/10 text-slate-400 hover:text-white'
                    : 'border-emerald-200/80 hover:bg-emerald-50 text-slate-600 hover:text-slate-900'
                }`}
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Branch Focus Toolbar */}
            <div
              className={`px-5 py-2.5 border-b flex items-center justify-between gap-3 overflow-x-auto scrollbar-none ${
                isDark
                  ? 'border-[#1E293B] bg-[#070A14]/90'
                  : 'border-emerald-100 bg-emerald-50/30'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {filterButtons.map((btn) => (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => setBranchFilter(btn.id)}
                    className={`flex-shrink-0 px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-all ${
                      branchFilter === btn.id
                        ? isDark
                          ? 'bg-accent-emerald/20 border-accent-emerald/50 text-white'
                          : 'bg-white border-emerald-500 text-emerald-800 shadow-2xs'
                        : isDark
                        ? 'bg-[#0F1629] border-[#1E293B] text-slate-400 hover:text-slate-200'
                        : 'bg-white/80 border-emerald-200/70 text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {btn.label}
                  </button>
                ))}
              </div>

              <span className={`text-[10px] font-mono flex-shrink-0 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Click any node to inspect
              </span>
            </div>

            {/* Interactive ReactFlow Canvas + Click-to-Inspect Drawer */}
            <div className="flex-1 flex min-h-0 relative">
              <div
                className={`flex-1 h-full min-h-[420px] relative ${
                  isDark ? 'bg-[#070A14]' : 'bg-[#F8FCFA]'
                }`}
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={NODE_TYPES}
                  onInit={setRfInstance}
                  onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                  onPaneClick={() => setSelectedNodeId(null)}
                  fitView
                  fitViewOptions={{ padding: 0.14 }}
                  minZoom={0.25}
                  maxZoom={1.75}
                  nodesDraggable={false}
                  nodesConnectable={false}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background
                    variant="dots"
                    gap={18}
                    size={1.2}
                    color={isDark ? '#1E293B' : '#CBD5E1'}
                  />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>

              {/* Click-to-Inspect Node Drawer */}
              <AnimatePresence>
                {selectedNodeId && selectedMeta && (
                  <motion.aside
                    initial={{ x: 320, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: 320, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                    className={`w-80 border-l flex flex-col h-full overflow-y-auto z-20 ${
                      isDark
                        ? 'bg-[#0F1629]/95 border-[#1E293B] text-slate-100'
                        : 'bg-white/95 border-emerald-200 text-slate-900 shadow-lg'
                    }`}
                  >
                    <div
                      className={`p-4 border-b flex items-start justify-between gap-2 ${
                        isDark ? 'border-[#1E293B]' : 'border-emerald-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <span
                          className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                            isDark ? 'text-accent-emerald' : 'text-emerald-700'
                          }`}
                        >
                          {selectedMeta.category}
                        </span>
                        <h3 className="text-xs font-mono font-bold mt-0.5 break-words">
                          {selectedMeta.label}
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(null)}
                        className={`p-1 rounded-lg border transition-colors ${
                          isDark
                            ? 'border-white/10 hover:bg-white/10 text-slate-400'
                            : 'border-slate-200 hover:bg-slate-100 text-slate-500'
                        }`}
                        title="Close Inspector"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="p-4 space-y-4">
                      {/* Node Role */}
                      <div className="space-y-1.5">
                        <div
                          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          <Info className="w-3 h-3 text-accent-emerald" />
                          <span>Node Role</span>
                        </div>
                        <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                          {selectedMeta.role}
                        </p>
                      </div>

                      {/* Runtime Status Summary */}
                      <div
                        className={`p-3 rounded-xl border space-y-2 ${
                          isDark ? 'bg-[#070A14]/80 border-slate-800' : 'bg-emerald-50/40 border-emerald-200/80'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Status</span>
                          <span className="font-bold uppercase">
                            {selectedRuntime?.badgeText || 'IDLE'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono">
                          <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>Latency</span>
                          <span className="font-bold">
                            {selectedRuntime?.latency !== null && selectedRuntime?.latency !== undefined
                              ? `${selectedRuntime.latency} ms`
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {/* Node-Specific Live Telemetry */}
                      <div className="space-y-2">
                        <div
                          className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                            isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          <Activity className="w-3 h-3 text-accent-cyan" />
                          <span>Live Session Telemetry</span>
                        </div>
                        {renderNodeTelemetryDetails(selectedNodeId)}
                      </div>
                    </div>
                  </motion.aside>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              className={`px-5 py-3 border-t flex items-center justify-between text-xs ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/85 text-slate-400'
                  : 'border-emerald-100 bg-emerald-50/45 text-slate-600'
              }`}
            >
              <span className="font-mono text-[11px] truncate">
                STATEGRAPH: Groq + LangGraph + ChromaDB + BM25 RRF + FlashRank + SQLite + Redis
              </span>
              <button
                type="button"
                onClick={onClose}
                className={`px-4 py-1.5 rounded-xl border font-semibold transition-all ${
                  isDark
                    ? 'bg-white/10 hover:bg-white/15 text-white border-white/10'
                    : 'bg-white hover:bg-emerald-50 text-slate-800 border-emerald-200 shadow-xs'
                }`}
              >
                Done
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function TelemetryRow({ label, value, isDark }) {
  return (
    <div
      className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border ${
        isDark ? 'bg-[#070A14]/70 border-slate-800' : 'bg-white border-slate-200'
      }`}
    >
      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>{label}</span>
      <span className={`font-semibold text-right truncate max-w-[155px] ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
        {value}
      </span>
    </div>
  );
}
