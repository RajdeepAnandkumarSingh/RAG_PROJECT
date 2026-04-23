import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, Shield, User, Bot, AlertTriangle, 
  Search, Info, CheckCircle, Cpu, 
  Layers, Database, Zap, Activity, 
  ChevronRight, Sparkles, MessageSquare
} from 'lucide-react';

const API_URL = "http://localhost:8000";

function App() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState([]);
  const [intent, setIntent] = useState("");
  const [activeTab, setActiveTab] = useState('chat');
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    const userMessage = { role: 'user', content: query, id: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const response = await axios.post(`${API_URL}/ask`, { query });
      const botMessage = { 
        role: 'bot', 
        content: response.data.response,
        status: response.data.status,
        intent: response.data.intent,
        id: Date.now() + 1
      };
      setMessages(prev => [...prev, botMessage]);
      setContext(response.data.context || []);
      setIntent(response.data.intent);
    } catch (error) {
      setMessages(prev => [...prev, { 
        role: 'bot', 
        content: "Error: Could not connect to the neural engine. Please verify the backend is running.", 
        status: 'error',
        id: Date.now() + 1
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex h-screen bg-dark-950 text-gray-100 overflow-hidden selection:bg-primary/30">
      {/* Background Mesh Effect */}
      <div className="bg-mesh" />
      
      {/* Sidebar - Analytics & Retrieval */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-80 glass-panel-heavy border-r border-white/5 flex flex-col z-20"
      >
        <div className="p-6 border-b border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center border border-primary/30">
            <Activity className="text-primary w-5 h-5" />
          </div>
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-300">Neural Engine</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Status Metrics */}
          <div className="space-y-3">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">System Health</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 mb-1">Latency</div>
                <div className="text-sm font-mono text-accent-cyan">42ms</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="text-xs text-gray-400 mb-1">Tokens/s</div>
                <div className="text-sm font-mono text-accent-purple">84.2</div>
              </div>
            </div>
          </div>

          {/* Retrieval Knowledge Graph Placeholder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter">Retrieval Context</div>
              <span className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary-light rounded-full border border-primary/30">
                {context.length} Chunks
              </span>
            </div>
            
            <div className="space-y-3">
              {context.length > 0 ? (
                <AnimatePresence>
                  {context.map((ctx, idx) => (
                    <motion.div 
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.1 }}
                      className="group p-4 bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 transition-all cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-3 h-3 text-primary-light" />
                        <span className="text-[10px] font-mono text-primary-light">VECTOR_NODE_{idx + 1}</span>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed group-hover:text-gray-200 transition-colors">
                        {ctx}
                      </p>
                    </motion.div>
                  ))}
                </AnimatePresence>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center opacity-30">
                  <Database className="w-12 h-12 mb-4 text-gray-600" />
                  <p className="text-xs px-8 italic">Awaiting knowledge retrieval triggers...</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Intent Badge */}
        <div className="p-6 border-t border-white/5 bg-dark-950/50">
          <div className="text-[10px] text-gray-500 uppercase font-bold mb-3 tracking-widest">Detected Intent</div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold ${
            intent === 'Escalation' 
              ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
              : intent ? 'bg-accent-emerald/10 text-accent-emerald border border-accent-emerald/20'
              : 'bg-white/5 text-gray-500 border border-white/10'
          }`}>
            <div className={`w-2 h-2 rounded-full ${intent === 'Escalation' ? 'bg-red-500 animate-pulse' : 'bg-accent-emerald'}`} />
            {intent || "Listening..."}
          </div>
        </div>
      </motion.aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10">
        {/* Top Header */}
        <header className="h-20 border-b border-white/5 px-8 flex items-center justify-between glass-panel">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="w-12 h-12 bg-gradient-to-tr from-primary to-accent-purple rounded-2xl flex items-center justify-center shadow-2xl shadow-primary/20">
                <Shield className="text-white w-6 h-6" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-accent-emerald rounded-full border-4 border-dark-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight bg-gradient-to-r from-white to-gray-500 bg-clip-text text-transparent">NEXUS RAG</h1>
                <span className="px-2 py-0.5 bg-white/10 rounded text-[10px] font-bold text-gray-400 uppercase tracking-widest">PRO v2.0</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-primary-light" /> Llama 3.3 Engine</span>
                <span className="w-1 h-1 bg-gray-700 rounded-full" />
                <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-accent-cyan" /> Ultra-Low Latency</span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <button className="p-2 hover:bg-white/5 rounded-lg transition-colors border border-transparent hover:border-white/10">
                <Search className="w-5 h-5 text-gray-400" />
             </button>
             <button className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/10">
                <div className="w-6 h-6 bg-accent-purple/20 rounded-full flex items-center justify-center">
                  <User className="w-3 h-3 text-accent-purple" />
                </div>
                <span className="text-sm font-medium">Developer</span>
             </button>
          </div>
        </header>

        {/* Chat Interface */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth scrollbar-hide">
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-3xl mx-auto py-20 text-center space-y-10"
            >
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-primary/20 blur-3xl rounded-full" />
                <div className="relative w-24 h-24 bg-dark-800 rounded-3xl border border-white/10 flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <Sparkles className="w-12 h-12 text-primary animate-pulse-slow" />
                </div>
              </div>
              
              <div className="space-y-4">
                <h2 className="text-4xl font-black tracking-tight text-white">How can I assist you today?</h2>
                <p className="text-gray-400 text-lg max-w-xl mx-auto font-medium">
                  I'm your intelligent customer support interface, trained on private datasets to provide instant, accurate solutions.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {[
                  { icon: <Search />, label: "Order Tracking", query: "Where is my package #7721?" },
                  { icon: <Shield />, label: "Security & Access", query: "How do I reset my credentials?" },
                  { icon: <Zap />, label: "Quick Actions", query: "Can you summarize our return policy?" },
                  { icon: <MessageSquare />, label: "Support", query: "I need to talk to a human agent." },
                ].map((item, idx) => (
                  <motion.button 
                    key={idx}
                    whileHover={{ y: -4, scale: 1.02, backgroundColor: "rgba(255,255,255,0.08)" }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setQuery(item.query)}
                    className="p-4 bg-white/5 border border-white/5 rounded-2xl flex items-center gap-4 text-left transition-all group"
                  >
                    <div className="w-10 h-10 bg-dark-900 rounded-xl flex items-center justify-center text-primary transition-colors group-hover:text-white">
                      {item.icon}
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-0.5">{item.label}</div>
                      <div className="text-sm text-gray-300 font-medium line-clamp-1">{item.query}</div>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((m) => (
              <motion.div 
                key={m.id}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.4 }}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`flex gap-4 max-w-[85%] ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                    m.role === 'user' 
                      ? 'bg-primary border border-white/20' 
                      : 'bg-dark-800 border border-white/10'
                  }`}>
                    {m.role === 'user' ? <User className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-primary" />}
                  </div>
                  <div className={`space-y-3 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`relative p-5 rounded-3xl shadow-2xl leading-relaxed ${
                      m.role === 'user' 
                        ? 'bg-primary/90 text-white rounded-tr-none' 
                        : 'bg-dark-800/80 backdrop-blur-md border border-white/10 rounded-tl-none text-gray-200'
                    }`}>
                      {m.content}
                      {m.role === 'bot' && (
                        <div className="absolute -bottom-6 left-2 flex items-center gap-4 text-[9px] font-bold text-gray-500 uppercase tracking-widest">
                          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-accent-emerald" /> Verified</span>
                          <span className="flex items-center gap-1 opacity-50"><Activity className="w-3 h-3" /> Processed in 1.2s</span>
                        </div>
                      )}
                    </div>
                    
                    {m.status === 'escalated' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold"
                      >
                        <AlertTriangle className="w-5 h-5" />
                        SYSTEM: Escalating to Human Tier-2 Support
                      </motion.div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {loading && (
            <div className="flex justify-start">
              <div className="flex gap-4">
                <div className="w-12 h-12 rounded-2xl bg-dark-800 border border-white/10 flex items-center justify-center">
                  <Bot className="w-6 h-6 text-primary animate-pulse" />
                </div>
                <div className="bg-dark-800/50 border border-white/10 p-5 rounded-3xl rounded-tl-none flex gap-1.5 items-center">
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.2 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.4 }} className="w-1.5 h-1.5 bg-primary rounded-full" />
                  <span className="ml-2 text-xs font-bold text-gray-500 uppercase tracking-tighter">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input Bar */}
        <footer className="p-8 glass-panel-heavy border-t border-white/5">
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto relative group">
            <div className="absolute inset-0 bg-primary/10 blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity rounded-3xl" />
            <div className="relative flex items-center">
              <input 
                type="text" 
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Query the Nexus Knowledge Base..."
                className="w-full bg-dark-900/50 backdrop-blur-xl border border-white/10 rounded-3xl py-6 pl-8 pr-32 focus:outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10 transition-all text-gray-100 placeholder:text-gray-600 font-medium"
              />
              <div className="absolute right-4 flex items-center gap-3">
                 <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg border border-white/5 text-[10px] font-mono text-gray-500">
                    <span className="w-1.5 h-1.5 bg-accent-cyan rounded-full" /> GPT-4o
                 </div>
                 <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    type="submit" 
                    disabled={loading || !query.trim()}
                    className="w-14 h-14 bg-gradient-to-tr from-primary to-accent-purple hover:brightness-110 rounded-2xl flex items-center justify-center transition-all disabled:opacity-30 disabled:grayscale shadow-xl shadow-primary/20"
                  >
                    <Send className="w-6 h-6 text-white" />
                  </motion.button>
              </div>
            </div>
          </form>
          <div className="mt-6 flex justify-center gap-8">
            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em]">
               <Layers className="w-3 h-3" /> LangGraph Orchestration
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em]">
               <Activity className="w-3 h-3" /> Groq Inference Engine
            </div>
            <div className="flex items-center gap-2 text-[9px] font-bold text-gray-600 uppercase tracking-[0.2em]">
               <Shield className="w-3 h-3" /> Enterprise Secure
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
}

export default App;
