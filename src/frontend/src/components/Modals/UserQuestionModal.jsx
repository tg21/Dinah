import { useRef, useState } from 'react';

export default function UserQuestionModal({ agentName, question, options = [], onSubmit, onClose, sending }) {
  const cleanOptions = Array.isArray(options) ? options.filter(Boolean) : [];
  const [selected, setSelected] = useState(cleanOptions.length ? 0 : 'custom');
  const [customText, setCustomText] = useState('');
  const detailRef = useRef(null);

  function growDetail(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

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

  const needsDetail = selected === 'custom' || !cleanOptions.length;

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
          <textarea
            ref={detailRef}
            className="user-question-input"
            rows={needsDetail ? 2 : 1}
            autoFocus={needsDetail}
            placeholder={needsDetail ? 'Type your answer… (Enter to send, Shift+Enter for new line)' : 'Add detail (optional)… (Enter to send, Shift+Enter for new line)'}
            value={customText}
            onChange={(e) => {
              setCustomText(e.target.value);
              growDetail(e.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
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
