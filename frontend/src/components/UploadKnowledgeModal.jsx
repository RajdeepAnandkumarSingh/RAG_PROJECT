import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  UploadCloud,
  FileText,
  Database,
  CheckCircle,
  AlertTriangle,
  Activity,
  Sparkles,
  ShieldAlert,
  ShieldCheck,
  Lock,
  LogIn,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const ACCEPTED_EXTENSIONS = '.pdf,.xlsx,.xls,.csv,.md,.txt';

export default function UploadKnowledgeModal({
  isOpen,
  onClose,
  theme = 'dark',
  uploading = false,
  uploadStatus = null,
  onSelectFile,
  onOpenAuthModal,
}) {
  const { user, isSupervisor, loginAsDemo, activeOrg, refreshPresets } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [demoSigningIn, setDemoSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const modalFileInputRef = useRef(null);
  const isDark = theme === 'dark';

  useEffect(() => {
    if (isOpen) {
      setAuthError('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !uploading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, uploading, onClose]);

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

  const triggerUpload = async (file) => {
    if (!file || !onSelectFile) return;
    const ok = await onSelectFile(file);
    if (ok) {
      await refreshPresets(activeOrg?.slug);
    }
  };

  const handleFileChange = async (e) => {
    if (!isSupervisor) return;
    const file = e.target.files?.[0];
    if (modalFileInputRef.current) {
      modalFileInputRef.current.value = '';
    }
    if (file) {
      await triggerUpload(file);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (uploading || !isSupervisor) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      await triggerUpload(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!uploading && isSupervisor) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

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
            onClick={() => !uploading && onClose()}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Modal Window */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.8 }}
            className={`relative w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-md ${
              isDark
                ? 'bg-[#0B1120]/95 border-[#1E293B] text-slate-100 shadow-emerald-950/30'
                : 'bg-white/95 border-emerald-200/80 text-slate-900 shadow-emerald-900/10'
            }`}
          >
            {/* Header */}
            <div
              className={`p-5 border-b flex items-center justify-between ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/80'
                  : 'border-emerald-100 bg-emerald-50/40'
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
                  <UploadCloud className="w-5 h-5 text-accent-emerald" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-tight">
                      Upload Knowledge Base
                    </h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        isDark
                          ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      Hybrid Ingest
                    </span>
                  </div>
                  <p
                    className={`text-xs ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Index into <strong className={isDark ? 'text-slate-200' : 'text-slate-800'}>{activeOrg?.name || 'Nexus Enterprise'}</strong> (ChromaDB + BM25 or SQLite).
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
                className={`p-2 rounded-xl border transition-colors disabled:opacity-40 ${
                  isDark
                    ? 'border-white/10 hover:bg-white/10 text-slate-400 hover:text-white'
                    : 'border-emerald-200/80 hover:bg-emerald-50 text-slate-600 hover:text-slate-900'
                }`}
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* RBAC Supervisor Clearance Notice for Guest / Analyst */}
              {!isSupervisor && (
                <div
                  className={`p-4 rounded-2xl border space-y-3 ${
                    isDark
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-amber-50/90 border-amber-300 text-amber-900'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <div className="text-xs font-bold uppercase tracking-wider">
                          Supervisor Clearance Required
                        </div>
                        <p
                          className={`text-xs leading-relaxed ${
                            isDark ? 'text-slate-300' : 'text-amber-900/85'
                          }`}
                        >
                          {user
                            ? `Signed in as ${user.full_name || user.email} (ANALYST). Document ingestion into ChromaDB, BM25, and SQLite requires SUPERVISOR privileges.`
                            : 'You are currently in Guest Mode. Sign in with a Supervisor account to upload and index knowledge base documents.'}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border flex-shrink-0 ${
                        isDark
                          ? 'bg-amber-500/20 border-amber-500/35 text-amber-300'
                          : 'bg-amber-100 border-amber-300 text-amber-900'
                      }`}
                    >
                      {user ? 'ANALYST' : 'GUEST'}
                    </span>
                  </div>

                  {cooldownSeconds > 0 && (
                    <div className="text-[11px] font-mono font-semibold text-red-400">
                      Security cooldown active — retry in {cooldownSeconds}s
                    </div>
                  )}

                  {authError && cooldownSeconds === 0 && (
                    <div className="text-[11px] font-medium text-red-400">{authError}</div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={handleDemoSupervisorLogin}
                      disabled={demoSigningIn || cooldownSeconds > 0}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 active:scale-[0.98] text-slate-950 font-bold text-xs transition-all disabled:opacity-45 disabled:pointer-events-none shadow-sm"
                    >
                      {demoSigningIn ? (
                        <Activity className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5" />
                      )}
                      <span>Sign In as Demo Supervisor</span>
                    </button>

                    {onOpenAuthModal && (
                      <button
                        type="button"
                        onClick={onOpenAuthModal}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                          isDark
                            ? 'bg-white/5 hover:bg-white/10 border-white/15 text-slate-200'
                            : 'bg-white hover:bg-amber-100/60 border-amber-300 text-amber-900'
                        }`}
                      >
                        <LogIn className="w-3.5 h-3.5" />
                        <span>Sign In with Credentials</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              <input
                type="file"
                ref={modalFileInputRef}
                onChange={handleFileChange}
                accept={ACCEPTED_EXTENSIONS}
                className="hidden"
              />

              {/* Drag & Drop Zone */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => isSupervisor && !uploading && modalFileInputRef.current?.click()}
                className={`group relative rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
                  !isSupervisor
                    ? isDark
                      ? 'border-slate-800 bg-[#0F1629]/35 opacity-55 cursor-not-allowed'
                      : 'border-slate-200 bg-slate-50/70 opacity-60 cursor-not-allowed'
                    : uploading
                    ? 'opacity-70 cursor-wait'
                    : isDragging
                    ? isDark
                      ? 'border-accent-emerald bg-accent-emerald/10 scale-[1.01] cursor-pointer'
                      : 'border-emerald-500 bg-emerald-50/90 scale-[1.01] cursor-pointer'
                    : isDark
                    ? 'border-slate-700/80 bg-[#0F1629]/60 hover:border-accent-emerald/60 hover:bg-[#131C33]/80 cursor-pointer'
                    : 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-400 hover:bg-emerald-50/70 cursor-pointer'
                }`}
              >
                <div className="flex flex-col items-center gap-3">
                  <div
                    className={`w-12 h-12 rounded-2xl border flex items-center justify-center transition-transform ${
                      isSupervisor ? 'group-hover:scale-105' : ''
                    } ${
                      !isSupervisor
                        ? isDark
                          ? 'bg-slate-800/70 border-slate-700 text-slate-400'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                        : isDark
                        ? 'bg-accent-emerald/15 border-accent-emerald/30 text-accent-emerald'
                        : 'bg-white border-emerald-200 text-emerald-600 shadow-xs'
                    }`}
                  >
                    {!isSupervisor ? (
                      <Lock className="w-6 h-6" />
                    ) : uploading ? (
                      <Activity className="w-6 h-6 animate-spin" />
                    ) : (
                      <UploadCloud className="w-6 h-6" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <p
                      className={`text-sm font-bold ${
                        isDark ? 'text-slate-100' : 'text-slate-900'
                      }`}
                    >
                      {!isSupervisor
                        ? 'Upload Locked — Supervisor Clearance Required'
                        : uploading
                        ? 'Indexing knowledge artifact...'
                        : 'Drop your file here, or click to browse'}
                    </p>
                    <p
                      className={`text-xs ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Supports PDF, Markdown, Text, Excel (.xlsx/.xls), and CSV
                    </p>
                  </div>

                  <span
                    className={`mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
                      !isSupervisor
                        ? isDark
                          ? 'bg-slate-800/70 border-slate-700 text-slate-400'
                          : 'bg-slate-100 border-slate-200 text-slate-500'
                        : isDark
                        ? 'bg-accent-emerald/15 border-accent-emerald/30 text-accent-emerald group-hover:bg-accent-emerald/25'
                        : 'bg-emerald-600 border-emerald-600 text-white group-hover:bg-emerald-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {isSupervisor ? 'Select Document' : 'Supervisor Required'}
                  </span>
                </div>
              </div>

              {/* Dual Routing Legend */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    isDark
                      ? 'bg-[#0F1629]/70 border-[#1E293B]'
                      : 'bg-emerald-50/45 border-emerald-200/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <FileText className="w-3.5 h-3.5 text-accent-cyan" />
                    <span>Unstructured Docs</span>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <code className="font-mono">.pdf, .md, .txt</code> chunked and
                    embedded into ChromaDB + BM25 RRF index.
                  </p>
                </div>

                <div
                  className={`p-3 rounded-xl border text-xs ${
                    isDark
                      ? 'bg-[#0F1629]/70 border-[#1E293B]'
                      : 'bg-emerald-50/45 border-emerald-200/70'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-1">
                    <Database className="w-3.5 h-3.5 text-accent-emerald" />
                    <span>Structured Tables</span>
                  </div>
                  <p
                    className={`text-[11px] leading-relaxed ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    <code className="font-mono">.xlsx, .xls, .csv</code> ingested
                    directly into SQLite B-Tree tables.
                  </p>
                </div>
              </div>

              {/* Live Upload Status Feedback */}
              <AnimatePresence mode="wait">
                {uploadStatus && (
                  <motion.div
                    key={uploadStatus.type + uploadStatus.message}
                    initial={{ opacity: 0, y: 6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                    className={`flex items-center gap-2.5 p-3.5 rounded-xl border text-xs font-medium ${
                      uploadStatus.type === 'success'
                        ? isDark
                          ? 'bg-accent-emerald/15 border-accent-emerald/35 text-accent-emerald'
                          : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : uploadStatus.type === 'error'
                        ? isDark
                          ? 'bg-red-500/15 border-red-500/35 text-red-400'
                          : 'bg-red-50 border-red-300 text-red-700'
                        : isDark
                        ? 'bg-primary/15 border-primary/35 text-primary-light'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    }`}
                  >
                    {uploadStatus.type === 'uploading' && (
                      <Activity className="w-4 h-4 animate-spin flex-shrink-0" />
                    )}
                    {uploadStatus.type === 'success' && (
                      <CheckCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    {uploadStatus.type === 'error' && (
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="truncate">{uploadStatus.message}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              className={`px-6 py-3.5 border-t flex items-center justify-between text-xs ${
                isDark
                  ? 'border-[#1E293B] bg-[#0F1629]/80 text-slate-400'
                  : 'border-emerald-100 bg-emerald-50/40 text-slate-600'
              }`}
            >
              <span className="font-mono text-[10px]">
                POST /api/ingest/upload
              </span>
              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
                className={`px-4 py-1.5 rounded-xl border font-semibold transition-all disabled:opacity-40 ${
                  isDark
                    ? 'bg-white/10 hover:bg-white/15 text-white border-white/10'
                    : 'bg-white hover:bg-emerald-50 text-slate-800 border-emerald-200 shadow-xs'
                }`}
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
