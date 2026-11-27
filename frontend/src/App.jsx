import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Shield, ShieldCheck, User, Bot, AlertTriangle, 
  CheckCircle, Cpu, 
  Layers, Database, Zap, Activity, 
  ChevronRight, Sparkles, MessageSquare,
  UploadCloud, FileText, Globe, RotateCcw, Lock,
  Sun, Moon, Terminal, LogIn, LogOut,
  Building2, ChevronDown, Check, PlusCircle
} from 'lucide-react';
import RetrievalInspector from './components/RetrievalInspector';
import PipelineArchitectureModal from './components/PipelineArchitectureModal';
import LivePipelineStrip from './components/LivePipelineStrip';
import UploadKnowledgeModal from './components/UploadKnowledgeModal';
import SpotlightTiltCard from './components/SpotlightTiltCard';
import AnimatedCounter from './components/AnimatedCounter';
import AuthModal from './components/AuthModal';
import { AuthProvider, DEFAULT_GUARDRAIL_PRESETS, useAuth } from './context/AuthContext';

const PRESET_GRID_VARIANTS = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.08,
    },
  },
};

const PRESET_CARD_VARIANTS = {
  hidden: { opacity: 0, y: 18, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 320,
      damping: 24,
      mass: 0.75,
    },
  },
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000")
  .trim()
  .replace(/\/+$/, "");

function createInitialStages(thread = "") {
  return {
    cache: { status: 'idle', hit: false, similarity: 0, matchedQuery: '', latency: null },
    guardrail: { status: 'idle', classification: '', pii_redacted: false, confidence: null, reasoning: '', latency: null },
    retrieval: { status: 'idle', count: 0, latency: null, sources: [] },
    flashrank: { status: 'idle', count: 0, topScores: [], latency: null },
    crag: { status: 'idle', is_relevant: null, score: 0, retry_count: 0, reasoning: '', latency: null },
    rewriter: { status: 'idle', retry_count: 0 },
    generator: { status: 'idle', latency: null, bypassed: false },
    safeRefusal: { status: 'idle', triggered: false, latency: null },
    orderTool: { status: 'idle', triggered: false, orderData: null, latency: null },
    hitl: { isPaused: false, resolved: false, reason: '', threadId: thread, latency: null }
  };
}

function decoratePresetCard(item) {
  const category = (item.category || item.badge || "HYBRID RAG").toUpperCase();
  const target = item.tech_tag || item.target || "ChromaDB + BM25";
  let icon = <RotateCcw className="w-3.5 h-3.5 text-accent-cyan" />;
  let largeIcon = <RotateCcw className="w-4 h-4 text-accent-cyan" />;
  let badgeStyleDark = "bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30";
  let badgeStyleLight = "bg-cyan-50 text-cyan-700 border-cyan-200";
  let hoverBorderDark = "hover:border-accent-cyan/40";
  let hoverBorderLight = "hover:border-cyan-400";

  if (category === "SQLITE TOOL") {
    icon = <Database className="w-3.5 h-3.5 text-accent-emerald" />;
    largeIcon = <Database className="w-4 h-4 text-accent-emerald" />;
    badgeStyleDark = "bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30";
    badgeStyleLight = "bg-emerald-50 text-emerald-700 border-emerald-200";
    hoverBorderDark = "hover:border-accent-emerald/40";
    hoverBorderLight = "hover:border-emerald-400";
  } else if (category === "PII GUARD") {
    icon = <Lock className="w-3.5 h-3.5 text-accent-purple" />;
    largeIcon = <Lock className="w-4 h-4 text-accent-purple" />;
    badgeStyleDark = "bg-accent-purple/15 text-accent-purple border-accent-purple/30";
    badgeStyleLight = "bg-purple-50 text-purple-700 border-purple-200";
    hoverBorderDark = "hover:border-accent-purple/40";
    hoverBorderLight = "hover:border-purple-400";
  } else if (category === "SECURITY") {
    icon = <Shield className="w-3.5 h-3.5 text-red-400" />;
    largeIcon = <Shield className="w-4 h-4 text-red-400" />;
    badgeStyleDark = "bg-red-500/15 text-red-400 border-red-500/30";
    badgeStyleLight = "bg-red-50 text-red-700 border-red-200";
    hoverBorderDark = "hover:border-red-500/40";
    hoverBorderLight = "hover:border-red-400";
  } else if (category === "HITL PAUSE") {
    icon = <MessageSquare className="w-3.5 h-3.5 text-amber-400" />;
    largeIcon = <MessageSquare className="w-5 h-5 text-amber-400" />;
    badgeStyleDark = "bg-amber-500/15 text-amber-400 border-amber-500/30";
    badgeStyleLight = "bg-amber-50 text-amber-700 border-amber-200";
    hoverBorderDark = "hover:border-amber-500/40";
    hoverBorderLight = "hover:border-amber-400";
  } else if (item.code === "TEST-02") {
    icon = <Globe className="w-3.5 h-3.5 text-accent-cyan" />;
    largeIcon = <Globe className="w-4 h-4 text-accent-cyan" />;
  } else if (item.code === "TEST-03") {
    icon = <AlertTriangle className="w-3.5 h-3.5 text-accent-cyan" />;
    largeIcon = <AlertTriangle className="w-4 h-4 text-accent-cyan" />;
  } else if (item.code === "TEST-04") {
    icon = <Cpu className="w-3.5 h-3.5 text-accent-cyan" />;
    largeIcon = <Cpu className="w-4 h-4 text-accent-cyan" />;
  }

  return {
    ...item,
    badge: category,
    target,
    icon,
    largeIcon,
    badgeStyleDark,
    badgeStyleLight,
    hoverBorderDark,
    hoverBorderLight,
  };
}

