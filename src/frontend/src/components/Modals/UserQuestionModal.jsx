import { useState } from 'react';

export default function UserQuestionModal({ agentName, question, options = [], onSubmit, onClose, sending }) {
  const cleanOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  const [selected, setSelected] = useState(cleanOptions.length ? 0 : 'custom');
  const [customText, setCustomText] = useState('');

  function submit() {
    let answer;
    if (selected === 'custom') {
      answer = customText.trim();
      if (!answer) return;
    } else {
      const picked = cleanOptions[selected];
      const extra = customText.trim();
      answer = extra ? `${picked} — ${extra}` : picked;
    }
    onSubmit(answer);
  }

  return (
    <div className="user-question-backdrop" onClick={(e) => {
      if (e.target.classList.contains('user-question-backdrop')) onClose();
    }}>
      <div className="user-question-box" role="dialog" aria-label="Agent question">
        <div className="user-question-head">
          <span>
            <i className="fa-solid fa-circle-question" style={{ color: 'var(--gold)' }} />{' '}
            {agentName || 'Agent'} seeks your counsel
          </span>
          <i className="fa-solid fa-xmark" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div className="user-question-body">
          <p className="user-question-text">{question}</p>
          {cleanOptions.length > 0 ? (
            <div className="user-question-options">
              {cleanOptions.map((opt, i) => (
                <label key={i} className={`user-question-option ${selected === i ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="user-question-choice"
                    checked={selected === i}
                    onChange={() => setSelected(i)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
              <label className={`user-question-option custom ${selected === 'custom' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="user-question-choice"
                  checked={selected === 'custom'}
                  onChange={() => setSelected('custom')}
                />
                <span>Something else…</span>
              </label>
            </div>
          ) : (
            <p className="user-question-hint">Speak freely, traveler — no preset answers.</p>
          )}
          {(selected === 'custom' || !cleanOptions.length) ? (
            <textarea
              className="user-question-input"
              rows={2}
              autoFocus
              placeholder="Type your answer… (Enter to send, Shift+Enter for new line)"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          ) : (
            <input
              className="user-question-input"
              placeholder="Add detail (optional)…"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          )}
        </div>
        <div className="user-question-footer">
          <button className="btn-secondary" onClick={onClose}>Later</button>
          <button
            className="btn-primary"
            onClick={submit}
            disabled={sending || (selected === 'custom' && !customText.trim())}
          >
            {sending ? 'Sending…' : 'Send answer'}
          </button>
        </div>
      </div>
    </div>
  );
}
