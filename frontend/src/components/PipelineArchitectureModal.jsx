import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Shield, Database, Cpu, 
  Layers, RefreshCw, Zap, ArrowRight,
  UserCheck, AlertTriangle, CheckCircle, Code,
  GitBranch, Server, Terminal, Lock
} from 'lucide-react';

export default function PipelineArchitectureModal({
  isOpen,
  onClose,
  theme = 'dark'
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

  if (!isOpen) return null;

  const paths = [
    {
      id: 'all',
      name: 'Full State Machine Topology',
      tag: 'STATE GRAPH',
      tagStyle: 'bg-primary/15 text-primary-light border-primary/30',
      description: 'Unified LangGraph state machine coordinating deterministic routing, hybrid retrieval, cross-encoder reranking, CRAG self-correction, and human supervisor interrupts.'
    },
    {
      id: 'path1',
      name: '1. Prompt Injection Block',
      tag: 'SECURITY GUARDRAIL',
      tagStyle: 'bg-red-500/15 text-red-400 border-red-500/30',
      intent: 'prompt_injection',
      description: 'Immediate defensive refusal isolating malicious queries, prompt exfiltration attempts, and instruction override injections without invoking RAG or tool pipelines.'
    },
    {
      id: 'path2',
      name: '2. HITL Escalation Interrupt',
      tag: 'HUMAN-IN-THE-LOOP',
      tagStyle: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      intent: 'escalation_hitl',
      description: 'LangGraph checkpointer halts state execution at human_review_node with interrupt_before, awaiting supervisor override input via /api/chat/resume.'
    },
    {
      id: 'path3',
      name: '3. SQLite Live Order Tool',
      tag: 'SQLITE TOOL CALL',
      tagStyle: 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30',
      intent: 'live_order_tool',
      description: 'Extracts validated Order ID (#7721) and executes non-blocking parameterized SQL lookup against data/nexus_structured.db (B-Tree indexed).'
    },
    {
      id: 'path4',
      name: '4. Hybrid RRF → FlashRank → CRAG Loop',
      tag: 'SELF-CORRECTIVE RAG',
      tagStyle: 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30',
      intent: 'safe_rag',
      description: 'ChromaDB dense search + BM25Okapi sparse lexical fusion (RRF k=60), reranked by FlashRank cross-encoder, evaluated by CRAG relevance grader with query reformulation loop (max_retries=2).'
    }
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={`relative w-full max-w-5xl max-h-[90vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
            isDark 
              ? 'bg-[#090D16] border-[#1E293B] text-slate-100' 
              : 'bg-white border-[#E2E8F0] text-slate-900'
          }`}
        >
          {/* Header */}
          <div className={`p-6 border-b flex items-center justify-between ${
            isDark ? 'border-[#1E293B] bg-[#111827]/70' : 'border-[#E2E8F0] bg-slate-50'
          }`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Layers className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold tracking-tight">LangGraph Enterprise Multi-Agent Architecture</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/15 text-primary-light border border-primary/30 uppercase">
                    v2.0 State Machine
                  </span>
                </div>
                <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Interactive state topology showing deterministic routing, self-correction loops, and interrupt semantics.
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className={`p-2 rounded-xl border transition-colors ${
                isDark 
                  ? 'border-white/10 hover:bg-white/10 text-slate-400 hover:text-white' 
                  : 'border-slate-200 hover:bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
              title="Close (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Interactive Path Tabs */}
          <div className={`px-6 pt-3 pb-3 border-b flex items-center gap-2 overflow-x-auto scrollbar-thin ${
            isDark ? 'border-[#1E293B] bg-[#090D16]' : 'border-[#E2E8F0] bg-slate-100/60'
          }`}>
            {paths.map(path => (
              <button
                key={path.id}
                onClick={() => setSelectedPath(path.id)}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                  selectedPath === path.id
                    ? isDark 
                      ? 'bg-primary/20 border-primary/50 text-white shadow-xs' 
                      : 'bg-white border-blue-500 text-blue-700 shadow-xs'
                    : isDark 
                      ? 'bg-[#111827] border-[#1E293B] text-slate-400 hover:text-slate-200 hover:border-slate-700' 
                      : 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                <span>{path.name}</span>
              </button>
            ))}
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Active Path Description Banner */}
            <div className={`p-4 rounded-xl border ${
              isDark ? 'bg-[#111827] border-[#1E293B]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold uppercase tracking-wider text-primary-light">
                  {paths.find(p => p.id === selectedPath)?.tag || 'ARCHITECTURE PATH'}
                </span>
                {paths.find(p => p.id === selectedPath)?.intent && (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    intent: {paths.find(p => p.id === selectedPath)?.intent}
                  </span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {paths.find(p => p.id === selectedPath)?.description}
              </p>
            </div>

            {/* Visual Flow Diagram */}
            <div className={`p-6 rounded-2xl border ${
              isDark ? 'bg-[#0B101E] border-[#1E293B]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-4 flex items-center gap-2 text-slate-400">
                <GitBranch className="w-3.5 h-3.5 text-primary-light" />
                <span>Execution Node Flow</span>
              </div>

              {/* FLOW DIAGRAM FOR SELECTED PATH */}
              {(selectedPath === 'all' || selectedPath === 'path1') && (
                <div className={`p-4 rounded-xl border mb-4 transition-all ${
                  selectedPath === 'path1' ? 'border-red-500/50 bg-red-500/5' : isDark ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      BRANCH 1: PROMPT INJECTION BLOCK
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary-light font-mono font-semibold">
                      START: User Query
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono font-semibold">
                      guardrail_and_router
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 font-mono font-semibold">
                      safe_refusal
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono font-semibold">
                      END (Safe Refusal Response)
                    </div>
                  </div>
                </div>
              )}

              {(selectedPath === 'all' || selectedPath === 'path2') && (
                <div className={`p-4 rounded-xl border mb-4 transition-all ${
                  selectedPath === 'path2' ? 'border-amber-500/50 bg-amber-500/5' : isDark ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      BRANCH 2: HITL ESCALATION INTERRUPT
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary-light font-mono font-semibold">
                      START: Escalation Query
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono font-semibold">
                      guardrail_and_router
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 font-mono font-bold animate-pulse">
                      INTERRUPT: human_review_node
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 font-mono font-semibold">
                      POST /api/chat/resume
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono font-semibold">
                      END (Supervisor Resolution)
                    </div>
                  </div>
                </div>
              )}

              {(selectedPath === 'all' || selectedPath === 'path3') && (
                <div className={`p-4 rounded-xl border mb-4 transition-all ${
                  selectedPath === 'path3' ? 'border-emerald-500/50 bg-emerald-500/5' : isDark ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      BRANCH 3: SQLITE LIVE ORDER TOOL
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary-light font-mono font-semibold">
                      START: Order #7721
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 font-mono font-semibold">
                      guardrail_and_router
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-semibold">
                      live_order_tool (SQLite SELECT)
                    </div>
                    <ArrowRight className="w-4 h-4 text-slate-500" />
                    <div className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 font-mono font-semibold">
                      END (Verified Carrier & Delivery Status)
                    </div>
                  </div>
                </div>
              )}

              {(selectedPath === 'all' || selectedPath === 'path4') && (
                <div className={`p-4 rounded-xl border transition-all ${
                  selectedPath === 'path4' ? 'border-cyan-500/50 bg-cyan-500/5' : isDark ? 'border-slate-800 bg-[#111827]' : 'border-slate-200 bg-white'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                      BRANCH 4: HYBRID RRF → FLASHRANK → CRAG SELF-CORRECTION LOOP
                    </span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-primary-light font-mono font-semibold">
                        START: Policy Query
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono font-semibold">
                        lookup (Semantic Cache)
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div className="px-3 py-2 rounded-lg bg-blue-500/15 border border-blue-500/30 text-blue-400 font-mono font-semibold">
                        retrieve (Chroma + BM25 RRF + FlashRank)
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-500" />
                      <div className="px-3 py-2 rounded-lg bg-purple-500/15 border border-purple-500/30 text-purple-400 font-mono font-semibold">
                        grade_documents (CRAG)
                      </div>
                    </div>

                    {/* Conditional CRAG loop */}
                    <div className="pl-6 border-l-2 border-dashed border-cyan-500/40 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          IF Relevant (Pass)
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-mono text-slate-300">generate (ChatGroq LLM) → END</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                          IF Irrelevant (Fail)
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                        <span className="font-mono text-slate-300">rewrite_query (Query Reformulation) → loop back to retrieve (max_retries=2)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Technical Specifications Table */}
            <div className={`p-5 rounded-2xl border ${
              isDark ? 'bg-[#111827] border-[#1E293B]' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="text-[11px] font-bold uppercase tracking-wider mb-3 text-slate-400 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-primary-light" />
                <span>Production System Specifications</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#090D16] border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-accent-cyan" />
                    Hybrid Dense + Lexical Fusion
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Combines ChromaDB 384-dimensional cosine embeddings (<code className="font-mono text-primary-light">all-MiniLM-L6-v2</code>) with BM25Okapi lexical tokenization using Reciprocal Rank Fusion (constant <code className="font-mono">k=60</code>).
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#090D16] border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-accent-purple" />
                    FlashRank Cross-Encoder Reranker
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Ultra-fast in-memory cross-encoder reranker (<code className="font-mono text-purple-400">ms-marco-MiniLM-L-12-v2</code>) filtering the top fused chunks down to the highest-scoring 4 chunks in under 35ms.
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#090D16] border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 text-accent-emerald" />
                    Corrective RAG (CRAG) Policy
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Structured binary relevance grader (<code className="font-mono text-emerald-400">GradeResult</code>) with automatic semantic query rewrite and bounded execution (<code className="font-mono">max_retries=2</code>) preventing infinite retrieval loops.
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-[#090D16] border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    HITL State Checkpointing & Resume
                  </div>
                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    State persisted via thread-scoped <code className="font-mono text-amber-400">MemorySaver</code> checkpoints with <code className="font-mono">interrupt_before</code>. Supervisors resume execution via atomic state update at <code className="font-mono">/api/chat/resume</code>.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={`p-4 border-t flex items-center justify-between text-xs ${
            isDark ? 'border-[#1E293B] bg-[#111827]/70 text-slate-400' : 'border-[#E2E8F0] bg-slate-50 text-slate-500'
          }`}>
            <span className="font-mono text-[11px]">
              ENGINE: Groq LLM + LangGraph StateGraph + ChromaDB + FlashRank + SQLite
            </span>
            <button
              onClick={onClose}
              className={`px-4 py-1.5 rounded-xl border font-semibold transition-all ${
                isDark 
                  ? 'bg-white/10 hover:bg-white/15 text-white border-white/10' 
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200 shadow-xs'
              }`}
            >
              Done
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
