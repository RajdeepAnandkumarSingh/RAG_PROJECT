import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Shield, Database, Cpu, 
  CheckCircle, AlertTriangle, UserCheck, 
  Send, Layers, RefreshCw, 
  FileText, Zap, ChevronDown, ChevronUp,
  Server, GitBranch, Terminal, Clock
} from 'lucide-react';

export default function RetrievalInspector({
  activeStages,
  retrievedChunks = [],
  intent = "",
  onSupervisorResume,
  isResuming = false,
  theme = 'dark',
  telemetry = null
}) {
  const [overrideText, setOverrideText] = useState("");
  const [expandedChunkIdx, setExpandedChunkIdx] = useState(0);
  const isDark = theme === 'dark';
  const isPaused = activeStages?.hitl?.isPaused;

  const handleResumeSubmit = (e) => {
    e.preventDefault();
    if (!overrideText.trim() || isResuming) return;
    if (onSupervisorResume) {
      onSupervisorResume(activeStages?.hitl?.threadId, overrideText);
      setOverrideText("");
    }
  };

  const toggleChunkExpand = (idx) => {
    setExpandedChunkIdx(prev => prev === idx ? -1 : idx);
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

  return (
    <motion.aside 
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className={`w-80 border-r flex flex-col z-20 h-screen overflow-hidden transition-colors ${
        isDark 
          ? 'bg-[#090D16]/95 border-[#1E293B] text-slate-100' 
          : 'bg-[#FFFFFF]/95 border-[#E2E8F0] text-slate-900 shadow-sm'
      }`}
    >
      {/* Header */}
      <div className={`p-5 border-b flex items-center justify-between ${
        isDark ? 'border-[#1E293B] bg-[#111827]/40' : 'border-[#E2E8F0] bg-slate-50/60'
      }`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center border border-primary/20">
            <Activity className="text-primary w-4 h-4" />
          </div>
          <div>
            <h2 className={`text-xs font-bold uppercase tracking-widest ${
              isDark ? 'text-slate-200' : 'text-slate-900'
            }`}>
              Retrieval Inspector
            </h2>
            <p className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              LangGraph Live Telemetry
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse" />
          <span className={`text-[10px] font-mono font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
            LIVE
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5 scrollbar-hide">
        {/* Pipeline Execution Node Badges */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest px-0.5">
            <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <Layers className="w-3 h-3 text-primary-light" />
              Pipeline Node Tracing
            </span>
            <span className={`font-mono text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
              4 NODES
            </span>
          </div>

          <div className="space-y-2">
            {/* 1. Guardrail & Routing Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.guardrail?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.guardrail?.status === 'flagged'
                ? isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
                : activeStages?.guardrail?.status === 'completed'
                ? isDark ? 'bg-[#111827] border-[#1E293B]' : 'bg-white border-slate-200 shadow-xs'
                : isDark ? 'bg-[#111827]/40 border-white/5 opacity-60' : 'bg-slate-50/70 border-slate-200/80 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                  <Shield className="w-3.5 h-3.5 text-primary-light" /> Guardrail & Routing
                </span>
                <div className="flex items-center gap-1.5">
                  {/* Latency Badge */}
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                    isDark 
                      ? 'bg-primary/10 text-primary-light border-primary/20' 
                      : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                  }`}>
                    <Clock className="w-2.5 h-2.5" />
                    {activeStages?.guardrail?.latency ? `${activeStages.guardrail.latency}ms` : '142ms'}
                  </span>
                  {/* Status Badge */}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                    activeStages?.guardrail?.classification === 'prompt_injection'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : activeStages?.guardrail?.classification === 'escalation_hitl'
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : isDark
                      ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}>
                    {activeStages?.guardrail?.classification || 'IDLE'}
                  </span>
                </div>
              </div>
              {activeStages?.guardrail?.pii_redacted && (
                <div className={`mt-1 flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border ${
                  isDark 
                    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' 
                    : 'text-amber-700 bg-amber-50 border-amber-200'
                }`}>
                  <AlertTriangle className="w-3 h-3 flex-shrink-0" /> PII Auto-Redacted
                </div>
              )}
            </div>

            {/* 2. Semantic Cache Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.cache?.status === 'hit'
                ? isDark 
                  ? 'bg-accent-emerald/10 border-accent-emerald/40 shadow-sm shadow-accent-emerald/10'
                  : 'bg-emerald-50 border-emerald-300 shadow-xs'
                : activeStages?.cache?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.cache?.status === 'miss'
                ? isDark ? 'bg-[#111827] border-[#1E293B]' : 'bg-white border-slate-200'
                : isDark ? 'bg-[#111827]/40 border-white/5 opacity-60' : 'bg-slate-50/70 border-slate-200/80 opacity-60'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                  <Zap className={`w-3.5 h-3.5 ${activeStages?.cache?.status === 'hit' ? 'text-accent-emerald animate-pulse' : 'text-amber-500'}`} /> 
                  Semantic Cache
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                    isDark 
                      ? 'bg-primary/10 text-primary-light border-primary/20' 
                      : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                  }`}>
                    <Clock className="w-2.5 h-2.5" />
                    {activeStages?.cache?.latency ? `${activeStages.cache.latency}ms` : '18ms'}
                  </span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                    activeStages?.cache?.status === 'hit'
                      ? isDark
                        ? 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                        : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : activeStages?.cache?.status === 'miss'
                      ? isDark ? 'bg-white/10 text-slate-400 border border-white/10' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      : isDark ? 'bg-white/5 text-slate-500 border border-white/5' : 'bg-slate-100 text-slate-400 border border-slate-200'
                  }`}>
                    {activeStages?.cache?.status === 'hit'
                      ? `HIT (${Math.round((activeStages?.cache?.similarity || 0.94) * 100)}%)`
                      : activeStages?.cache?.status === 'miss'
                      ? 'MISS'
                      : activeStages?.cache?.status === 'running'
                      ? 'LOOKUP'
                      : 'IDLE'}
                  </span>
                </div>
              </div>
              {activeStages?.cache?.status === 'hit' && (
                <div 
                  className={`mt-1 flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded border truncate ${
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
            </div>

            {/* 3. Hybrid Retrieval Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.retrieval?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.retrieval?.status === 'completed'
                ? isDark ? 'bg-[#111827] border-[#1E293B]' : 'bg-white border-slate-200 shadow-xs'
                : isDark ? 'bg-[#111827]/40 border-white/5 opacity-60' : 'bg-slate-50/70 border-slate-200/80 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                  <Database className="w-3.5 h-3.5 text-accent-cyan" /> Hybrid Retrieve
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                    isDark 
                      ? 'bg-primary/10 text-primary-light border-primary/20' 
                      : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                  }`}>
                    <Clock className="w-2.5 h-2.5" />
                    {activeStages?.retrieval?.latency ? `${activeStages.retrieval.latency}ms` : '185ms'}
                  </span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                    isDark 
                      ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/25' 
                      : 'bg-cyan-50 text-cyan-700 border-cyan-200 font-semibold'
                  }`}>
                    {retrievedChunks.length > 0 ? `${retrievedChunks.length} Chunks` : 'Dense + BM25'}
                  </span>
                </div>
              </div>
            </div>

            {/* 4. CRAG Document Relevance Grader Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.crag?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.crag?.status === 'relevant'
                ? isDark ? 'bg-accent-emerald/10 border-accent-emerald/30' : 'bg-emerald-50 border-emerald-200'
                : activeStages?.crag?.status === 'irrelevant'
                ? isDark ? 'bg-amber-500/10 border-amber-500/30' : 'bg-amber-50 border-amber-200'
                : isDark ? 'bg-[#111827]/40 border-white/5 opacity-60' : 'bg-slate-50/70 border-slate-200/80 opacity-60'
            }`}>
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-bold flex items-center gap-1.5 ${
                  isDark ? 'text-slate-200' : 'text-slate-800'
                }`}>
                  <Cpu className="w-3.5 h-3.5 text-accent-purple" /> CRAG Document Grader
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border flex items-center gap-0.5 ${
                    isDark 
                      ? 'bg-primary/10 text-primary-light border-primary/20' 
                      : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                  }`}>
                    <Clock className="w-2.5 h-2.5" />
                    {activeStages?.crag?.latency ? `${activeStages.crag.latency}ms` : '210ms'}
                  </span>
                  <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${
                    activeStages?.crag?.is_relevant === true
                      ? isDark
                        ? 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30'
                        : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      : activeStages?.crag?.is_relevant === false
                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                      : isDark
                      ? 'bg-white/5 text-slate-400 border-white/10'
                      : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {activeStages?.crag?.is_relevant === true
                      ? `Pass (${Math.round((activeStages?.crag?.score || 1.0) * 100)}%)`
                      : activeStages?.crag?.is_relevant === false
                      ? `Retry #${activeStages?.crag?.retry_count || 1}`
                      : 'Awaiting'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* INLINE HUMAN AGENT OVERRIDE CARD (HITL) */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={`p-4 rounded-2xl border shadow-lg space-y-3 ${
                isDark 
                  ? 'bg-gradient-to-b from-amber-500/15 to-amber-500/5 border-amber-500/30 shadow-amber-500/5' 
                  : 'bg-amber-50/90 border-amber-300 shadow-amber-500/10'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-wider ${
                  isDark ? 'text-amber-400' : 'text-amber-800'
                }`}>
                  <UserCheck className="w-4 h-4 animate-pulse" />
                  <span>Human Override</span>
                </div>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded-full border animate-pulse ${
                  isDark 
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30' 
                    : 'bg-amber-200 text-amber-900 border-amber-300'
                }`}>
                  HITL PAUSED
                </span>
              </div>

              <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                {activeStages?.hitl?.reason || "Pipeline interrupted before human_review_node. Supervisor input required to resume."}
              </p>

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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Top-4 FlashRank Reranked Chunks OR Active Engine Topology */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest px-0.5">
            <span className={`flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              <Database className="w-3 h-3 text-primary-light" />
              <span>Top-4 FlashRank Chunks</span>
            </span>
            <span className={`text-[9px] px-2 py-0.5 rounded-full border font-mono ${
              isDark 
                ? 'bg-primary/20 text-primary-light border-primary/30' 
                : 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
            }`}>
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
                      transition={{ delay: idx * 0.05 }}
                      className={`p-3 rounded-xl border transition-all ${
                        isDark 
                          ? 'bg-[#111827] hover:bg-[#161F30] border-[#1E293B]' 
                          : 'bg-white hover:bg-slate-50 border-slate-200 shadow-xs'
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
                                isDark ? 'text-slate-200' : 'text-slate-800'
                              }`} 
                              title={chunk.source || `CHUNK_${idx + 1}`}
                            >
                              {chunk.source || `CHUNK_${idx + 1}`}
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border ${getScoreBadgeStyle(score)}`}>
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
                          <div className={`w-full h-1.5 rounded-full overflow-hidden ${
                            isDark ? 'bg-slate-800' : 'bg-slate-200'
                          }`}>
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
                        <p className={`text-xs leading-relaxed ${
                          isDark ? 'text-slate-400' : 'text-slate-600'
                        } ${isExpanded ? '' : 'line-clamp-2'}`}>
                          {chunk.content}
                        </p>
                        {isExpanded && chunk.metadata && (
                          <div className="mt-2 pt-1.5 border-t border-slate-700/20 flex flex-wrap gap-1.5 text-[9px] font-mono text-slate-500">
                            {chunk.metadata.source && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/30">
                                src: {chunk.metadata.source}
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-slate-800/40 border border-slate-700/30">
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
              /* ACTIVE ENGINE TOPOLOGY CARD (When 0 / 4 chunks active - zero dead space) */
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className={`p-3.5 rounded-xl border space-y-3 ${
                  isDark 
                    ? 'bg-[#111827] border-[#1E293B]' 
                    : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-slate-700/20">
                  <span className={`text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}>
                    <Server className="w-3.5 h-3.5 text-primary-light" />
                    Active Engine Topology
                  </span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isDark ? 'bg-primary/15 text-primary-light' : 'bg-blue-50 text-blue-700 font-semibold'
                  }`}>
                    v2.0 PRO
                  </span>
                </div>

                <div className="space-y-2 text-[11px]">
                  {/* Embedding Model */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Embedding Model</span>
                    <span className={`font-mono text-[10px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      {telemetry?.embedding_model || 'all-MiniLM-L6-v2'}
                    </span>
                  </div>

                  {/* Cross-Encoder Reranker */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cross-Encoder</span>
                    <span className={`font-mono text-[10px] font-semibold ${isDark ? 'text-slate-200' : 'text-slate-800'}`}>
                      ms-marco-MiniLM-L-12
                    </span>
                  </div>

                  {/* CRAG Retry Policy */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>CRAG Policy</span>
                    <span className={`font-mono text-[10px] font-semibold text-accent-emerald`}>
                      max_retries = 2
                    </span>
                  </div>

                  {/* Langfuse Observability */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Langfuse Tracing</span>
                    <span className={`font-mono text-[10px] font-semibold flex items-center gap-1 text-accent-cyan`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse" />
                      Active (v2 Session)
                    </span>
                  </div>

                  {/* Hybrid Strategy */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Hybrid Strategy</span>
                    <span className={`font-mono text-[10px] font-semibold ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                      Dense + BM25 (RRF)
                    </span>
                  </div>
                </div>

                <div className={`pt-2 border-t border-slate-700/20 text-[10px] italic text-center ${
                  isDark ? 'text-slate-500' : 'text-slate-500'
                }`}>
                  Awaiting query execution to stream live chunks...
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Detected Intent Footer */}
      <div className={`p-4 border-t transition-colors ${
        isDark ? 'border-[#1E293B] bg-[#090D16]' : 'border-[#E2E8F0] bg-slate-50'
      }`}>
        <div className={`text-[10px] uppercase font-bold mb-1.5 tracking-widest ${
          isDark ? 'text-slate-400' : 'text-slate-600'
        }`}>
          Active Thread Intent
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border ${
          intent === 'escalation_hitl' || isPaused
            ? isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-amber-50 text-amber-800 border-amber-200'
            : intent === 'prompt_injection'
            ? isDark ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-red-50 text-red-800 border-red-200'
            : intent
            ? isDark ? 'bg-accent-emerald/10 text-accent-emerald border-accent-emerald/20' : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : isDark ? 'bg-white/5 text-slate-500 border-white/5' : 'bg-white text-slate-400 border-slate-200'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            intent === 'escalation_hitl' || isPaused 
              ? 'bg-amber-400 animate-ping' 
              : intent === 'prompt_injection'
              ? 'bg-red-400'
              : intent
              ? 'bg-accent-emerald'
              : 'bg-slate-500'
          }`} />
          <span className="font-mono text-[11px] truncate">{intent || "Listening for triggers..."}</span>
        </div>
      </div>
    </motion.aside>
  );
}
