export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="9" height="9" rx="2.6" fill="currentColor" opacity="0.95" />
      <rect x="18" y="5" width="9" height="9" rx="2.6" fill="currentColor" opacity="0.45" />
      <rect x="5" y="18" width="9" height="9" rx="2.6" fill="currentColor" opacity="0.45" />
      <path d="M18.6 19.3c0-.7.75-1.15 1.36-.82l7.1 3.85c.63.34.63 1.25 0 1.6l-7.1 3.85c-.61.33-1.36-.12-1.36-.82v-7.66Z" fill="currentColor" />
    </svg>
  );
}
