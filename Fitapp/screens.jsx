// FitTrack Pro — Mobile Redesign
// Dark-first, Volt accent, iOS-native feel
// Screens for iPhone 15 Pro (402x874 in design canvas)

const VW = 402;
const VH = 874;

// ─── Tokens (consumed by all screens) ────────────────────────────────────
const TOKENS = {
  bg: '#070708',         // canvas
  surface: '#121214',    // cards
  surface2: '#1B1B1F',   // raised
  surface3: '#26262B',   // chips/inputs
  hairline: 'rgba(255,255,255,0.08)',
  hairlineStrong: 'rgba(255,255,255,0.14)',
  label: '#F4F4F6',
  label2: '#9A9AA2',
  label3: '#5E5E66',
  // Volt — high-contrast lime
  accent: '#D4FF3A',
  accentDim: 'rgba(212,255,58,0.14)',
  accentInk: '#0A1300',
  good: '#5BD96B',
  warn: '#FFB54A',
  bad: '#FF5E6B',
  font: '-apple-system, "SF Pro Text", "SF Pro", "Inter", system-ui, sans-serif',
  display: '"Barlow Condensed", "SF Pro Display", -apple-system, sans-serif',
  mono: '"SF Mono", ui-monospace, "Menlo", monospace',
};

// ─── Atoms ────────────────────────────────────────────────────────────────
function Tag({ children, color, style }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      textTransform: 'uppercase',
      padding: '3px 8px', borderRadius: 6,
      background: color === 'accent' ? TOKENS.accentDim : 'rgba(255,255,255,0.06)',
      color: color === 'accent' ? TOKENS.accent : TOKENS.label2,
      ...style,
    }}>{children}</span>
  );
}

function Dot({ color = TOKENS.accent, size = 6 }) {
  return <span style={{
    width: size, height: size, borderRadius: 999, background: color,
    display: 'inline-block', boxShadow: color === TOKENS.accent ? `0 0 8px ${color}` : 'none',
  }}/>;
}

function StatNum({ value, unit, accent, size = 40 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 4,
      fontFamily: TOKENS.display,
      color: accent ? TOKENS.accent : TOKENS.label,
      fontWeight: 700, lineHeight: 0.9,
      fontSize: size, letterSpacing: '-0.01em',
      fontVariantNumeric: 'tabular-nums',
    }}>
      <span>{value}</span>
      {unit && <span style={{
        fontSize: size * 0.36, fontWeight: 500,
        color: TOKENS.label2, fontFamily: TOKENS.font, letterSpacing: 0,
      }}>{unit}</span>}
    </div>
  );
}

// SF Symbols-ish icons (stroke 1.5, sized 22)
function Icon({ name, size = 22, color = 'currentColor' }) {
  const s = { width: size, height: size, fill: 'none', stroke: color, strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home': return <svg viewBox="0 0 24 24" style={s}><path d="M3 11l9-7 9 7v9a2 2 0 0 1-2 2h-4v-7h-6v7H5a2 2 0 0 1-2-2v-9z"/></svg>;
    case 'dumbbell': return <svg viewBox="0 0 24 24" style={s}><path d="M2 12h2M22 12h-2M5 7v10M19 7v10M8 9v6h8V9z"/></svg>;
    case 'sparkle': return <svg viewBox="0 0 24 24" style={s}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></svg>;
    case 'list': return <svg viewBox="0 0 24 24" style={s}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>;
    case 'clipboard': return <svg viewBox="0 0 24 24" style={s}><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h4"/></svg>;
    case 'play': return <svg viewBox="0 0 24 24" style={{ ...s, fill: color }}><path d="M7 4l13 8-13 8z"/></svg>;
    case 'pause': return <svg viewBox="0 0 24 24" style={s}><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>;
    case 'check': return <svg viewBox="0 0 24 24" style={s}><path d="M5 12l5 5L20 7"/></svg>;
    case 'plus': return <svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14"/></svg>;
    case 'minus': return <svg viewBox="0 0 24 24" style={s}><path d="M5 12h14"/></svg>;
    case 'flame': return <svg viewBox="0 0 24 24" style={s}><path d="M12 3s4 4 4 9a4 4 0 0 1-8 0c0-2 1-3 1-3s-1-1-1-3 4-3 4-3z"/></svg>;
    case 'trophy': return <svg viewBox="0 0 24 24" style={s}><path d="M7 4h10v3a5 5 0 0 1-10 0V4zM12 12v4M8 20h8M4 4h3v2a3 3 0 0 1-3 3V4zM20 4h-3v2a3 3 0 0 0 3 3V4z"/></svg>;
    case 'chart': return <svg viewBox="0 0 24 24" style={s}><path d="M4 20V8M10 20V4M16 20v-7M22 20H2"/></svg>;
    case 'arrow-up': return <svg viewBox="0 0 24 24" style={s}><path d="M12 19V5M5 12l7-7 7 7"/></svg>;
    case 'arrow-right': return <svg viewBox="0 0 24 24" style={s}><path d="M5 12h14M13 5l7 7-7 7"/></svg>;
    case 'chevron': return <svg viewBox="0 0 24 24" style={s}><path d="M9 6l6 6-6 6"/></svg>;
    case 'timer': return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/></svg>;
    case 'gear': return <svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>;
    case 'mic': return <svg viewBox="0 0 24 24" style={s}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>;
    case 'send': return <svg viewBox="0 0 24 24" style={{ ...s, fill: color }}><path d="M3 11l18-8-8 18-2-8-8-2z"/></svg>;
    case 'search': return <svg viewBox="0 0 24 24" style={s}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>;
    case 'x': return <svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'edit': return <svg viewBox="0 0 24 24" style={s}><path d="M4 20h4l10-10-4-4L4 16v4zM14 6l4 4"/></svg>;
    case 'history': return <svg viewBox="0 0 24 24" style={s}><path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2"/></svg>;
    case 'bolt': return <svg viewBox="0 0 24 24" style={{...s, fill: color, stroke: 'none'}}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></svg>;
    default: return null;
  }
}

