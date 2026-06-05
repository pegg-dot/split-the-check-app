import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function SheetPortal({ children }) {
  const [el, setEl] = useState(null);
  useEffect(() => { setEl(document.getElementById('sheet-root')); }, []);
  if (!el) return null;
  return createPortal(children, el);
}

export function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <SheetPortal>
      <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
        <div className="sheet"><div className="sheet-grip" />{children}</div>
      </div>
    </SheetPortal>
  );
}
