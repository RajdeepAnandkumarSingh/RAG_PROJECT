import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Database,
  Cpu,
  Layers,
  RefreshCw,
  ArrowRight,
  GitBranch,
  Terminal,
  Lock,
} from 'lucide-react';

export default function PipelineArchitectureModal({
  isOpen,
  onClose,
  theme = 'dark',
}) {
  const [selectedPath, setSelectedPath] = useState('all');
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

  const paths = [
    {
      id: 'all',
      name: 'Full State Machine Topology',
      tag: 'STATE GRAPH',
      tagStyle: 'bg-primary/15 text-primary-light border-primary/30',
      description:
        'Unified LangGraph state machine coordinating deterministic routing, hybrid retrieval, cross-encoder reranking, CRAG self-correction, and human supervisor interrupts.',
    },
    {
      id: 'path1',
      name: '1. Prompt Injection Block',
      tag: 'SECURITY GUARDRAIL',
      tagStyle: 'bg-red-500/15 text-red-400 border-red-500/30',
      intent: 'prompt_injection',
      description:
        'Immediate defensive refusal isolating malicious queries, prompt exfiltration attempts, and instruction override injections without invoking RAG or tool pipelines.',
    },
    {
      id: 'path2',
      name: '2. HITL Escalation Interrupt',
      tag: 'HUMAN-IN-THE-LOOP',
      tagStyle: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      intent: 'escalation_hitl',
      description:
        'LangGraph checkpointer halts state execution at human_review_node with interrupt_before, awaiting supervisor override input via /api/chat/resume.',
    },
    {
      id: 'path3',
      name: '3. SQLite Live Order Tool',
      tag: 'SQLITE TOOL CALL',
      tagStyle: 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30',
      intent: 'live_order_tool',
      description:
        'Extracts validated Order ID (#7721) and executes non-blocking parameterized SQL lookup against data/nexus_structured.db (B-Tree indexed).',
    },
    {
      id: 'path4',
      name: '4. Hybrid RRF → FlashRank → CRAG Loop',
      tag: 'SELF-CORRECTIVE RAG',
      tagStyle: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
      intent: 'safe_rag',
      description:
        'ChromaDB dense search + BM25Okapi sparse lexical fusion (RRF k=60), reranked by FlashRank cross-encoder, evaluated by CRAG relevance grader with query reformulation loop (max_retries=2).',
    },
  ];

  const activePath = paths.find((p) => p.id === selectedPath);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
          />

          {/* Modal Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.8 }}
            className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-md ${
              isDark
                ? 'bg-[#0B1120]/95 border-[#1E293B] text-slate-100'
                : 'bg-white/95 border-emerald-200/80 text-slate-900'
            }`}
          >
            {/* Header */}
            <div
              className={`p-6 border-b flex items-center justify-between ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/80'
                  : 'border-emerald-100 bg-emerald-50/45'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                    isDark
                      ? 'bg-accent-emerald/15 border-accent-emerald/30'
                      : 'bg-emerald-100/80 border-emerald-200'
                  }`}
                >
                  <Layers className="w-5 h-5 text-accent-emerald" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold tracking-tight">
                      LangGraph Enterprise Multi-Agent Architecture
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border uppercase ${
                        isDark
                          ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      v2.0 State Machine
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Interactive state topology showing deterministic routing, self-correction loops,
                    and interrupt semantics.
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className={`p-2 rounded-xl border transition-colors ${
                  isDark
                    ? 'border-white/10 hover:bg-white/10 text-slate-400 hover:text-white'
                    : 'border-emerald-200/80 hover:bg-emerald-50 text-slate-600 hover:text-slate-900'
                }`}
                title="Close (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Interactive Path Tabs */}
            <div
              className={`px-6 pt-3 pb-3 border-b flex items-center gap-2 overflow-x-auto scrollbar-thin ${
                isDark
                  ? 'border-[#1E293B] bg-[#070A14]/90'
                  : 'border-emerald-100 bg-emerald-50/30'
              }`}
            >
              {paths.map((path) => (
                <button
                  key={path.id}
                  onClick={() => setSelectedPath(path.id)}
                  className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    selectedPath === path.id
                      ? isDark
                        ? 'bg-accent-emerald/20 border-accent-emerald/50 text-white shadow-xs'
                        : 'bg-white border-emerald-500 text-emerald-800 shadow-xs'
                      : isDark
                      ? 'bg-[#0F1629] border-[#1E293B] text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      : 'bg-white/80 border-emerald-200/70 text-slate-600 hover:text-slate-900 hover:border-emerald-300'
                  }`}
                >
                  <span>{path.name}</span>
                </button>
              ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Active Path Description Banner */}
              <div
                className={`p-4 rounded-xl border ${
                  isDark
                    ? 'bg-[#0F1629]/80 border-[#1E293B]'
                    : 'bg-emerald-50/45 border-emerald-200/75'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-bold uppercase tracking-wider ${
                      isDark ? 'text-accent-emerald' : 'text-emerald-700'
                    }`}
                  >
                    {activePath?.tag || 'ARCHITECTURE PATH'}
                  </span>
                  {activePath?.intent && (
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        isDark
                          ? 'bg-slate-800 text-slate-300 border-slate-700'
                          : 'bg-white text-emerald-800 border-emerald-200'
                      }`}
                    >
                      intent: {activePath.intent}
                    </span>
                  )}
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                  {activePath?.description}
                </p>
              </div>

              {/* Visual Flow Diagram */}
              <div
                className={`p-6 rounded-2xl border ${
                  isDark
                    ? 'bg-[#070A14]/80 border-[#1E293B]'
                    : 'bg-emerald-50/30 border-emerald-200/70'
                }`}
              >
                <div
                  className={`text-[11px] font-bold uppercase tracking-wider mb-4 flex items-center gap-2 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  <GitBranch className="w-3.5 h-3.5 text-accent-emerald" />
                  <span>Execution Node Flow</span>
                </div>

                {/* FLOW DIAGRAM FOR SELECTED PATH */}
                {(selectedPath === 'all' || selectedPath === 'path1') && (
                  <div
                    className={`p-4 rounded-xl border mb-4 transition-all ${
                      selectedPath === 'path1'
                        ? 'border-red-500/50 bg-red-500/5'
                        : isDark
                        ? 'border-slate-800 bg-[#0F1629]/80'
                        : 'border-emerald-200/70 bg-white/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        BRANCH 1: PROMPT INJECTION BLOCK
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-primary/10 border-primary/20 text-primary-light'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        START: User Query
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                            : 'bg-purple-50 border-purple-200 text-purple-800'
                        }`}
                      >
                        guardrail_and_router
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-red-500/15 border-red-500/30 text-red-400'
                            : 'bg-red-50 border-red-200 text-red-700'
                        }`}
                      >
                        safe_refusal
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-300 text-slate-800'
                        }`}
                      >
                        END (Safe Refusal Response)
                      </div>
                    </div>
                  </div>
                )}

                {(selectedPath === 'all' || selectedPath === 'path2') && (
                  <div
                    className={`p-4 rounded-xl border mb-4 transition-all ${
                      selectedPath === 'path2'
                        ? 'border-amber-500/50 bg-amber-500/5'
                        : isDark
                        ? 'border-slate-800 bg-[#0F1629]/80'
                        : 'border-emerald-200/70 bg-white/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        BRANCH 2: HITL ESCALATION INTERRUPT
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-primary/10 border-primary/20 text-primary-light'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        START: Escalation Query
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                            : 'bg-purple-50 border-purple-200 text-purple-800'
                        }`}
                      >
                        guardrail_and_router
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-bold animate-pulse ${
                          isDark
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                            : 'bg-amber-100 border-amber-300 text-amber-900'
                        }`}
                      >
                        INTERRUPT: human_review_node
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        POST /api/chat/resume
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-300 text-slate-800'
                        }`}
                      >
                        END (Supervisor Resolution)
                      </div>
                    </div>
                  </div>
                )}

                {(selectedPath === 'all' || selectedPath === 'path3') && (
                  <div
                    className={`p-4 rounded-xl border mb-4 transition-all ${
                      selectedPath === 'path3'
                        ? 'border-emerald-500/50 bg-emerald-500/5'
                        : isDark
                        ? 'border-slate-800 bg-[#0F1629]/80'
                        : 'border-emerald-200/70 bg-white/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        }`}
                      >
                        BRANCH 3: SQLITE LIVE ORDER TOOL
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-primary/10 border-primary/20 text-primary-light'
                            : 'bg-blue-50 border-blue-200 text-blue-800'
                        }`}
                      >
                        START: Order #7721
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-purple-500/10 border-purple-500/20 text-purple-400'
                            : 'bg-purple-50 border-purple-200 text-purple-800'
                        }`}
                      >
                        guardrail_and_router
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        live_order_tool (SQLite SELECT)
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div
                        className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                          isDark
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-slate-100 border-slate-300 text-slate-800'
                        }`}
                      >
                        END (Verified Carrier & Delivery Status)
                      </div>
                    </div>
                  </div>
                )}

                {(selectedPath === 'all' || selectedPath === 'path4') && (
                  <div
                    className={`p-4 rounded-xl border transition-all ${
                      selectedPath === 'path4'
                        ? 'border-cyan-500/50 bg-cyan-500/5'
                        : isDark
                        ? 'border-slate-800 bg-[#0F1629]/80'
                        : 'border-emerald-200/70 bg-white/90'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span
                        className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${
                          isDark
                            ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                            : 'bg-cyan-50 text-cyan-800 border-cyan-200'
                        }`}
                      >
                        BRANCH 4: HYBRID RRF → FLASHRANK → CRAG SELF-CORRECTION LOOP
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <div
                          className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                            isDark
                              ? 'bg-primary/10 border-primary/20 text-primary-light'
                              : 'bg-blue-50 border-blue-200 text-blue-800'
                          }`}
                        >
                          START: Policy Query
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                        <div
                          className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                            isDark
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          }`}
                        >
                          lookup (Semantic Cache)
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                        <div
                          className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                            isDark
                              ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                              : 'bg-blue-50 border-blue-200 text-blue-800'
                          }`}
                        >
                          retrieve (Chroma + BM25 RRF + FlashRank)
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-500" />
                        <div
                          className={`px-3 py-2 rounded-lg border font-mono font-semibold ${
                            isDark
                              ? 'bg-purple-500/15 border-purple-500/30 text-purple-400'
                              : 'bg-purple-50 border-purple-200 text-purple-800'
                          }`}
                        >
                          grade_documents (CRAG)
                        </div>
                      </div>

                      {/* Conditional CRAG loop */}
                      <div className="pl-6 border-l-2 border-dashed border-emerald-500/40 space-y-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isDark
                                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                                : 'text-emerald-800 bg-emerald-50 border-emerald-200'
                            }`}
                          >
                            IF Relevant (Pass)
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            generate (ChatGroq LLM) → END
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isDark
                                ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                                : 'text-amber-800 bg-amber-50 border-amber-200'
                            }`}
                          >
                            IF Irrelevant (Fail)
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                          <span className={`font-mono ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                            rewrite_query (Query Reformulation) → loop back to retrieve (max_retries=2)
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Technical Specifications Table */}
              <div
                className={`p-5 rounded-2xl border ${
                  isDark
                    ? 'bg-[#0F1629]/80 border-[#1E293B]'
                    : 'bg-emerald-50/35 border-emerald-200/70'
                }`}
              >
                <div
                  className={`text-[11px] font-bold uppercase tracking-wider mb-3 flex items-center gap-2 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5 text-accent-emerald" />
                  <span>Production System Specifications</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div
                    className={`p-3 rounded-xl border ${
                      isDark
                        ? 'bg-[#070A14]/80 border-slate-800'
                        : 'bg-white border-emerald-200/75'
                    }`}
                  >
                    <div
                      className={`font-bold mb-1 flex items-center gap-1.5 ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <Database className="w-3.5 h-3.5 text-accent-cyan" />
                      Hybrid Dense + Lexical Fusion
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Combines ChromaDB 384-dimensional cosine embeddings (
                      <code className="font-mono text-primary-light">all-MiniLM-L6-v2</code>) with
                      BM25Okapi lexical tokenization using Reciprocal Rank Fusion (constant{' '}
                      <code className="font-mono">k=60</code>).
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isDark
                        ? 'bg-[#070A14]/80 border-slate-800'
                        : 'bg-white border-emerald-200/75'
                    }`}
                  >
                    <div
                      className={`font-bold mb-1 flex items-center gap-1.5 ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <Cpu className="w-3.5 h-3.5 text-accent-purple" />
                      FlashRank Cross-Encoder Reranker
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Ultra-fast in-memory cross-encoder reranker (
                      <code className="font-mono text-purple-400">ms-marco-MiniLM-L-12-v2</code>)
                      filtering the top fused chunks down to the highest-scoring 4 chunks in under
                      35ms.
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isDark
                        ? 'bg-[#070A14]/80 border-slate-800'
                        : 'bg-white border-emerald-200/75'
                    }`}
                  >
                    <div
                      className={`font-bold mb-1 flex items-center gap-1.5 ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-accent-emerald" />
                      Corrective RAG (CRAG) Policy
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Structured binary relevance grader (
                      <code className="font-mono text-emerald-500">GradeResult</code>) with
                      automatic semantic query rewrite and bounded execution (
                      <code className="font-mono">max_retries=2</code>) preventing infinite
                      retrieval loops.
                    </p>
                  </div>

                  <div
                    className={`p-3 rounded-xl border ${
                      isDark
                        ? 'bg-[#070A14]/80 border-slate-800'
                        : 'bg-white border-emerald-200/75'
                    }`}
                  >
                    <div
                      className={`font-bold mb-1 flex items-center gap-1.5 ${
                        isDark ? 'text-slate-200' : 'text-slate-800'
                      }`}
                    >
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      HITL State Checkpointing & Resume
                    </div>
                    <p
                      className={`text-[11px] leading-relaxed ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      State persisted via thread-scoped{' '}
                      <code className="font-mono text-amber-500">MemorySaver</code> checkpoints with{' '}
                      <code className="font-mono">interrupt_before</code>. Supervisors resume
                      execution via atomic state update at{' '}
                      <code className="font-mono">/api/chat/resume</code>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div
              className={`p-4 border-t flex items-center justify-between text-xs ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/80 text-slate-400'
                  : 'border-emerald-100 bg-emerald-50/45 text-slate-600'
              }`}
            >
              <span className="font-mono text-[11px]">
                ENGINE: Groq LLM + LangGraph StateGraph + ChromaDB + FlashRank + SQLite
              </span>
              <button
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
