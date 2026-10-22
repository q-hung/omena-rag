const SIZES = {
  sm: 'min-h-8 px-2.5 py-1 text-xs',
  md: 'min-h-9 px-3 py-2 text-sm',
  lg: 'min-h-11 px-5 py-2.5 text-base',
};

const FILLED = 'border-transparent shadow-xs';

const VARIANTS = {
  primary: `bg-accent text-white hover:bg-accent-dark ${FILLED}`,
  accent: `bg-supply-green text-white hover:brightness-110 ${FILLED}`,
  interactive: `bg-accent text-white hover:bg-accent-dark ${FILLED}`,
  danger: `bg-negative text-white hover:brightness-110 ${FILLED}`,
  secondary: 'bg-white text-secondary border-hairline shadow-xs hover:border-rule hover:text-black',
  ghost: 'bg-transparent text-secondary border-transparent hover:bg-light-grey hover:text-black',
};

export default function Button({ variant = 'primary', size = 'md', disabled = false, className = '', children, ...rest }) {
  const look = disabled ? 'bg-light-grey text-disabled border-transparent cursor-not-allowed' : VARIANTS[variant];
  return (
    <button
      type="button"
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-lg border font-medium leading-[1.2] whitespace-nowrap transition duration-150 ease-voima ${SIZES[size]} ${look} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
