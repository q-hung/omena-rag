export default function ProgressBar({ value, className = 'h-1' }) {
  return (
    <span className={`block bg-light-grey ${className}`}>
      <span className="block h-full bg-black transition-[width] duration-600 ease-voima" style={{ width: value }} />
    </span>
  );
}
