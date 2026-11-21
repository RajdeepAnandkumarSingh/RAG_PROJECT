import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Activity, Shield, Database, Cpu, 
  CheckCircle, AlertTriangle, UserCheck, 
  Send, Layers, Sparkles, RefreshCw, 
  FileText, CornerDownRight 
} from 'lucide-react';

export default function RetrievalInspector({
  activeStages,
  retrievedChunks = [],
  intent = "",
  onSupervisorResume,
  isResuming = false
}) {
  const [overrideText, setOverrideText] = useState("");
  const isPaused = activeStages?.hitl?.isPaused;

  const handleResumeSubmit = (e) => {
    e.preventDefault();
    if (!overrideText.trim() || isResuming) return;
    if (onSupervisorResume) {
      onSupervisorResume(activeStages?.hitl?.threadId, overrideText);
      setOverrideText("");
    }
  };

  const getScoreBadgeColor = (score) => {
    if (score >= 0.8) return 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30';
    if (score >= 0.5) return 'bg-accent-cyan/20 text-accent-cyan border-accent-cyan/30';
    return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
  };

  return (
    <motion.aside 
      initial={{ x: -300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="w-80 glass-panel-heavy border-r border-white/5 flex flex-col z-20 h-screen overflow-hidden"
    >
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
            <Activity className="text-primary w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Retrieval Inspector</h2>
            <p className="text-[10px] text-gray-500 font-mono">LangGraph Live SSE</p>
          </div>
        </div>
        <div className="w-2.5 h-2.5 rounded-full bg-accent-emerald animate-pulse" title="Engine Connected" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-hide">
        {/* Pipeline Execution Node Badges */}
        <div className="space-y-3">
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
            <Layers className="w-3 h-3 text-primary-light" />
            <span>Pipeline Node Tracing</span>
          </div>

          <div className="space-y-2">
            {/* 1. Guardrail Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.guardrail?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.guardrail?.status === 'flagged'
                ? 'bg-red-500/10 border-red-500/30'
                : activeStages?.guardrail?.status === 'completed'
                ? 'bg-white/5 border-white/10'
                : 'bg-white/5 border-white/5 opacity-50'
            }`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-primary-light" /> Guardrail & Routing
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono uppercase font-semibold ${
                  activeStages?.guardrail?.classification === 'prompt_injection'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : activeStages?.guardrail?.classification === 'escalation_hitl'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-accent-emerald/20 text-accent-emerald border border-accent-emerald/30'
                }`}>
                  {activeStages?.guardrail?.classification || 'IDLE'}
                </span>
              </div>
              {activeStages?.guardrail?.pii_redacted && (
                <div className="mt-1 flex items-center gap-1 text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  <AlertTriangle className="w-3 h-3" /> PII Redacted
                </div>
              )}
            </div>

            {/* 2. Hybrid Retrieval Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.retrieval?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.retrieval?.status === 'completed'
                ? 'bg-white/5 border-white/10'
                : 'bg-white/5 border-white/5 opacity-50'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-accent-cyan" /> Hybrid Retrieve
                </span>
                <span className="text-[9px] font-mono text-accent-cyan px-2 py-0.5 bg-accent-cyan/10 rounded border border-accent-cyan/20">
                  {retrievedChunks.length > 0 ? `${retrievedChunks.length} Chunks` : 'Chroma + BM25'}
                </span>
              </div>
            </div>

            {/* 3. CRAG Grading Node */}
            <div className={`p-3 rounded-xl border transition-all ${
              activeStages?.crag?.status === 'running'
                ? 'bg-primary/10 border-primary/40 animate-pulse'
                : activeStages?.crag?.status === 'relevant'
                ? 'bg-accent-emerald/10 border-accent-emerald/30'
                : activeStages?.crag?.status === 'irrelevant'
                ? 'bg-amber-500/10 border-amber-500/30'
                : 'bg-white/5 border-white/5 opacity-50'
            }`}>
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-gray-300 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-accent-purple" /> CRAG Document Grader
                </span>
                <span className={`text-[9px] font-mono px-2 py-0.5 rounded border font-semibold ${
                  activeStages?.crag?.is_relevant === true
                    ? 'bg-accent-emerald/20 text-accent-emerald border-accent-emerald/30'
                    : activeStages?.crag?.is_relevant === false
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-white/5 text-gray-400 border-white/10'
                }`}>
                  {activeStages?.crag?.is_relevant === true
                    ? `Pass (${Math.round((activeStages?.crag?.score || 0) * 100)}%)`
                    : activeStages?.crag?.is_relevant === false
                    ? `Retry #${activeStages?.crag?.retry_count || 1}`
                    : 'Awaiting'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* INLINE HUMAN AGENT OVERRIDE CARD (HITL) */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="p-4 bg-gradient-to-b from-amber-500/15 to-amber-500/5 rounded-2xl border border-amber-500/30 shadow-lg space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase tracking-wider">
                  <UserCheck className="w-4 h-4 animate-pulse" />
                  <span>Human Override</span>
                </div>
                <span className="text-[9px] font-mono px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full border border-amber-500/30 animate-pulse">
                  HITL PAUSED
                </span>
              </div>

              <p className="text-[11px] text-gray-300 leading-relaxed">
                {activeStages?.hitl?.reason || "Pipeline interrupted before human_review_node. Supervisor input required to resume."}
              </p>

              <form onSubmit={handleResumeSubmit} className="space-y-2">
                <textarea
                  rows={3}
                  value={overrideText}
                  onChange={(e) => setOverrideText(e.target.value)}
                  placeholder="Enter supervisor override or instructions..."
                  className="w-full bg-dark-950/80 border border-amber-500/20 rounded-xl p-2.5 text-xs text-gray-100 placeholder:text-gray-500 focus:outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30 resize-none font-medium"
                />
                <button
                  type="submit"
                  disabled={isResuming || !overrideText.trim()}
                  className="w-full py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.99] text-dark-950 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-40 disabled:pointer-events-none shadow-md shadow-amber-500/20"
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

        {/* Top-4 FlashRank Reranked Chunks */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              <Database className="w-3 h-3 text-primary-light" />
              <span>Top-4 FlashRank Chunks</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary-light rounded-full border border-primary/30 font-mono">
              {retrievedChunks.length} / 4
            </span>
          </div>

          <div className="space-y-3">
            {retrievedChunks.length > 0 ? (
              <AnimatePresence>
                {retrievedChunks.map((chunk, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.08 }}
                    className="p-3.5 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5">
                        <FileText className="w-3 h-3 text-primary-light" />
                        <span className="text-[10px] font-mono text-gray-300 font-bold truncate max-w-[120px]" title={chunk.source || `CHUNK_${idx + 1}`}>
                          {chunk.source || `CHUNK_${idx + 1}`}
                        </span>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.2 rounded border ${getScoreBadgeColor(chunk.score || 0)}`}>
                        {chunk.score ? chunk.score.toFixed(4) : "0.0000"}
                      </span>
                    </div>

                    <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed group-hover:text-gray-200 transition-colors">
                      {chunk.content}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            ) : (
              <div className="py-10 flex flex-col items-center justify-center text-center opacity-30">
                <Database className="w-10 h-10 mb-3 text-gray-600" />
                <p className="text-xs px-6 italic">Awaiting knowledge retrieval triggers...</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Detected Intent Footer */}
      <div className="p-4 border-t border-white/5 bg-dark-950/50">
        <div className="text-[10px] text-gray-500 uppercase font-bold mb-2 tracking-widest">
          Active Thread Intent
        </div>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${
          intent === 'escalation_hitl' || isPaused
            ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            : intent === 'prompt_injection'
            ? 'bg-red-500/10 text-red-400 border border-red-500/20'
            : intent
            ? 'bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20'
            : 'bg-white/5 text-gray-500 border border-white/10'
        }`}>
          <div className={`w-2 h-2 rounded-full ${
            intent === 'escalation_hitl' || isPaused 
              ? 'bg-amber-400 animate-ping' 
              : intent === 'prompt_injection'
              ? 'bg-red-400'
              : 'bg-accent-emerald'
          }`} />
          <span className="font-mono text-[11px] truncate">{intent || "Listening..."}</span>
        </div>
      </div>
    </motion.aside>
  );
}