// ─── Frame helper: status bar + content ──────────────────────────────────
function PhoneFrame({ children, label, hideStatus, hideHome, dark = true }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: VW, height: VH, borderRadius: 55, overflow: 'hidden',
        position: 'relative', background: TOKENS.bg,
        boxShadow: '0 40px 80px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06), inset 0 0 0 8px #1a1a1f',
        fontFamily: TOKENS.font,
        WebkitFontSmoothing: 'antialiased',
        color: TOKENS.label,
      }}>
        {/* dynamic island */}
        <div style={{
          position: 'absolute', top: 11, left: '50%', transform: 'translateX(-50%)',
          width: 124, height: 36, borderRadius: 22, background: '#000', zIndex: 50,
        }} />
        {/* status bar */}
        {!hideStatus && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 40,
            height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 32px 0', boxSizing: 'border-box', pointerEvents: 'none',
          }}>
            <span style={{ fontSize: 16, fontWeight: 600, color: TOKENS.label }}>9:41</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="18" height="11" viewBox="0 0 18 11"><g fill={TOKENS.label}>
                <rect x="0" y="7" width="3" height="4" rx="0.6"/>
                <rect x="4.5" y="5" width="3" height="6" rx="0.6"/>
                <rect x="9" y="2.5" width="3" height="8.5" rx="0.6"/>
                <rect x="13.5" y="0" width="3" height="11" rx="0.6"/>
              </g></svg>
              <svg width="25" height="12" viewBox="0 0 25 12">
                <rect x="0.5" y="0.5" width="21" height="11" rx="3" stroke={TOKENS.label} strokeOpacity="0.4" fill="none"/>
                <rect x="2" y="2" width="18" height="8" rx="1.5" fill={TOKENS.accent}/>
                <path d="M23 4v4c.7-.3 1.3-1.1 1.3-2s-.6-1.7-1.3-2z" fill={TOKENS.label} fillOpacity="0.4"/>
              </svg>
            </span>
          </div>
        )}
        {/* content */}
        <div style={{ position: 'absolute', inset: 0 }}>{children}</div>
        {/* home indicator */}
        {!hideHome && (
          <div style={{
            position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
            width: 134, height: 5, borderRadius: 99, background: TOKENS.label, zIndex: 60,
          }}/>
        )}
      </div>
      {label && <div style={{
        fontSize: 11, color: '#888', fontFamily: TOKENS.mono, letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}>{label}</div>}
    </div>
  );
}

// ─── Bottom Tab Bar (shared) ─────────────────────────────────────────────
function TabBar({ active = 'workouts', condensed }) {
  const tabs = [
    { id: 'home', icon: 'home', label: 'Home' },
    { id: 'workouts', icon: 'dumbbell', label: 'Train' },
    { id: 'coach', icon: 'sparkle', label: 'Coach' },
    { id: 'plans', icon: 'clipboard', label: 'Plans' },
    { id: 'exercises', icon: 'list', label: 'Library' },
  ];
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
      paddingBottom: 28, paddingTop: 8,
      background: 'linear-gradient(to top, rgba(7,7,8,0.96) 60%, rgba(7,7,8,0))',
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{
        margin: '0 12px', height: 58, display: 'flex',
        background: 'rgba(28,28,32,0.92)',
        border: `1px solid ${TOKENS.hairline}`,
        borderRadius: 22,
      }}>
        {tabs.map(t => {
          const isActive = t.id === active;
          return (
            <div key={t.id} style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              color: isActive ? TOKENS.accent : TOKENS.label3,
              position: 'relative',
            }}>
              {isActive && <div style={{
                position: 'absolute', top: 6, width: 28, height: 3, borderRadius: 9,
                background: TOKENS.accent, boxShadow: `0 0 12px ${TOKENS.accent}`,
              }}/>}
              <Icon name={t.icon} size={22} color={isActive ? TOKENS.accent : TOKENS.label3}/>
              {!condensed && <span style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
              }}>{t.label}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Top Title (large + caption) ─────────────────────────────────────────
function PageHeader({ kicker, title, action }) {
  return (
    <div style={{
      padding: '8px 20px 12px', display: 'flex',
      alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
    }}>
      <div style={{ minWidth: 0 }}>
        {kicker && <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: TOKENS.label3, marginBottom: 4,
        }}>{kicker}</div>}
        <div style={{
          fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em',
          color: TOKENS.label, lineHeight: 1.05,
        }}>{title}</div>
      </div>
      {action}
    </div>
  );
}

// Make tokens & helpers global for screen files
Object.assign(window, { TOKENS, VW, VH, Tag, Dot, StatNum, Icon, PhoneFrame, TabBar, PageHeader });