function NexusControlPlane() {
  const {
    user,
    authLoading,
    isSupervisor,
    organizations,
    activeOrg,
    switchOrg,
    tenantPresets,
    guardrailPresets,
    presetsLoading,
    authFetch,
    logout,
    loginAsDemo,
  } = useAuth();

  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nexus_rag_theme') || 'dark';
    }
    return 'dark';
  });

  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [retrievedChunks, setRetrievedChunks] = useState([]);
  const [intent, setIntent] = useState("");
  const [threadId, setThreadId] = useState(() => "session_" + Math.random().toString(36).substring(2, 9));
  const [isResuming, setIsResuming] = useState(false);
  const [showArchitectureModal, setShowArchitectureModal] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalBanner, setAuthModalBanner] = useState("");
  const [authModalTab, setAuthModalTab] = useState("signin");
  const [demoSupervisorBusy, setDemoSupervisorBusy] = useState(false);
  const [latestQuery, setLatestQuery] = useState("");
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [orgMenuCoords, setOrgMenuCoords] = useState({ top: 72, left: 16 });
  const orgTriggerRef = useRef(null);
  const orgDropdownRef = useRef(null);
  const prevOrgIdRef = useRef(activeOrg?.org_id || 'org_nexus');

  // Live Telemetry from /api/telemetry
  const [telemetry, setTelemetry] = useState({
    composite_score: 0.9404,
    faithfulness: 0.9583,
    answer_relevancy: 0.8732,
    context_precision: 0.9896,
    chroma_chunk_count: 86,
    bm25_status: "Active",
    sqlite_row_count: 26872,
    embedding_model: "all-MiniLM-L6-v2",
    reranker_model: "ms-marco-MiniLM-L-12-v2",
    groq_model: "openai/gpt-oss-120b"
  });

  // Dynamic custom prompts generated from file uploads
  const [customPrompts, setCustomPrompts] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  // Stage tracking for Retrieval Inspector, Live Strip, and Architecture Visualizer
  const [activeStages, setActiveStages] = useState(() => createInitialStages());

  const scrollRef = useRef(null);
  const isDark = theme === 'dark';

  // Synchronize theme to localStorage and document root
  useEffect(() => {
    localStorage.setItem('nexus_rag_theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('theme-light');
      document.documentElement.classList.remove('theme-dark');
    } else {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-light');
    }
  }, [theme]);

  // Fetch telemetry benchmarks scoped to active organization
  useEffect(() => {
    const fetchTelemetry = async () => {
      try {
        const resp = await axios.get(`${API_BASE_URL}/api/telemetry`, {
          headers: activeOrg?.slug ? { 'X-Org-Slug': activeOrg.slug } : undefined,
        });
        if (resp.data) {
          setTelemetry(resp.data);
        }
      } catch (err) {
        console.warn("Telemetry endpoint unavailable, using cached baseline metrics:", err);
      }
    };
    fetchTelemetry();
  }, [activeOrg?.slug]);

  // Reset conversation & inspector state whenever active organization changes
  useEffect(() => {
    const nextOrgId = activeOrg?.org_id || 'org_nexus';
    if (prevOrgIdRef.current !== nextOrgId) {
      prevOrgIdRef.current = nextOrgId;
      const freshThread = "session_" + Math.random().toString(36).substring(2, 9);
      setThreadId(freshThread);
      setMessages([]);
      setRetrievedChunks([]);
      setIntent("");
      setLatestQuery("");
      setCustomPrompts([]);
      setUploadStatus(null);
      setActiveStages(createInitialStages(freshThread));
    }
  }, [activeOrg?.org_id]);

  const updateOrgMenuPosition = useCallback(() => {
    if (!orgTriggerRef.current || typeof window === 'undefined') return;
    const rect = orgTriggerRef.current.getBoundingClientRect();
    const menuWidth = 264;
    const clampedLeft = Math.min(
      Math.max(12, rect.right - menuWidth),
      Math.max(12, window.innerWidth - menuWidth - 12)
    );
    setOrgMenuCoords({
      top: Math.round(rect.bottom + 8),
      left: Math.round(clampedLeft),
    });
  }, []);

  // Keep portal workspace dropdown aligned and close on outside click or Escape
  useEffect(() => {
    if (!orgMenuOpen) return;
    updateOrgMenuPosition();

    const handleOutside = (e) => {
      const inTrigger = orgTriggerRef.current?.contains(e.target);
      const inDropdown = orgDropdownRef.current?.contains(e.target);
      if (!inTrigger && !inDropdown) {
        setOrgMenuOpen(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setOrgMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updateOrgMenuPosition);
    window.addEventListener('scroll', updateOrgMenuPosition, true);
    return () => {
      window.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updateOrgMenuPosition);
      window.removeEventListener('scroll', updateOrgMenuPosition, true);
    };
  }, [orgMenuOpen, updateOrgMenuPosition]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const toggleTheme = () => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const openAuthModal = (banner = "", tab = "signin") => {
    setAuthModalBanner(banner);
    setAuthModalTab(tab);
    setShowAuthModal(true);
  };

  const handleWorkspaceSelect = async (org) => {
    setOrgMenuOpen(false);
    if (!org || org.org_id === activeOrg?.org_id || loading) return;
    await switchOrg(org);
  };

  const handleNewOrganizationClick = () => {
    setOrgMenuOpen(false);
    openAuthModal("", "register_org");
  };

  const handleInlineDemoSupervisor = async () => {
    if (demoSupervisorBusy) return;
    setDemoSupervisorBusy(true);
    try {
      await loginAsDemo('supervisor');
    } catch (err) {
      openAuthModal(err?.detail || err?.message || "Supervisor authentication failed.");
    } finally {
      setDemoSupervisorBusy(false);
    }
  };

  const executeChat = async (queryText, threadToUse) => {
    if (!queryText || !queryText.trim() || loading) return;

    const currentQuery = queryText.trim();
    const userMessage = { role: 'user', content: currentQuery, id: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setLatestQuery(currentQuery);
    setIntent("");
    setQuery("");
    setLoading(true);

    const activeThread = threadToUse || threadId;
    const requestStart = performance.now();
    let streamIntent = "";

    // Reset inspector & live strip stages for new query execution
    setActiveStages({
      ...createInitialStages(activeThread),
      cache: { status: 'running', hit: false, similarity: 0, matchedQuery: '', latency: null },
    });
    setRetrievedChunks([]);

    const botMsgId = Date.now() + 1;
    let botMessageCreated = false;

    try {
      const response = await authFetch(`${API_BASE_URL}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: currentQuery, thread_id: activeThread })
      });

      if (!response.ok || !response.body) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          if (!block.trim()) continue;

          let eventName = "message";
          let dataJson = null;

          const blockLines = block.split("\n");
          for (const line of blockLines) {
            if (line.startsWith("event: ")) {
              eventName = line.replace("event: ", "").trim();
            } else if (line.startsWith("data: ")) {
              try {
                dataJson = JSON.parse(line.replace("data: ", "").trim());
              } catch (err) {
                console.error("Failed to parse SSE data JSON:", err);
              }
            }
          }

          if (!dataJson) continue;

          // Compute client elapsed latency if server latency not provided
          const elapsedMs = Math.round(performance.now() - requestStart);
          const stageLatency = dataJson.latency_ms !== undefined ? dataJson.latency_ms : elapsedMs;

          // 1. Process Cache Hit
          if (eventName === "cache_hit" || dataJson.event === "cache_hit") {
            const similarity = dataJson.similarity || 1.0;
            const matchedQuery = dataJson.matched_query || dataJson.query || "";
            const chunks = dataJson.chunks || [];
            if (chunks.length > 0) {
              setRetrievedChunks(chunks);
            }
            setActiveStages(prev => ({
              ...prev,
              cache: {
                status: 'hit',
                hit: true,
                similarity: similarity,
                matchedQuery: matchedQuery,
                latency: stageLatency
              },
              flashrank: chunks.length > 0
                ? { status: 'bypassed', count: chunks.length, topScores: chunks.map(c => c.score || 0), latency: 0 }
                : prev.flashrank
            }));
          } 
          // 2. Guardrail & Routing
          else if (eventName === "guardrail_route" || dataJson.event === "guardrail_route") {
            const classification = dataJson.classification || "safe_rag";
            streamIntent = classification;
            setIntent(classification);
            setActiveStages(prev => ({
              ...prev,
              cache: prev.cache.hit ? prev.cache : { status: 'miss', hit: false, similarity: 0, matchedQuery: '', latency: prev.cache.latency || 18 },
              guardrail: {
                status: classification === 'prompt_injection' ? 'flagged' : 'completed',
                classification,
                pii_redacted: dataJson.pii_redacted,
                confidence: dataJson.confidence,
                reasoning: dataJson.reasoning,
                latency: stageLatency
              },
              retrieval: classification === 'safe_rag' && !prev.cache.hit
                ? { ...prev.retrieval, status: 'running', count: 0, latency: null }
                : prev.retrieval,
              flashrank: classification === 'safe_rag' && !prev.cache.hit
                ? { ...prev.flashrank, status: 'running' }
                : prev.flashrank,
              safeRefusal: classification === 'prompt_injection'
                ? { status: 'running', triggered: true, latency: null }
                : prev.safeRefusal,
              orderTool: classification === 'live_order_tool'
                ? { status: 'running', triggered: true, orderData: null, latency: null }
                : prev.orderTool
            }));
          } 
          // 3. Retrieval Results
          else if (eventName === "retrieval_results" || dataJson.event === "retrieval_results") {
            const chunks = dataJson.chunks || [];
            const topScores = dataJson.top_scores || chunks.map(c => c.score || 0);
            const sources = dataJson.sources || chunks.map(c => c.source || 'Knowledge Base');
            setRetrievedChunks(chunks);
            setActiveStages(prev => ({
              ...prev,
              retrieval: { status: 'completed', count: chunks.length, latency: stageLatency, sources },
              flashrank: {
                status: prev.cache.hit ? 'bypassed' : 'completed',
                count: chunks.length,
                topScores,
                latency: prev.cache.hit ? 0 : stageLatency
              },
              crag: prev.cache.hit
                ? prev.crag
                : { ...prev.crag, status: 'running', is_relevant: null, score: 0, latency: null }
            }));
          } 
          // 4. CRAG Grade
          else if (eventName === "crag_grade" || dataJson.event === "crag_grade") {
            setActiveStages(prev => ({
              ...prev,
              crag: {
                status: dataJson.is_relevant ? 'relevant' : 'irrelevant',
                is_relevant: dataJson.is_relevant,
                score: dataJson.score,
                retry_count: dataJson.retry_count,
                reasoning: dataJson.reasoning,
                latency: stageLatency
              },
              rewriter: !dataJson.is_relevant
                ? { status: 'completed', retry_count: (dataJson.retry_count || 0) + 1 }
                : prev.rewriter,
              retrieval: !dataJson.is_relevant
                ? { ...prev.retrieval, status: 'running' }
                : prev.retrieval,
              generator: dataJson.is_relevant
                ? { ...prev.generator, status: 'running', bypassed: false }
                : prev.generator
            }));
          } 
          // 5. HITL Paused
          else if (eventName === "hitl_paused" || dataJson.event === "hitl_paused") {
            setActiveStages(prev => ({
              ...prev,
              hitl: {
                isPaused: true,
                resolved: false,
                reason: dataJson.reason,
                threadId: dataJson.thread_id || activeThread,
                latency: stageLatency
              }
            }));
            
            setMessages(prev => {
              const existing = prev.find(m => m.id === botMsgId);
              if (existing) {
                return prev.map(m => m.id === botMsgId ? { ...m, status: 'escalated', content: dataJson.response || m.content } : m);
              } else {
                botMessageCreated = true;
                return [...prev, {
                  role: 'bot',
                  content: dataJson.response || "This query requires managerial review. It has been escalated to a human supervisor.",
                  status: 'escalated',
                  intent: dataJson.intent || 'escalation_hitl',
                  id: botMsgId
                }];
              }
            });
          } 
          // 6. Final Response
          else if (eventName === "final_response" || dataJson.event === "final_response") {
            const finalIntent = dataJson.intent || streamIntent;
            if (finalIntent) {
              streamIntent = finalIntent;
              setIntent(finalIntent);
            }

            setActiveStages(prev => ({
              ...prev,
              safeRefusal: finalIntent === 'prompt_injection'
                ? { status: 'triggered', triggered: true, latency: stageLatency }
                : prev.safeRefusal,
              orderTool: finalIntent === 'live_order_tool'
                ? { status: 'completed', triggered: true, orderData: dataJson.order_data || null, latency: stageLatency }
                : prev.orderTool,
              generator: finalIntent === 'safe_rag'
                ? { status: 'completed', latency: stageLatency, bypassed: prev.cache.hit }
                : prev.generator,
              hitl: finalIntent === 'human_review'
                ? { ...prev.hitl, isPaused: false, resolved: true, latency: stageLatency }
                : prev.hitl
            }));

            setMessages(prev => {
              const existing = prev.find(m => m.id === botMsgId);
              if (existing) {
                return prev.map(m => m.id === botMsgId ? {
                  ...m,
                  content: dataJson.response,
                  status: dataJson.status || 'success',
                  intent: dataJson.intent || m.intent,
                  order_data: dataJson.order_data
                } : m);
              } else {
                botMessageCreated = true;
                return [...prev, {
                  role: 'bot',
                  content: dataJson.response,
                  status: dataJson.status || 'success',
                  intent: dataJson.intent || streamIntent,
                  order_data: dataJson.order_data,
                  id: botMsgId
                }];
              }
            });
          } 
          // 7. Done
          else if (eventName === "done" || dataJson.event === "done") {
            setLoading(false);
          }
        }
      }
    } catch (error) {
      console.error("Streaming error:", error);
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: "Error: Could not connect to the neural streaming engine. Please verify the backend is running.", 
        status: 'error',
        id: botMsgId
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    executeChat(query, threadId);
  };

  const handlePresetClick = (presetQuery) => {
    if (loading) return;
    const newThread = "session_" + Math.random().toString(36).substring(2, 9);
    setThreadId(newThread);
    setActiveStages(prev => ({
      ...prev,
      hitl: { isPaused: false, reason: '', threadId: newThread }
    }));
    executeChat(presetQuery, newThread);
  };

  const processFileUpload = async (file) => {
    if (!file) return;

    setUploading(true);
    setUploadStatus({ type: 'uploading', message: `Indexing ${file.name}...` });

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await authFetch(`${API_BASE_URL}/api/ingest/upload`, {
        method: 'POST',
        body: formData,
      });

      let respData = null;
      try {
        respData = await resp.json();
      } catch {
        respData = null;
      }

      if (!resp.ok) {
        const err = new Error(respData?.detail || `Upload failed (HTTP ${resp.status})`);
        err.status = resp.status;
        throw err;
      }

      const { suggested_prompts, filename, chunks_indexed, tables_created } = respData;
      const countMsg = tables_created?.length 
        ? `${tables_created.length} table(s)` 
        : `${chunks_indexed} chunk(s)`;

      setUploadStatus({
        type: 'success',
        message: `Indexed ${filename} (${countMsg})`
      });

      if (suggested_prompts && suggested_prompts.length > 0) {
        const newChips = suggested_prompts.map((q, idx) => ({
          id: `upload_${Date.now()}_${idx}`,
          icon: <FileText className="w-3.5 h-3.5 text-accent-emerald" />,
          label: filename.length > 16 ? filename.substring(0, 14) + "..." : filename,
          title: filename.length > 16 ? filename.substring(0, 14) + "..." : filename,
          badge: "DOC RAG",
          badgeStyleDark: "bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30",
          badgeStyleLight: "bg-emerald-50 text-emerald-700 border-emerald-200",
          query: q,
          isCustom: true
        }));
        setCustomPrompts(prev => [...prev, ...newChips]);
      }

      setTimeout(() => setUploadStatus(null), 6000);
      return true;
    } catch (err) {
      console.error("Upload error:", err);
      const detail = err.message || "Upload failed.";
      setUploadStatus({
        type: 'error',
        message: detail
      });
      setTimeout(() => setUploadStatus(null), 7000);
      return false;
    } finally {
      setUploading(false);
    }
  };

  const activeGuardrailList = (guardrailPresets && guardrailPresets.length > 0
    ? guardrailPresets
    : DEFAULT_GUARDRAIL_PRESETS
  ).map(decoratePresetCard);

  const activeTenantPresetList = (tenantPresets || []).map(decoratePresetCard);
  const combinedPresetCards = [...activeTenantPresetList, ...activeGuardrailList];

  const handleSupervisorResume = async (threadToResume, overrideMessage) => {
    setIsResuming(true);
    try {
      const resp = await authFetch(`${API_BASE_URL}/api/chat/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: threadToResume || threadId,
          response: overrideMessage
        }),
      });

      let respData = null;
      try {
        respData = await resp.json();
      } catch {
        respData = null;
      }

      if (!resp.ok) {
        if (resp.status === 401 || resp.status === 403) {
          openAuthModal('Supervisor clearance required for document ingestion or HITL escalation approvals.');
        }
        throw new Error(respData?.detail || `HTTP ${resp.status}`);
      }

      const resumedResponse = respData.response;
      setMessages(prev => [
        ...prev,
        {
          role: 'bot',
          content: resumedResponse,
          status: 'success',
          intent: 'human_review',
          id: Date.now() + 2
        }
      ]);

      setIntent('human_review');
      setActiveStages(prev => ({
        ...prev,
        hitl: { ...prev.hitl, isPaused: false, resolved: true, reason: '', threadId: '' }
      }));
    } catch (err) {
      console.error("Failed to resume thread:", err);
      alert("Failed to submit supervisor override: " + (err.message || "Unknown error"));
    } finally {
      setIsResuming(false);
    }
  };

  return (
    <div className={`relative flex h-screen overflow-hidden selection:bg-accent-emerald/30 transition-colors ${
      isDark ? 'bg-[#070A14] text-slate-100' : 'bg-[#F7FAF8] text-slate-900'
    }`}>
      {/* Non-blocking Drifting Radial Aurora Mesh Backdrop */}
      <div className="bg-mesh" aria-hidden="true">
        <div className="aurora-layer aurora-layer-primary" />
        <div className="aurora-layer aurora-layer-secondary" />
      </div>
      
      {/* Interactive Pipeline Architecture Modal */}
      <PipelineArchitectureModal
        isOpen={showArchitectureModal}
        onClose={() => setShowArchitectureModal(false)}
        theme={theme}
        activeStages={activeStages}
        intent={intent}
        retrievedChunks={retrievedChunks}
        telemetry={telemetry}
        threadId={threadId}
        latestQuery={latestQuery}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          setAuthModalBanner("");
        }}
        theme={theme}
        initialTab={authModalTab}
        contextBanner={authModalBanner}
      />

      {/* Upload Knowledge Base Modal */}
      <UploadKnowledgeModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        theme={theme}
        uploading={uploading}
        uploadStatus={uploadStatus}
        onSelectFile={processFileUpload}
        onOpenAuthModal={() => {
          setShowUploadModal(false);
          openAuthModal('Supervisor clearance required for document ingestion or HITL escalation approvals.');
        }}
      />

      {/* Upgraded Retrieval Inspector Sidebar */}
      <RetrievalInspector
        activeStages={activeStages}
        retrievedChunks={retrievedChunks}
        intent={intent}
        onSupervisorResume={handleSupervisorResume}
        isResuming={isResuming}
        theme={theme}
        telemetry={telemetry}
        onOpenAuthModal={() =>
          openAuthModal('Supervisor clearance required for document ingestion or HITL escalation approvals.')
        }
      />

      {/* Main AI Observability & Control Plane Area */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden">
        {/* Top Header Bar */}
        <header className={`relative z-50 overflow-visible h-20 border-b px-8 flex items-center justify-between backdrop-blur-md transition-colors ${
          isDark 
            ? 'bg-[#0F1629]/85 border-[#1E293B]' 
            : 'bg-white/90 border-emerald-200/75 shadow-xs'
        }`}>
          {/* Logo & System Identity */}
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-11 h-11 bg-gradient-to-tr from-accent-emerald to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <Shield className="text-white w-5 h-5" />
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-accent-emerald rounded-full border-2 ${
                isDark ? 'border-[#070A14]' : 'border-white'
              }`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-base font-extrabold tracking-tight ${
                  isDark 
                    ? 'bg-gradient-to-r from-white via-emerald-100 to-slate-400 bg-clip-text text-transparent' 
                    : 'text-slate-900'
                }`}>
                  NEXUS RAG
                </h1>
                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${
                  isDark 
                    ? 'bg-accent-emerald/15 text-emerald-300 border-accent-emerald/30' 
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}>
                  CONTROL PLANE v2.0
                </span>
              </div>
              
              <div className="flex items-center gap-3 text-xs mt-0.5">
                <span className={`flex items-center gap-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <Cpu className="w-3 h-3 text-primary-light" />
                  Groq + LangGraph Engine
                </span>
                <span className={`w-1 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-emerald-300'}`} />
                <span className={`flex items-center gap-1 font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  <Zap className="w-3 h-3 text-accent-emerald" />
                  SSE Live Pipeline
                </span>
                <span className={`w-1 h-1 rounded-full ${isDark ? 'bg-slate-700' : 'bg-emerald-300'}`} />
                <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                  {threadId}
                </span>
              </div>
            </div>
          </div>
          
          {/* Action Toolbar */}
          <div className="flex items-center gap-2.5 overflow-visible">
             {/* Multi-Tenant Workspace Switcher */}
             <div className="relative overflow-visible">
               <button
                 ref={orgTriggerRef}
                 type="button"
                 onClick={() => {
                   if (!orgMenuOpen) {
                     updateOrgMenuPosition();
                   }
                   setOrgMenuOpen((prev) => !prev);
                 }}
                 disabled={loading}
                 aria-haspopup="listbox"
                 aria-expanded={orgMenuOpen}
                 title="Switch Organization Workspace or Register New Org"
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all border text-xs font-bold disabled:opacity-50 ${
                   isDark
                     ? 'bg-[#0B1120] hover:bg-[#141D35] border-accent-emerald/40 text-white shadow-sm shadow-emerald-950/30'
                     : 'bg-white hover:bg-emerald-50 border-emerald-400 text-slate-900 shadow-xs'
                 }`}
               >
                 <Building2 className="w-3.5 h-3.5 text-accent-emerald flex-shrink-0" />
                 <span className="max-w-[140px] truncate">{activeOrg?.name || 'Nexus Enterprise'}</span>
                 <span
                   className={`hidden md:inline-block px-1.5 py-0.5 rounded text-[9px] font-mono uppercase border ${
                     isDark
                       ? 'bg-accent-emerald/15 text-emerald-300 border-accent-emerald/30'
                       : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                   }`}
                 >
                   {activeOrg?.slug || 'nexus'}
                 </span>
                 <ChevronDown
                   className={`w-3.5 h-3.5 transition-transform ${
                     orgMenuOpen ? 'rotate-180' : ''
                   } ${isDark ? 'text-slate-400' : 'text-slate-600'}`}
                 />
               </button>

               {typeof document !== 'undefined' &&
                 createPortal(
                   <AnimatePresence>
                     {orgMenuOpen && (
                       <motion.div
                         ref={orgDropdownRef}
                         role="listbox"
                         aria-label="Organization Workspaces"
                         initial={{ opacity: 0, y: -4, scale: 0.97 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         exit={{ opacity: 0, y: -4, scale: 0.97 }}
                         transition={{ duration: 0.15 }}
                         style={{
                           position: 'fixed',
                           top: `${orgMenuCoords.top}px`,
                           left: `${orgMenuCoords.left}px`,
                           width: '264px',
                         }}
                         className={`z-[999] rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl ${
                           isDark
                             ? 'bg-slate-900/98 border-slate-700/80 text-slate-100 shadow-black/70'
                             : 'bg-white/98 border-slate-200 text-slate-900 shadow-slate-900/15'
                         }`}
                       >
                         <div
                           className={`px-3.5 py-2 border-b text-[10px] font-mono font-bold uppercase tracking-wider ${
                             isDark
                               ? 'border-slate-700/80 text-slate-400 bg-slate-950/60'
                               : 'border-slate-200 text-slate-600 bg-slate-50/90'
                           }`}
                         >
                           Active Tenant Workspace
                         </div>

                         <div className="p-1.5 space-y-0.5 max-h-60 overflow-y-auto">
                           {organizations.map((org) => {
                             const isSelected = org.org_id === activeOrg?.org_id;
                             return (
                               <button
                                 key={org.org_id}
                                 type="button"
                                 role="option"
                                 aria-selected={isSelected}
                                 onClick={() => handleWorkspaceSelect(org)}
                                 className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors text-left ${
                                   isSelected
                                     ? isDark
                                       ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                       : 'bg-emerald-50 text-emerald-900 border border-emerald-300'
                                     : isDark
                                     ? 'hover:bg-slate-800/90 text-slate-100 border border-transparent'
                                     : 'hover:bg-slate-100 text-slate-800 border border-transparent'
                                 }`}
                               >
                                 <div className="min-w-0">
                                   <div className="truncate">{org.name}</div>
                                   <div
                                     className={`text-[10px] font-mono ${
                                       isDark ? 'text-slate-400' : 'text-slate-500'
                                     }`}
                                   >
                                     slug: {org.slug}
                                   </div>
                                 </div>
                                 {isSelected && <Check className="w-4 h-4 text-accent-emerald flex-shrink-0" />}
                               </button>
                             );
                           })}
                         </div>

                         <div
                           className={`p-1.5 border-t ${
                             isDark ? 'border-slate-700/80 bg-slate-950/50' : 'border-slate-200 bg-slate-50/80'
                           }`}
                         >
                           <button
                             type="button"
                             onClick={handleNewOrganizationClick}
                             className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                               isDark
                                 ? 'text-accent-cyan hover:bg-accent-cyan/15'
                                 : 'text-emerald-700 hover:bg-emerald-100/80'
                             }`}
                           >
                             <PlusCircle className="w-4 h-4 flex-shrink-0" />
                             <span>+ New Organization</span>
                           </button>
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>,
                   document.body
                 )}
             </div>

             {/* Upload Status Badge */}
             <AnimatePresence>
               {uploadStatus && (
                 <motion.div
                   initial={{ opacity: 0, scale: 0.92, x: 8 }}
                   animate={{ opacity: 1, scale: 1, x: 0 }}
                   exit={{ opacity: 0, scale: 0.92, x: 8 }}
                   className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-medium transition-all ${
                     uploadStatus.type === 'success'
                       ? isDark ? 'bg-accent-emerald/10 border-accent-emerald/30 text-accent-emerald' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                       : uploadStatus.type === 'error'
                       ? isDark ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-red-50 border-red-300 text-red-700'
                       : isDark ? 'bg-primary/10 border-primary/30 text-primary-light animate-pulse' : 'bg-emerald-50 border-emerald-300 text-emerald-700 animate-pulse'
                   }`}
                 >
                   {uploadStatus.type === 'uploading' && <Activity className="w-3.5 h-3.5 animate-spin" />}
                   {uploadStatus.type === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
                   {uploadStatus.type === 'error' && <AlertTriangle className="w-3.5 h-3.5" />}
                   <span className="max-w-[180px] truncate">{uploadStatus.message}</span>
                 </motion.div>
               )}
             </AnimatePresence>

             {/* Interactive Architecture Modal Button */}
             <button
                onClick={() => setShowArchitectureModal(true)}
                title="Inspect LangGraph State Machine Architecture"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all border text-xs font-semibold ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 active:scale-95 border-white/10 text-slate-200 hover:text-white'
                    : 'bg-white/90 hover:bg-emerald-50 active:scale-95 border-emerald-200 text-slate-700 hover:text-slate-900 shadow-xs'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-accent-cyan" />
                <span>Architecture</span>
             </button>

             {/* Upload Knowledge Base Modal Button */}
             <button
                onClick={() => setShowUploadModal(true)}
                title="Upload Knowledge Base (.pdf, .xlsx, .xls, .csv, .md, .txt)"
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all border text-xs font-semibold ${
                  isDark
                    ? 'bg-white/5 hover:bg-white/10 active:scale-95 border-white/10 text-slate-200 hover:text-white'
                    : 'bg-white/90 hover:bg-emerald-50 active:scale-95 border-emerald-200 text-slate-700 hover:text-slate-900 shadow-xs'
                }`}
              >
                <UploadCloud className={`w-3.5 h-3.5 text-accent-emerald ${uploading ? 'animate-bounce' : ''}`} />
                <span>Upload Docs</span>
             </button>

             {/* New Session Button */}
             <button 
                onClick={() => {
                  const freshThread = "session_" + Math.random().toString(36).substring(2, 9);
                  setThreadId(freshThread);
                  setMessages([]);
                  setRetrievedChunks([]);
                  setIntent("");
                  setLatestQuery("");
                  setActiveStages(createInitialStages(freshThread));
                }}
                title="Reset Thread Session"
                className={`px-3 py-1.5 rounded-xl transition-all border text-xs font-mono ${
                  isDark
                    ? 'border-white/10 hover:bg-white/5 text-slate-400 hover:text-slate-200'
                    : 'border-emerald-200 hover:bg-emerald-50 text-slate-700 hover:text-slate-900 bg-white/90 shadow-xs'
                }`}
              >
                New Session
             </button>

             {/* Dark / Light Mode Toggle Button */}
             <button
                onClick={toggleTheme}
                title={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
                className={`p-2 rounded-xl border transition-all ${
                  isDark 
                    ? 'border-white/10 bg-white/5 hover:bg-white/10 text-amber-400' 
                    : 'border-emerald-200 bg-white/90 hover:bg-emerald-50 text-slate-700 shadow-xs'
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>

             {/* Top Header Account Pill */}
             {user ? (
               <div
                 className={`flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl border transition-all ${
                   isDark
                     ? 'bg-[#0B1120]/85 border-[#1E293B] text-slate-100'
                     : 'bg-white/95 border-emerald-200 text-slate-800 shadow-xs'
                 }`}
               >
                 <span className="text-xs font-semibold max-w-[130px] truncate">
                   {user.full_name || user.name || user.email}
                 </span>
                 <span
                   className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase tracking-wider border ${
                     user.role === 'supervisor'
                       ? isDark
                         ? 'bg-gradient-to-r from-amber-500/20 to-violet-500/20 text-amber-300 border-amber-500/40'
                         : 'bg-amber-50 text-amber-800 border-amber-300'
                       : isDark
                       ? 'bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 text-accent-cyan border-accent-cyan/35'
                       : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                   }`}
                 >
                   {user.role === 'supervisor' ? 'SUPERVISOR' : 'ANALYST'}
                 </span>
                 <button
                   type="button"
                   onClick={logout}
                   title="Sign Out"
                   className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                     isDark
                       ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                       : 'hover:bg-emerald-50 text-slate-600 hover:text-slate-900'
                   }`}
                 >
                   <LogOut className="w-3.5 h-3.5" />
                   <span className="hidden xl:inline">Sign Out</span>
                 </button>
               </div>
             ) : (
               <button
                 type="button"
                 onClick={() => openAuthModal()}
                 disabled={authLoading}
                 title="Sign In or launch a 1-Click Demo session"
                 className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all disabled:opacity-60 ${
                   isDark
                     ? 'bg-white/5 hover:bg-white/10 active:scale-95 border-white/15 text-slate-200 hover:text-white'
                     : 'bg-white/95 hover:bg-emerald-50 active:scale-95 border-emerald-200 text-slate-700 hover:text-slate-900 shadow-xs'
                 }`}
               >
                 <LogIn className="w-3.5 h-3.5 text-accent-cyan" />
                 <span className="whitespace-nowrap">
                   {authLoading ? 'Checking Session...' : 'Guest Mode · Sign In'}
                 </span>
               </button>
             )}
          </div>
        </header>

        {/* Chat / Observability Main Viewport */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto p-6 md:p-8 space-y-6 scroll-smooth scrollbar-hide">
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              className="max-w-5xl mx-auto py-6 md:py-8 space-y-8"
            >
              {/* AI CONTROL PLANE HEADER */}
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 border ${
                    isDark
                      ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald animate-pulse" />
                    Production Observability & Control Plane
                  </span>
                  <span className={`text-xs font-mono ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Active Model: {telemetry.groq_model}
                  </span>
                </div>

                <h2 className={`text-2xl md:text-3xl font-black tracking-tight ${
                  isDark ? 'text-white' : 'text-slate-950'
                }`}>
                  Nexus Enterprise AI Observability Engine
                </h2>
                <p className={`text-xs md:text-sm max-w-3xl leading-relaxed ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}>
                  Deterministic hybrid retrieval (ChromaDB + BM25Okapi RRF), cross-encoder reranking, CRAG self-correction, and human-in-the-loop governance for enterprise customer support.
                </p>
              </div>

              {/* CRISP SYSTEM TELEMETRY & BENCHMARK RIBBON (3D Spotlight Tilt Cards) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. RAGAS Benchmark Card */}
                <SpotlightTiltCard
                  theme={theme}
                  spotlightColor={isDark ? 'rgba(16, 185, 129, 0.16)' : 'rgba(16, 185, 129, 0.12)'}
                  borderGlowColor={isDark ? 'rgba(16, 185, 129, 0.7)' : 'rgba(5, 150, 105, 0.55)'}
                  className={`p-4 rounded-2xl border backdrop-blur-md transition-colors ${
                    isDark 
                      ? 'bg-[#0F1629]/75 border-[#1E293B]' 
                      : 'bg-gradient-to-br from-white/90 to-emerald-50/50 border-emerald-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      RAGAS Composite Benchmark
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isDark 
                        ? 'bg-accent-emerald/15 text-accent-emerald border-accent-emerald/30' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      SOTA EVAL
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <AnimatedCounter
                      value={telemetry.composite_score || 0.9404}
                      decimals={3}
                      className={`text-2xl font-black font-mono ${
                        isDark ? 'text-white' : 'text-slate-950'
                      }`}
                    />
                    <span className="text-xs text-accent-emerald font-semibold">/ 1.000</span>
                  </div>

                  <div className={`mt-2 pt-2 border-t flex items-center justify-between text-[10px] font-mono ${
                    isDark ? 'border-slate-800/80 text-slate-400' : 'border-emerald-100 text-slate-600'
                  }`}>
                    <span>Faithfulness: <strong className={isDark ? "text-slate-200" : "text-slate-900"}>{(telemetry.faithfulness || 0.9583).toFixed(2)}</strong></span>
                    <span>·</span>
                    <span>Context Precision: <strong className={isDark ? "text-slate-200" : "text-slate-900"}>{(telemetry.context_precision || 0.9896).toFixed(2)}</strong></span>
                  </div>
                </SpotlightTiltCard>

                {/* 2. Hybrid Index Status Card */}
                <SpotlightTiltCard
                  theme={theme}
                  spotlightColor={isDark ? 'rgba(6, 182, 212, 0.16)' : 'rgba(16, 185, 129, 0.12)'}
                  borderGlowColor={isDark ? 'rgba(6, 182, 212, 0.7)' : 'rgba(5, 150, 105, 0.55)'}
                  className={`p-4 rounded-2xl border backdrop-blur-md transition-colors ${
                    isDark 
                      ? 'bg-[#0F1629]/75 border-[#1E293B]' 
                      : 'bg-gradient-to-br from-white/90 to-emerald-50/50 border-emerald-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Hybrid Index Architecture
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isDark 
                        ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {telemetry.bm25_status || 'Active'}
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className={`text-base font-bold font-mono ${
                      isDark ? 'text-white' : 'text-slate-950'
                    }`}>
                      ChromaDB + BM25 + FlashRank
                    </span>
                  </div>

                  <div className={`mt-2 pt-2 border-t flex items-center justify-between text-[10px] font-mono ${
                    isDark ? 'border-slate-800/80 text-slate-400' : 'border-emerald-100 text-slate-600'
                  }`}>
                    <span>{telemetry.chroma_chunk_count || 86} Dense Chunks</span>
                    <span>·</span>
                    <span>RRF (k=60) Fusion</span>
                  </div>
                </SpotlightTiltCard>

                {/* 3. Structured Database Card */}
                <SpotlightTiltCard
                  theme={theme}
                  spotlightColor={isDark ? 'rgba(99, 102, 241, 0.18)' : 'rgba(16, 185, 129, 0.12)'}
                  borderGlowColor={isDark ? 'rgba(99, 102, 241, 0.7)' : 'rgba(5, 150, 105, 0.55)'}
                  className={`p-4 rounded-2xl border backdrop-blur-md transition-colors ${
                    isDark 
                      ? 'bg-[#0F1629]/75 border-[#1E293B]' 
                      : 'bg-gradient-to-br from-white/90 to-emerald-50/50 border-emerald-200/80 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[10px] font-mono uppercase font-bold tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      Structured Knowledge DB
                    </span>
                    <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isDark 
                        ? 'bg-primary/15 text-primary-light border-primary/30' 
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      SQLite B-Tree
                    </span>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <AnimatedCounter
                      value={telemetry.sqlite_row_count || 26872}
                      formatLocale
                      className={`text-2xl font-black font-mono ${
                        isDark ? 'text-white' : 'text-slate-950'
                      }`}
                    />
                    <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Records</span>
                  </div>

                  <div className={`mt-2 pt-2 border-t flex items-center justify-between text-[10px] font-mono ${
                    isDark ? 'border-slate-800/80 text-slate-400' : 'border-emerald-100 text-slate-600'
                  }`}>
                    <span>data/nexus_structured.db</span>
                    <span>·</span>
                    <span>0ms Index Scan</span>
                  </div>
                </SpotlightTiltCard>
              </div>

              {/* HYBRID GROUNDED WORKSPACE PRESETS + PLATFORM GUARDRAILS */}
              <div className="relative z-10 space-y-3 pt-2">
                <div className="flex items-center justify-between px-1">
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                    isDark ? 'text-slate-400' : 'text-slate-600'
                  }`}>
                    <Terminal className="w-3.5 h-3.5 text-accent-emerald" />
                    {activeOrg?.name || 'Nexus Enterprise'} Grounded Presets &amp; Guardrails
                  </span>
                  <span className={`text-[10px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    Click any card to execute deterministic branch
                  </span>
                </div>

                {/* Onboarding Banner for Newly Registered Orgs with Zero Indexed Documents */}
                {!presetsLoading && activeTenantPresetList.length === 0 && (
                  <div
                    className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 backdrop-blur-md ${
                      isDark
                        ? 'bg-emerald-950/25 border-accent-emerald/35 text-slate-100'
                        : 'bg-emerald-50/90 border-emerald-300 text-slate-900 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center flex-shrink-0 ${
                          isDark
                            ? 'bg-accent-emerald/15 border-accent-emerald/35 text-accent-emerald'
                            : 'bg-white border-emerald-200 text-emerald-700'
                        }`}
                      >
                        <UploadCloud className="w-4 h-4" />
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs font-bold">
                          {activeOrg?.name || 'This workspace'} has no indexed documents yet
                        </div>
                        <p className={`text-[11px] leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                          Upload PDFs, Markdown policies, CSVs, or Excel workbooks via Upload Docs to index this workspace and automatically generate clickable domain presets.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowUploadModal(true)}
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-emerald to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white font-bold text-xs flex-shrink-0 shadow-md shadow-emerald-500/20 transition-all"
                    >
                      <UploadCloud className="w-3.5 h-3.5" />
                      <span>Upload Docs</span>
                    </button>
                  </div>
                )}

                <motion.div
                  key={`${activeOrg?.org_id || 'org_nexus'}-${activeTenantPresetList.length}`}
                  variants={PRESET_GRID_VARIANTS}
                  initial="hidden"
                  animate="visible"
                  className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-left"
                >
                  {combinedPresetCards.map((item, idx) => (
                    <motion.div
                      key={item.id || `${item.code}_${idx}`}
                      variants={PRESET_CARD_VARIANTS}
                      className="h-full"
                    >
                      <SpotlightTiltCard
                        as="button"
                        theme={theme}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => handlePresetClick(item.query)}
                        className={`w-full h-full p-4 rounded-2xl border backdrop-blur-md flex flex-col justify-between gap-3 text-left transition-colors group ${
                          isDark 
                            ? `bg-[#0F1629]/75 border-[#1E293B] ${item.hoverBorderDark}` 
                            : `bg-white/80 border-emerald-200/75 ${item.hoverBorderLight} shadow-xs`
                        }`}
                      >
                        {/* Top metadata row */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <span className={`text-[9px] font-mono font-bold ${
                            isDark ? 'text-slate-500' : 'text-slate-500'
                          }`}>
                            {item.code}
                          </span>
                          <span className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
                            isDark ? item.badgeStyleDark : item.badgeStyleLight
                          }`}>
                            {item.badge}
                          </span>
                        </div>

                        {/* Title & prompt query */}
                        <div className="space-y-1.5 flex-1">
                          <div className={`text-xs font-bold transition-colors line-clamp-1 ${
                            isDark ? 'text-slate-100 group-hover:text-white' : 'text-slate-800 group-hover:text-slate-950'
                          }`}>
                            {item.title}
                          </div>
                          <p className={`text-[11px] leading-relaxed line-clamp-3 ${
                            isDark ? 'text-slate-400 group-hover:text-slate-300' : 'text-slate-600 group-hover:text-slate-800'
                          }`}>
                            "{item.query}"
                          </p>
                        </div>

                        {/* Footer trigger cue */}
                        <div className={`mt-3 pt-2 border-t flex items-center justify-between text-[10px] font-mono transition-colors ${
                          isDark 
                            ? 'border-slate-800/80 text-slate-500 group-hover:text-accent-emerald' 
                            : 'border-emerald-100 text-slate-500 group-hover:text-emerald-700'
                        }`}>
                          <span className="truncate max-w-[130px]">{item.target}</span>
                          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                        </div>
                      </SpotlightTiltCard>
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            </motion.div>
          )}

          {/* Chat Messages */}
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28, mass: 0.75 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-3.5 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  {/* User / Bot Avatar */}
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md backdrop-blur-md ${
                    m.role === 'user' 
                      ? 'bg-gradient-to-tr from-accent-emerald to-indigo-600 border border-white/20' 
                      : isDark ? 'bg-[#0F1629]/85 border border-[#1E293B]' : 'bg-white/90 border border-emerald-200/80 shadow-xs'
                  }`}>
                    {m.role === 'user' ? <User className="w-5 h-5 text-white" /> : <Bot className="w-5 h-5 text-accent-emerald" />}
                  </div>

                  <div className={`space-y-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`relative p-4 md:p-5 rounded-2xl shadow-sm leading-relaxed text-sm backdrop-blur-md ${
                      m.role === 'user' 
                        ? isDark
                          ? 'bg-gradient-to-br from-indigo-600 to-emerald-700 text-white rounded-tr-none border border-white/10'
                          : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-tr-none shadow-emerald-900/10'
                        : isDark 
                        ? 'bg-[#0F1629]/80 border border-[#1E293B] text-slate-100 rounded-tl-none' 
                        : 'bg-white/85 border border-emerald-200/80 text-slate-800 rounded-tl-none shadow-xs'
                    }`}>
                      <div className="whitespace-pre-wrap">{m.content}</div>

                      {/* Bot Message Metadata Bar */}
                      {m.role === 'bot' && (
                        <div className={`mt-3 pt-2 border-t flex flex-wrap items-center gap-4 text-[9px] font-bold uppercase tracking-widest ${
                          isDark ? 'border-slate-800 text-slate-400' : 'border-emerald-100 text-slate-500'
                        }`}>
                          <span className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-accent-emerald" /> 
                            {m.intent ? m.intent : 'Deterministic Verified'}
                          </span>
                          <span className="flex items-center gap-1 font-mono">
                            <Activity className="w-3 h-3 text-primary-light" /> Langfuse Traced
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {/* HITL Escalation Notice */}
                    {m.status === 'escalated' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`flex flex-col gap-2.5 p-3.5 rounded-xl text-xs font-bold border backdrop-blur-md ${
                          isDark 
                            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' 
                            : 'bg-amber-50 border-amber-300 text-amber-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                          <span>HITL PAUSED: Awaiting Supervisor Override in Retrieval Inspector sidebar</span>
                        </div>
                        {activeStages?.hitl?.isPaused && !isSupervisor && (
                          <div className={`flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-[11px] font-medium ${
                            isDark ? 'border-amber-500/20 text-slate-300' : 'border-amber-200 text-amber-900'
                          }`}>
                            <span className="flex items-center gap-1.5">
                              <Lock className="w-3.5 h-3.5 text-amber-400" />
                              Supervisor Clearance Required to resume this thread.
                            </span>
                            <button
                              type="button"
                              onClick={handleInlineDemoSupervisor}
                              disabled={demoSupervisorBusy}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-amber-600 hover:brightness-110 text-slate-950 font-bold text-[11px] transition-all disabled:opacity-50"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" />
                              <span>{demoSupervisorBusy ? 'Signing In...' : 'Sign In as Demo Supervisor'}</span>
                            </button>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Loading Indicator */}
          <AnimatePresence>
            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className="flex justify-start"
              >
                <div className="flex gap-3.5">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border backdrop-blur-md ${
                    isDark ? 'bg-[#0F1629]/85 border-[#1E293B]' : 'bg-white/90 border-emerald-200/80 shadow-xs'
                  }`}>
                    <Bot className="w-5 h-5 text-accent-emerald animate-pulse" />
                  </div>
                  <div className={`p-4 rounded-2xl rounded-tl-none flex items-center gap-2 border backdrop-blur-md ${
                    isDark ? 'bg-[#0F1629]/75 border-[#1E293B]' : 'bg-white/85 border-emerald-200/80 shadow-xs'
                  }`}>
                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }} className="w-1.5 h-1.5 bg-accent-emerald rounded-full" />
                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-1.5 h-1.5 bg-accent-emerald rounded-full" />
                    <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-1.5 h-1.5 bg-accent-emerald rounded-full" />
                    <span className={`ml-2 text-xs font-bold font-mono uppercase tracking-wider ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      Executing LangGraph Pipeline...
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom Input Area & Quick-Prompt Bar */}
        <footer className={`p-6 md:p-7 border-t backdrop-blur-md transition-colors ${
          isDark ? 'bg-[#090D18]/85 border-[#1E293B]' : 'bg-white/85 border-emerald-200/75 shadow-sm'
        }`}>
          {/* Scrollable Quick-Prompt Bar when conversation is active */}
          {messages.length > 0 && (
            <div className="max-w-5xl mx-auto mb-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider flex-shrink-0 mr-1 ${
                  isDark ? 'text-slate-400' : 'text-slate-600'
                }`}>
                  <Sparkles className="w-3 h-3 text-accent-emerald" />
                  <span>Showcase Presets:</span>
                </div>
                {[
                  ...combinedPresetCards,
                  ...customPrompts.filter(
                    (cp) => !combinedPresetCards.some((p) => p.query === cp.query)
                  ),
                ].map((item, idx) => (
                  <motion.button
                    key={item.id || idx}
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handlePresetClick(item.query)}
                    className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-medium transition-all ${
                      item.isCustom
                        ? isDark ? 'bg-accent-emerald/10 border-accent-emerald/30 text-slate-200' : 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : isDark ? 'bg-[#0F1629]/85 border-[#1E293B] text-slate-300 hover:text-white' : 'bg-white/90 border-emerald-200/80 text-slate-700 hover:text-slate-900 shadow-xs'
                    }`}
                    title={item.query}
                  >
                    {item.icon}
                    <span className={`text-[9px] font-mono px-1 py-0.2 rounded font-bold uppercase ${
                      isDark 
                        ? (item.badgeStyleDark || 'bg-white/10 text-slate-300') 
                        : (item.badgeStyleLight || 'bg-emerald-50 text-emerald-800')
                    }`}>
                      {item.badge}
                    </span>
                    <span className="font-semibold text-[11px] whitespace-nowrap">
                      {item.title || item.label}:
                    </span>
                    <span className={`truncate max-w-[180px] font-normal ${
                      isDark ? 'text-slate-400' : 'text-slate-500'
                    }`}>
                      {item.query}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}

          {/* Inline Live Pipeline Strip */}
          <LivePipelineStrip
            activeStages={activeStages}
            intent={intent}
            loading={loading}
            retrievedChunks={retrievedChunks}
            theme={theme}
            onOpenArchitecture={() => setShowArchitectureModal(true)}
          />

          {/* Query Input Box */}
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto relative group">
            <div className="relative flex items-center">
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Query knowledge base, look up orders (#7721), or test security guardrails..."
                className={`w-full rounded-2xl py-4 pl-6 pr-28 text-sm font-medium border backdrop-blur-md transition-all focus:outline-none focus:ring-2 ${
                  isDark 
                    ? 'bg-[#0F1629]/85 border-[#1E293B] text-slate-100 placeholder:text-slate-500 focus:border-accent-emerald/60 focus:ring-accent-emerald/20' 
                    : 'bg-white/90 border-emerald-200/80 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500/60 focus:ring-emerald-500/20 shadow-xs'
                }`}
              />
              <div className="absolute right-3 flex items-center gap-2">
                 <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-mono ${
                   isDark ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                 }`}>
                    <span className="w-1.5 h-1.5 bg-accent-emerald rounded-full animate-pulse" /> SSE Ready
                 </div>
                 <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit" 
                    disabled={loading || !query.trim()}
                    className="w-10 h-10 bg-gradient-to-tr from-accent-emerald to-indigo-600 hover:brightness-110 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:grayscale shadow-md shadow-emerald-500/20"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </motion.button>
              </div>
            </div>
          </form>

          {/* Sub-footer compliance chips */}
          <div className="mt-4 flex flex-wrap justify-center gap-6 text-[9px] font-bold uppercase tracking-widest">
            <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
               <Layers className="w-3 h-3 text-primary-light" /> LangGraph v2.0 State Machine
            </div>
            <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
               <Activity className="w-3 h-3 text-accent-cyan" /> Langfuse Observability Traced
            </div>
            <div className={`flex items-center gap-1.5 ${isDark ? 'text-slate-500' : 'text-slate-600'}`}>
               <Shield className="w-3 h-3 text-accent-emerald" /> Enterprise PII Scrubber & Guardrails
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NexusControlPlane />
    </AuthProvider>
  );
}
