import Svg, { Circle, Path, Rect } from 'react-native-svg';

const DARK = '#0A0C0D';

interface IconProps {
  size?: number;
  color?: string;
  filled?: boolean;
}

/** Settings: a solid hexagon nut with a round hole. */
export function SettingsIcon({ size = 26, color = '#FFFFFF' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M10.2 2.5a3.6 3.6 0 0 1 3.6 0l5.7 3.3a3.6 3.6 0 0 1 1.8 3.1v6.2a3.6 3.6 0 0 1-1.8 3.1l-5.7 3.3a3.6 3.6 0 0 1-3.6 0l-5.7-3.3a3.6 3.6 0 0 1-1.8-3.1V8.9a3.6 3.6 0 0 1 1.8-3.1z"
        fill={color}
      />
      <Circle cx={12} cy={12} r={3.6} fill="#2E3438" />
    </Svg>
  );
}

export function ActivityIcon({ size = 28, color = '#FFFFFF', filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={4.5}
        y={2.75}
        width={15}
        height={18.5}
        rx={3}
        stroke={color}
        strokeWidth={1.7}
        fill={filled ? color : 'none'}
      />
      {[8, 11.5, 15].map((y) => (
        <Path
          key={y}
          d={`M8.2 ${y}h${y === 15 ? 4.6 : 7.6}`}
          stroke={filled ? DARK : color}
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      ))}
    </Svg>
  );
}

export function SummaryIcon({ size = 28, color = '#FFFFFF', filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.25} stroke={color} strokeWidth={1.7} fill={filled ? color : 'none'} />
      <Path
        d="M12 12V2.9M12 12l6.6 6.3M12 12l-8.7 2.6"
        stroke={filled ? DARK : color}
        strokeWidth={filled ? 2.2 : 1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function BudgetIcon({ size = 28, color = '#FFFFFF', filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 7.5A3 3 0 0 1 6.5 4.5h10a2 2 0 0 1 2 2v1"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Rect x={3.25} y={7.25} width={17.5} height={13} rx={3} stroke={color} strokeWidth={1.7} fill={filled ? color : 'none'} />
      <Path d="M15.5 13.75h2.2" stroke={filled ? DARK : color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

export function AnalyticsIcon({ size = 28, color = '#FFFFFF', filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {[
        { x: 3.25, y: 10.5, h: 10 },
        { x: 9.75, y: 3.5, h: 17 },
        { x: 16.25, y: 7.5, h: 13 },
      ].map((b) => (
        <Rect
          key={b.x}
          x={b.x}
          y={b.y}
          width={4.5}
          height={b.h}
          rx={2.25}
          stroke={color}
          strokeWidth={1.6}
          fill={filled ? color : 'none'}
        />
      ))}
    </Svg>
  );
}

export function AccountsIcon({ size = 28, color = '#FFFFFF', filled }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3.5 8.2 12 3.2l8.5 5v1.3h-17z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
        fill={filled ? color : 'none'}
      />
      {[6, 10.2, 13.8, 18].map((x) => (
        <Rect key={x} x={x - 0.9} y={11.2} width={1.8} height={6.6} rx={0.9} fill={color} />
      ))}
      <Rect x={3} y={19.2} width={18} height={1.8} rx={0.9} fill={color} />
    </Svg>
  );
}
