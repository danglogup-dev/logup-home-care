import horizontalLogo from "@/assets/LogUp_horizontal.png.asset.json";
import faviconLogo from "@/assets/LogUp_favicon.png.asset.json";

interface LogUpLogoProps {
  variant?: 'horizontal' | 'mark';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const horizontalSizes = {
  sm: 'w-[96px] h-auto max-h-8',
  md: 'w-[112px] h-auto max-h-10',
  lg: 'w-[160px] h-auto max-h-12',
};

const markHeights = {
  sm: 'h-7',   // ~28px
  md: 'h-8',   // ~32px
  lg: 'h-10',
};

const LogUpLogo = ({ variant = 'horizontal', size = 'md', className = '' }: LogUpLogoProps) => {
  const asset = variant === 'mark' ? faviconLogo : horizontalLogo;
  const sizing = variant === 'mark' ? `${markHeights[size]} w-auto` : horizontalSizes[size];
  return (
    <img
      src={asset.url}
      alt="LogUp"
      className={`block object-contain shrink-0 ${sizing} ${className}`}
    />
  );
};

export default LogUpLogo;
