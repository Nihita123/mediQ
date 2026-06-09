/**
 * pages/NewTriagePage.jsx  (v3)
 *
 * Full triage conversation with hybrid LLM / rule-based engine.
 *
 * New in v3:
 *  - Tracks medicalEntities, triageResult, aiEngine from the API response
 *  - Passes richer data to the SymptomPanel
 *  - Shows a "Thinking…" label while LLM processes
 *  - Longer timeout handled at the Axios layer (60 s)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Sparkles,
} from 'lucide-react';
import { triageService } from '../services/api';
import ChatWindow from '../components/ui/ChatWindow';
import SymptomPanel from '../components/ui/SymptomPanel';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import AIEngineBadge from '../components/ui/AIEngineBadge';

export default function NewTriagePage() {
  const navigate = useNavigate();

  // ── Session state ──────────────────────────────────────────────────────────
  const [sessionId,       setSessionId]       = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [symptoms,        setSymptoms]        = useState([]);
  const [riskLevel,       setRiskLevel]       = useState('unknown');
  const [department,      setDepartment]      = useState(null);
  const [triageState,     setTriageState]     = useState('STARTED');
  const [medicalEntities, setMedicalEntities] = useState(null);
  const [triageResult,    setTriageResult]    = useState(null);
  const [aiEngine,        setAiEngine]        = useState(null);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [isLoading,    setIsLoading]    = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error,        setError]        = useState('');

  // Guard: prevent double-init in React StrictMode
  const startedRef = useRef(false);

  // ── Start session on mount ─────────────────────────────────────────────────
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const init = async () => {
      try {
        const data = await triageService.start();
        setSessionId(data.sessionId);
        setTriageState(data.triageState);
        setSymptoms(data.extractedSymptoms || []);
        setAiEngine(data.aiEngine || null);
        setMessages([{
          role:      'assistant',
          content:   data.aiReply,
          timestamp: new Date().toISOString(),
        }]);
      } catch (err) {
        setError('Failed to start the triage session. Please try again.');
        console.error(err);
      } finally {
        setInitializing(false);
      }
    };

    init();
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────
  const handleSend = useCallback(async (text) => {
    if (!sessionId || isLoading) return;

    setMessages((prev) => [...prev, {
      role:      'user',
      content:   text,
      timestamp: new Date().toISOString(),
    }]);
    setIsLoading(true);
    setError('');

    try {
      const data = await triageService.sendMessage(sessionId, text);

      setMessages((prev) => [...prev, {
        role:      'assistant',
        content:   data.aiReply,
        timestamp: new Date().toISOString(),
      }]);

      setSymptoms(data.extractedSymptoms     || []);
      setTriageState(data.triageState);
      setRiskLevel(data.riskLevel            || 'unknown');
      setDepartment(data.department          || null);
      setMedicalEntities(data.medicalEntities || null);
      setTriageResult(data.triageResult      || null);
      setAiEngine(data.aiEngine              || null);
    } catch (err) {
      const msg = err.response?.data?.message || 'Something went wrong. Please try again.';
      setError(msg);
      setMessages((prev) => [...prev, {
        role:      'assistant',
        content:   'I encountered an issue. Please try again.',
        timestamp: new Date().toISOString(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, isLoading]);

  const isComplete = triageState === 'SUMMARY_READY';

  // ── Loading screen ─────────────────────────────────────────────────────────
  if (initializing) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner size="lg" label="Starting your triage session..." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-5rem)]">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="p-2 rounded-lg hover:bg-accent text-muted-foreground transition-colors"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">
              New Triage Session
            </h1>
            {sessionId && (
              <p className="text-xs text-muted-foreground">ID: {sessionId}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* AI engine badge */}
          {aiEngine && <AIEngineBadge engine={aiEngine} />}

          {/* Session status pill */}
          {isComplete ? (
            <span className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Complete
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1.5 rounded-full">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="shrink-0 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-2"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* ── Completion banner ─────────────────────────────────────────────── */}
      {isComplete && (
        <div className="shrink-0 rounded-xl bg-green-50 border border-green-200 px-4 py-3 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-green-800">
              Intake complete — clinical report ready
            </p>
            <p className="text-xs text-green-700 mt-0.5">
              Your information has been recorded and a report prepared for your care provider.
            </p>
          </div>
          <button
            onClick={() => navigate(`/sessions/${sessionId}/summary`)}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:underline shrink-0"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            View Report
          </button>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-4">

        {/* Chat window */}
        <div className="min-h-0">
          <ChatWindow
            messages={messages}
            onSend={handleSend}
            isLoading={isLoading}
            disabled={isComplete}
            placeholder="Describe your symptoms…"
            loadingLabel={aiEngine === 'llm' ? 'MediQ AI is thinking…' : undefined}
          />
        </div>

        {/* Sidebar — stacks below on mobile */}
        <div className="flex flex-col gap-3 lg:overflow-y-auto">
          <SymptomPanel
            symptoms={symptoms}
            riskLevel={riskLevel}
            triageState={triageState}
            department={department}
            medicalEntities={medicalEntities}
            triageResult={triageResult}
            aiEngine={aiEngine}
          />

          {/* Disclaimer */}
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 p-3 flex gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-800 leading-relaxed">
              <strong>Not a diagnosis.</strong> MediQ collects intake data only.
              Always consult a qualified healthcare professional.
              In an emergency call <strong>911</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
