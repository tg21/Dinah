export default function Modal({ title, icon, onClose, children, footer, wide }) {
  return (
    <div className="modal-backdrop active" onClick={(e) => {
      if (e.target.classList.contains('modal-backdrop')) onClose();
    }}>
      <div className="modal-box" style={wide ? { maxWidth: 760 } : undefined}>
        <div className="modal-title">
          <span>
            <i className={`fa-solid ${icon}`} style={{ color: 'var(--gold)' }} /> {title}
          </span>
          <i className="fa-solid fa-xmark" style={{ cursor: 'pointer' }} onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-btn-row">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="modal-form-group">
      <label>{label}</label>
      {children}
    </div>
  );
}
