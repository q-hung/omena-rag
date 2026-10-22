const SIZES = {
  sm: 'min-h-[34px] px-[14px] py-2 text-xs',
  md: 'min-h-11 px-[22px] py-[13px] text-sm',
  lg: 'min-h-[54px] px-[30px] py-[17px] text-base',
};

const FILLED = 'border-transparent hover:brightness-[1.14] active:brightness-[1.28]';
const OUTLINED = 'hover:bg-current/7 active:bg-current/14';

const VARIANTS = {
  primary: `bg-black text-white ${FILLED}`,
  accent: `bg-supply-green text-white ${FILLED}`,
  interactive: `bg-interactive text-white ${FILLED}`,
  danger: `bg-negative text-white ${FILLED}`,
  secondary: `bg-transparent text-black border-current ${OUTLINED}`,
  ghost: `bg-transparent text-black border-transparent ${OUTLINED}`,
};

export default function Button({ variant = 'primary', size = 'md', disabled = false, className = '', children, ...rest }) {
  const look = disabled ? 'bg-light-grey text-disabled border-transparent cursor-not-allowed' : VARIANTS[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 border-2 font-bold uppercase leading-[1.2] tracking-caps transition duration-150 ease-voima ${SIZES[size]} ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
