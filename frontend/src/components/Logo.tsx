interface LogoProps {
  className?: string;
  title?: string;
}

export default function Logo({
  className = 'h-9 w-9 shrink-0',
  title = 'SnapFeed.ai',
}: LogoProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 40 40"
      fill="none"
      className={className}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <rect width="40" height="40" rx="10" fill="#0F172A" />
      <text
        x="11.5"
        y="28"
        fill="#FFFFFF"
        fontFamily="Inter, ui-sans-serif, system-ui, sans-serif"
        fontSize="21"
        fontWeight="700"
      >
        S
      </text>
      <g transform="translate(18.5, 5.5) scale(0.48)">
        <path
          fill="#F59E0B"
          d="M12 2L3.5 13H11V22L19.5 11H12V2Z"
        />
      </g>
    </svg>
  );
}
