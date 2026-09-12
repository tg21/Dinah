import { useEffect, useRef, useState } from 'react';
import { useApp } from '../../store/AppContext.jsx';
import { api } from '../../api/client.js';
import { escapeHtml, splitLongText } from '../../utils/format.js';
import { QUICK_PROMPTS } from '../../constants/startup.js';
import UserQuestionModal from '../Modals/UserQuestionModal.jsx';

function LogText({ value }) {
  const [expanded, setExpanded] = useState(false);
  const { collapsed, text, preview } = splitLongText(value);
  if (!collapsed) return <div style={{ whiteSpace: 'pre-wrap' }}>{escapeHtml(text)}</div>;
  return (
    <details className="log-details" open={expanded} onToggle={(e) => setExpanded(e.target.open)}>
      <summary>
        {escapeHtml(preview)} <strong>[show {expanded ? 'less' : 'more'}]</strong>
      </summary>
      <div className="log-detail-content">{escapeHtml(text)}</div>
    </details>
  );
}

export default function ChatTab({ engineRef }) {
  const {
    drawerAgent,
    allAgents,
    currentAgentId,
    currentProjectId,
    defaultHarness,
    loadAgents,
    loadAgentDrawer
  } = useApp();
  const [input, setInput] = useState('');
  const [optimistic, setOptimistic] = useState([]);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [sending, setSending] = useState(false);
  const inputRef = useRef(null);
  const scrollRef = useRef(null);

  const agent = drawerAgent || allAgents[currentAgentId] || {};
  const messages = agent.messages || [];
  const awaiting = agent.status === 'awaiting-confirmation';
  const pendingQuestion = agent.pendingUserQuestion || null;
  const needsUser = agent.status === 'awaiting-user' && pendingQuestion?.question;
  const cost = agent.costEstimation || { estCostUsd: 0.015, estTotalTokens: 4500 };

  // Always settle on the latest message when this panel is (re)opened or grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, optimistic.length, currentAgentId]);

  async function send(text) {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setSending(true);
    setOptimistic((o) => [...o, { role: 'user', content: msg, timestamp: Date.now() }]);
    engineRef.current?.launchCourier('user', currentAgentId);
    engineRef.current?.say(currentAgentId, 'Processing directive...');
    try {
      await api.sendMessage({
        agentId: currentAgentId,
        projectId: currentProjectId,
        message: msg,
        harness: defaultHarness
      });
      setOptimistic([]);
      await loadAgentDrawer(currentAgentId);
      await loadAgents();
      engineRef.current?.say(currentAgentId, 'Task completed!');
    } catch (err) {
      engineRef.current?.say(currentAgentId, `Error: ${err.message}`);
    } finally {
      setSending(false);
    }
  }

  async function answerQuestion(answer) {
    setQuestionOpen(false);
    setActiveQuestion(null);
    await send(answer);
  }

  function openQuestion(source) {
    // Prefer the live pending question (has the freshest options); fall back
    // to the clicked bubble's own content so old question cards stay openable
    // even after the hold clears or drawer data goes stale.
    const question = pendingQuestion?.question || source?.question || source?.request || '';
    if (!question) return;
    const options = (pendingQuestion?.options?.length ? pendingQuestion.options : source?.options) || [];
    setActiveQuestion({ question, options });
    setQuestionOpen(true);
  }

  function onQuestionBubbleClick(e, m) {
    // Let text-expand toggles / links inside the bubble behave normally.
    if (e.target?.closest?.('details, summary, a, button')) return;
    openQuestion({ question: m.content || m.text || m.request || '', options: m.options });
  }

  async function confirmSummon() {
    await api.confirmSummon(currentAgentId);
    await loadAgents();
    await loadAgentDrawer(currentAgentId);
  }

  return (
    <>
      {awaiting && (
        <div
          style={{
            background: 'rgba(0,188,212,0.15)',
            border: '1px solid var(--cyan)',
            padding: 10,
            borderRadius: 8,
            marginBottom: 8
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>
            <i className="fa-solid fa-wand-magic-sparkles" style={{ color: 'var(--cyan)' }} />{' '}
            Awaiting Summoning Confirmation
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0' }}>
            Est. Cost: ${Number(cost.estCostUsd).toFixed(4)} • Effort: {agent.effortLevel || 'High'}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <button className="btn-primary" style={{ flex: 1, padding: 5 }} onClick={confirmSummon}>
              <i className="fa-solid fa-check" /> Confirm Summoning
            </button>
          </div>
        </div>
      )}

      {needsUser && (
        <button className="user-question-banner" onClick={() => openQuestion({ question: pendingQuestion.question, options: pendingQuestion.options })}>
          <strong><i className="fa-solid fa-circle-question" /> You have a question</strong>
          <div style={{ marginTop: 4, fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {pendingQuestion.question}
          </div>
          <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>Click to answer…</div>
        </button>
      )}

      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m, i) => {
          const roleCls = m.role === 'user' ? 'user' : m.role === 'system' ? 'system' : 'agent';
          const kindCls = m.kind === 'user-question' ? ' agent-question' : m.kind === 'user-inform' ? ' agent-inform' : '';
          const time = m.timestamp ? new Date(m.timestamp).toLocaleTimeString() : '';
          const isQuestion = m.kind === 'user-question';
          return (
            <div
              key={i}
              className={`msg-bubble ${roleCls}${kindCls}${isQuestion ? ' clickable' : ''}`}
              {...(isQuestion ? { onClick: (e) => onQuestionBubbleClick(e, m), title: 'Click to answer…', role: 'button', tabIndex: 0, onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openQuestion({ question: m.content || m.text || m.request || '', options: m.options }); } } } : {})}
            >  <div className="msg-header">
                <strong>{m.role === 'user' ? 'You (Overseer)' : agent.name || 'Agent'}</strong>
                <span>{time}</span>
                {m.kind === 'user-question' && <span className="msg-kind-tag question">Question</span>}
                {m.kind === 'user-inform' && <span className="msg-kind-tag inform">Update</span>}
                {m.simulated && (
                  <span
                    title="Produced by the fallback simulator, not a live harness run"
                    style={{ fontSize: 9, background: 'rgba(255,193,7,0.2)', color: 'var(--amber, #ffc107)', padding: '1px 6px', borderRadius: 4, marginLeft: 6 }}
                  >
                    simulated
                  </span>
                )}
              </div>
            <LogText value={m.content || m.text || m.request || ''} />
            {m.kind === 'user-question' && Array.isArray(m.options) && m.options.length > 0 && (
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.8 }}>
                Options: {m.options.join(' • ')}
              </div>
            )}
            {isQuestion && (
              <div style={{ marginTop: 6, fontSize: 10, fontWeight: 800, color: '#8f3d2b' }}>
                <i className="fa-solid fa-circle-question" /> Click to answer…
              </div>
            )}
            </div>
          );
        })}
        {optimistic.map((m, i) => (
          <div key={`opt-${i}`} className="msg-bubble user">
            <div className="msg-header">
              <strong>You (Overseer)</strong>
              <span>Just now</span>
            </div>
            <div>{escapeHtml(m.content)}</div>
          </div>
        ))}
      </div>
      <div className="chat-suggestions">
        {QUICK_PROMPTS.map(([label, prompt]) => (
          <button key={label} className="chip-btn" onClick={() => send(prompt)}>
            {label}
          </button>
        ))}
      </div>
      <div className="chat-input-box">
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="+ Type directive for this agent... (Enter to send, Shift+Enter for new line)"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={() => send()} aria-label="Send directive">
          <i className="fa-solid fa-paper-plane" />
        </button>
      </div>
      {questionOpen && activeQuestion?.question && (
        <UserQuestionModal
          agentName={agent.name}
          question={activeQuestion.question}
          options={activeQuestion.options || []}
          sending={sending}
          onClose={() => { setQuestionOpen(false); setActiveQuestion(null); }}
          onSubmit={answerQuestion}
        />
      )}
    </>
  );
}
