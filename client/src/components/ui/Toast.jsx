import { SheetPortal } from './BottomSheet';

export function Toast({ message }) {
  if (!message) return null;
  return <SheetPortal><div className="toast">{message}</div></SheetPortal>;
}
