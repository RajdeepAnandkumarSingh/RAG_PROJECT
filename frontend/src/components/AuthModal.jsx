import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Shield,
  ShieldCheck,
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Sparkles,
  LogIn,
  UserPlus,
  Activity,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function AuthModal({
  isOpen,
  onClose,
  theme = 'dark',
  initialTab = 'signin',
  contextBanner = '',
  onSuccess,
}) {
  const { login, signup, loginAsDemo } = useAuth();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState(initialTab);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab || 'signin');
      setErrorMsg('');
      setPassword('');
      setShowPassword(false);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  const passwordChecks = useMemo(
    () => [
      { id: 'length', label: 'At least 8 characters', passed: password.length >= 8 },
      { id: 'upper', label: '1 uppercase letter', passed: /[A-Z]/.test(password) },
      { id: 'lower', label: '1 lowercase letter', passed: /[a-z]/.test(password) },
      { id: 'digit', label: '1 digit', passed: /[0-9]/.test(password) },
      {
        id: 'special',
        label: '1 special character',
        passed: /[^A-Za-z0-9\s]/.test(password),
      },
    ],
    [password]
  );

  const passedCount = passwordChecks.filter((c) => c.passed).length;
  const allPasswordChecksPassed = passedCount === passwordChecks.length;

  const strengthMeta = useMemo(() => {
    if (password.length === 0) {
      return { label: 'Enter password', barColor: 'bg-slate-600', width: '0%' };
    }
    if (passedCount <= 2) {
      return { label: 'Weak', barColor: 'bg-red-500', width: '30%' };
    }
    if (passedCount <= 4) {
      return { label: 'Almost there', barColor: 'bg-amber-500', width: '70%' };
    }
    return { label: 'Strong', barColor: 'bg-accent-emerald', width: '100%' };
  }, [password.length, passedCount]);

  const handleAuthError = (err) => {
    if (err?.status === 429) {
      const waitSec = Number(err.retryAfter) > 0 ? Number(err.retryAfter) : 60;
      setCooldownSeconds(waitSec);
      setErrorMsg(err.detail || err.message || `Too many attempts. Try again in ${waitSec}s.`);
      return;
    }
    setErrorMsg(err?.detail || err?.message || 'Authentication failed. Please try again.');
  };

  const handleTabSwitch = (nextTab) => {
    if (submitting) return;
    setActiveTab(nextTab);
    setErrorMsg('');
  };

  const handleDemoClick = async (role) => {
    if (submitting || cooldownSeconds > 0) return;
    setSubmitting(role === 'supervisor' ? 'demo-supervisor' : 'demo-user');
    setErrorMsg('');
    try {
      const res = await loginAsDemo(role);
      onSuccess?.(res);
      onClose();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(null);
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (submitting || cooldownSeconds > 0) return;

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    if (activeTab === 'signup') {
      const cleanName = fullName.trim();
      if (cleanName.length < 2) {
        setErrorMsg('Full name must be at least 2 characters.');
        return;
      }
      if (!allPasswordChecksPassed) {
        setErrorMsg('Please satisfy all 5 password security requirements below.');
        return;
      }
    } else if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setSubmitting('form');
    setErrorMsg('');
    try {
      const res =
        activeTab === 'signup'
          ? await signup(fullName, cleanEmail, password)
          : await login(cleanEmail, password);
      onSuccess?.(res);
      onClose();
    } catch (err) {
      handleAuthError(err);
    } finally {
      setSubmitting(null);
    }
  };

  const isDisabled = Boolean(submitting) || cooldownSeconds > 0;

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
            onClick={() => !submitting && onClose()}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm"
          />

          {/* Glassmorphic Auth Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 14 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28, mass: 0.8 }}
            className={`relative w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden backdrop-blur-xl ${
              isDark
                ? 'bg-[#0B1120]/95 border-[#1E293B] text-slate-100 shadow-emerald-950/35'
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
                  <Shield className="w-5 h-5 text-accent-emerald" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-tight">Nexus Control Plane Auth</h2>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${
                        isDark
                          ? 'bg-accent-cyan/15 text-accent-cyan border-accent-cyan/30'
                          : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                      }`}
                    >
                      RBAC
                    </span>
                  </div>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Argon2id + Rotating JWT Sessions
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                disabled={Boolean(submitting)}
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

            <div className="p-5 space-y-4">
              {/* Optional Contextual Banner */}
              {contextBanner && (
                <div
                  className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium ${
                    isDark
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-amber-50 border-amber-300 text-amber-900'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{contextBanner}</span>
                </div>
              )}

              {/* 1-Click Demo Login Section */}
              <div
                className={`p-3.5 rounded-xl border space-y-2.5 ${
                  isDark
                    ? 'bg-[#0F1629]/75 border-[#1E293B]'
                    : 'bg-emerald-50/45 border-emerald-200/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1.5 ${
                      isDark ? 'text-slate-300' : 'text-slate-700'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-accent-emerald" />
                    Instant Demo Access (Zero Typing)
                  </span>
                  <span className={`text-[9px] font-mono ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                    1-Click Sign In
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDemoClick('user')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${
                      isDark
                        ? 'bg-accent-emerald/15 hover:bg-accent-emerald/25 border-accent-emerald/35 text-emerald-300'
                        : 'bg-emerald-50 hover:bg-emerald-100 border-emerald-300 text-emerald-800'
                    }`}
                  >
                    {submitting === 'demo-user' ? (
                      <Activity className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    ) : (
                      <User className="w-3.5 h-3.5 flex-shrink-0" />
                    )}
                    <span className="truncate">1-Click Demo: Analyst (User)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isDisabled}
                    onClick={() => handleDemoClick('supervisor')}
                    className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none ${
                      isDark
                        ? 'bg-amber-500/15 hover:bg-amber-500/25 border-amber-500/35 text-amber-300'
                        : 'bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900'
                    }`}
                  >
                    {submitting === 'demo-supervisor' ? (
                      <Activity className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    )}
                    <span className="truncate">1-Click Demo: Supervisor (Admin)</span>
                  </button>
                </div>
              </div>

              {/* Sign In / Create Account Tabs */}
              <div
                className={`grid grid-cols-2 gap-1 p-1 rounded-xl border ${
                  isDark
                    ? 'bg-[#090D18]/80 border-[#1E293B]'
                    : 'bg-emerald-50/50 border-emerald-200/70'
                }`}
              >
                <button
                  type="button"
                  onClick={() => handleTabSwitch('signin')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'signin'
                      ? isDark
                        ? 'bg-[#161F36] text-white shadow-sm border border-white/10'
                        : 'bg-white text-slate-900 shadow-xs border border-emerald-200'
                      : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('signup')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'signup'
                      ? isDark
                        ? 'bg-[#161F36] text-white shadow-sm border border-white/10'
                        : 'bg-white text-slate-900 shadow-xs border border-emerald-200'
                      : isDark
                      ? 'text-slate-400 hover:text-slate-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Create Account</span>
                </button>
              </div>

              {/* Live 429 Rate-Limit / Lockout Countdown Banner */}
              <AnimatePresence>
                {cooldownSeconds > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs font-semibold ${
                      isDark
                        ? 'bg-red-500/15 border-red-500/40 text-red-300'
                        : 'bg-red-50 border-red-300 text-red-800'
                    }`}
                  >
                    <Clock className="w-4 h-4 flex-shrink-0 animate-pulse" />
                    <span className="font-mono">
                      Security cooldown active — retry in {cooldownSeconds}s
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Standard Error Feedback */}
              <AnimatePresence>
                {errorMsg && cooldownSeconds === 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium ${
                      isDark
                        ? 'bg-red-500/15 border-red-500/35 text-red-300'
                        : 'bg-red-50 border-red-300 text-red-700'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{errorMsg}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Form */}
              <form onSubmit={handleFormSubmit} className="space-y-3.5">
                {activeTab === 'signup' && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="auth-fullname"
                      className={`block text-[11px] font-bold uppercase tracking-wider ${
                        isDark ? 'text-slate-400' : 'text-slate-600'
                      }`}
                    >
                      Full Name
                    </label>
                    <div className="relative flex items-center">
                      <User className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                      <input
                        id="auth-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Alex Rivera"
                        maxLength={60}
                        required
                        disabled={isDisabled}
                        className={`w-full rounded-xl py-2.5 pl-10 pr-3.5 text-sm border transition-all focus:outline-none focus:ring-2 disabled:opacity-50 ${
                          isDark
                            ? 'bg-[#0F1629]/85 border-[#1E293B] text-slate-100 placeholder:text-slate-500 focus:border-accent-emerald/60 focus:ring-accent-emerald/20'
                            : 'bg-white border-emerald-200 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                        }`}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-email"
                    className={`block text-[11px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Email Address
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      required
                      disabled={isDisabled}
                      className={`w-full rounded-xl py-2.5 pl-10 pr-3.5 text-sm border transition-all focus:outline-none focus:ring-2 disabled:opacity-50 ${
                        isDark
                          ? 'bg-[#0F1629]/85 border-[#1E293B] text-slate-100 placeholder:text-slate-500 focus:border-accent-emerald/60 focus:ring-accent-emerald/20'
                          : 'bg-white border-emerald-200 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="auth-password"
                    className={`block text-[11px] font-bold uppercase tracking-wider ${
                      isDark ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 pointer-events-none" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      required
                      disabled={isDisabled}
                      className={`w-full rounded-xl py-2.5 pl-10 pr-10 text-sm border transition-all focus:outline-none focus:ring-2 disabled:opacity-50 ${
                        isDark
                          ? 'bg-[#0F1629]/85 border-[#1E293B] text-slate-100 placeholder:text-slate-500 focus:border-accent-emerald/60 focus:ring-accent-emerald/20'
                          : 'bg-white border-emerald-200 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500 focus:ring-emerald-500/20'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      title={showPassword ? 'Hide password' : 'Show password'}
                      className={`absolute right-2.5 p-1 rounded-lg transition-colors ${
                        isDark
                          ? 'text-slate-400 hover:text-slate-200 hover:bg-white/10'
                          : 'text-slate-500 hover:text-slate-800 hover:bg-emerald-50'
                      }`}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Live Password Strength & Policy Checklist (Create Account) */}
                {activeTab === 'signup' && (
                  <div
                    className={`p-3 rounded-xl border space-y-2.5 ${
                      isDark
                        ? 'bg-[#0F1629]/65 border-[#1E293B]'
                        : 'bg-emerald-50/40 border-emerald-200/75'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold">
                      <span className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        PASSWORD STRENGTH
                      </span>
                      <span
                        className={
                          allPasswordChecksPassed
                            ? 'text-accent-emerald'
                            : passedCount >= 3
                            ? 'text-amber-400'
                            : isDark
                            ? 'text-slate-400'
                            : 'text-slate-600'
                        }
                      >
                        {strengthMeta.label} ({passedCount}/5)
                      </span>
                    </div>

                    <div
                      className={`w-full h-1.5 rounded-full overflow-hidden ${
                        isDark ? 'bg-slate-800' : 'bg-emerald-100'
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${strengthMeta.barColor}`}
                        style={{ width: strengthMeta.width }}
                      />
                    </div>

                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                      {passwordChecks.map((rule) => (
                        <li
                          key={rule.id}
                          className={`flex items-center gap-1.5 text-[11px] transition-colors ${
                            rule.passed
                              ? isDark
                                ? 'text-accent-emerald'
                                : 'text-emerald-700 font-medium'
                              : isDark
                              ? 'text-slate-400'
                              : 'text-slate-500'
                          }`}
                        >
                          {rule.passed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-accent-emerald" />
                          ) : (
                            <Circle className="w-3.5 h-3.5 flex-shrink-0 opacity-45" />
                          )}
                          <span>{rule.label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isDisabled || (activeTab === 'signup' && !allPasswordChecksPassed)
                  }
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent-emerald to-indigo-600 hover:brightness-110 active:scale-[0.99] text-white font-bold text-xs flex items-center justify-center gap-2 transition-all disabled:opacity-45 disabled:pointer-events-none shadow-md shadow-emerald-500/20"
                >
                  {submitting === 'form' ? (
                    <>
                      <Activity className="w-4 h-4 animate-spin" />
                      <span>
                        {activeTab === 'signup' ? 'Creating Account...' : 'Authenticating...'}
                      </span>
                    </>
                  ) : cooldownSeconds > 0 ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>Retry in {cooldownSeconds}s</span>
                    </>
                  ) : activeTab === 'signup' ? (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Create Analyst Account</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
