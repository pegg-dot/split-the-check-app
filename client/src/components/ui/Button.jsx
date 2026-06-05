import { Icon } from './Icon';

export function Button({ variant = 'clay', icon, children, onClick, disabled, full = true, type = 'button', style }) {
  return (
    <button type={type} className={`btn btn-${variant}`} onClick={disabled ? undefined : onClick}
      disabled={disabled} style={{ width: full ? '100%' : 'auto', ...style }}>
      {icon && <Icon name={icon} size={19} stroke={2.1} />}{children}
    </button>
  );
}
