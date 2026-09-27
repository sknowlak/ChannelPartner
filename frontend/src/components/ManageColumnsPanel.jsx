import { useState } from 'react';

// Dropdown panel for showing/hiding and drag-reordering grid columns
// (section 40). `columns` is the full manageable set as {key, label} in
// their CURRENT order; `hidden` is the set of currently-hidden keys.
// Changes apply live (no separate "Apply" step) - onChange(newOrder, newHidden).
export default function ManageColumnsPanel({ columns, hidden, onChange, onClose, onReset }) {
  const [dragIndex, setDragIndex] = useState(null);

  const toggleHidden = (key) => {
    const next = hidden.includes(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    onChange(columns.map((c) => c.key), next);
  };

  const showAll = () => onChange(columns.map((c) => c.key), []);

  const handleDrop = (dropIndex) => {
    if (dragIndex === null || dragIndex === dropIndex) return;
    const order = columns.map((c) => c.key);
    const [moved] = order.splice(dragIndex, 1);
    order.splice(dropIndex, 0, moved);
    onChange(order, hidden);
    setDragIndex(null);
  };

  return (
    <div className="column-panel card">
      <div className="column-panel-header">
        <strong>Manage Columns</strong>
        <button className="link" onClick={onClose}>Close</button>
      </div>
      <p className="hint" style={{ margin: '0 0 0.6rem' }}>Drag to reorder · check to show</p>
      <div className="column-panel-list">
        {columns.map((col, i) => (
          <div
            key={col.key}
            className="column-panel-row"
            draggable
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => handleDrop(i)}
          >
            <span className="drag-handle">⋮⋮</span>
            <label>
              <input type="checkbox" checked={!hidden.includes(col.key)} onChange={() => toggleHidden(col.key)} />
              {col.label}
            </label>
          </div>
        ))}
      </div>
      <div className="column-panel-footer">
        <button className="secondary" onClick={showAll}>Show All</button>
        <button className="secondary" onClick={onReset}>Reset to Default</button>
      </div>
    </div>
  );
}
