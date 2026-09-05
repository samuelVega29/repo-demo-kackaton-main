export default function FlowStep({ number, eyebrow, title, desc, open, onToggle, children, badge }) {
  return (
    <section className={`flow-step ${open ? 'open' : 'closed'}`}>
      <button className="flow-step-head" onClick={onToggle} aria-expanded={open} type="button">
        <span className="step-num">{number}</span>
        <span className="step-text"><span className="eyebrow">{eyebrow}</span><b>{title}</b></span>
        {badge && <span className="step-badge">{badge}</span>}
        <span className="step-toggle">{open ? '–' : '+'}</span>
      </button>
      {open && <div className="flow-step-body">{children}</div>}
    </section>
  )
}