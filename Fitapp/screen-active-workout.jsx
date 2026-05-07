// Active Workout — the most important screen
// 5 variants accessible via prop `variant`

function ActiveWorkoutScreen({ variant = 'classic' }) {
  const exercise = {
    name: 'Bench Press',
    plan: 'Push Day · Block A',
    sets: [
      { n: 1, weight: 60, reps: 12, done: true, prev: '60 × 12' },
      { n: 2, weight: 80, reps: 10, done: true, prev: '80 × 9' },
      { n: 3, weight: 90, reps: 8, done: true, prev: '85 × 8', pr: true },
      { n: 4, weight: 90, reps: null, done: false, prev: '85 × 7', active: true },
      { n: 5, weight: null, reps: null, done: false, prev: '85 × 6' },
    ],
  };

  if (variant === 'classic')   return <AWClassic exercise={exercise}/>;
  if (variant === 'console')   return <AWConsole exercise={exercise}/>;
  if (variant === 'focus')     return <AWFocus exercise={exercise}/>;
  if (variant === 'card-stack')return <AWCardStack exercise={exercise}/>;
  if (variant === 'hud')       return <AWHud exercise={exercise}/>;
  return null;
}

// Helpers
function SetCell({ children, mono = true, dim, active, accent, style }) {
  return (
    <div style={{
      flex: 1, height: 44, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      borderRadius: 12,
      background: active ? 'rgba(212,255,58,0.10)' : (dim ? 'transparent' : TOKENS.surface3),
      border: active ? `1px solid ${TOKENS.accent}` : `1px solid ${dim ? 'transparent' : TOKENS.hairline}`,
      fontFamily: mono ? TOKENS.display : TOKENS.font,
      fontSize: 22, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      color: active ? TOKENS.accent : (dim ? TOKENS.label3 : TOKENS.label),
      ...style,
    }}>{children}</div>
  );
}

function RestPill({ remaining = 90, total = 120 }) {
  const m = Math.floor(remaining / 60);
  const s = (remaining % 60).toString().padStart(2, '0');
  const pct = (1 - remaining / total) * 100;
  return (
    <div style={{
      margin: '0 16px', borderRadius: 18, padding: '12px 14px',
      background: 'rgba(28,28,32,0.95)', border: `1px solid ${TOKENS.hairlineStrong}`,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 22,
        background: 'conic-gradient(' + TOKENS.accent + ' ' + pct + '%, rgba(255,255,255,0.08) ' + pct + '%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
      }}>
        <div style={{ position: 'absolute', inset: 4, borderRadius: 99, background: TOKENS.surface, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="timer" size={18} color={TOKENS.accent}/>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Rest</div>
        <div style={{ fontFamily: TOKENS.display, fontSize: 26, fontWeight: 700, color: TOKENS.label, letterSpacing: '-0.01em', lineHeight: 1 }}>
          {m}:{s}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: TOKENS.surface3, border: 'none', color: TOKENS.label, fontFamily: TOKENS.font, fontSize: 12, fontWeight: 600 }}>−10</button>
        <button style={{ width: 36, height: 36, borderRadius: 10, background: TOKENS.surface3, border: 'none', color: TOKENS.label, fontFamily: TOKENS.font, fontSize: 12, fontWeight: 600 }}>+10</button>
      </div>
    </div>
  );
}

// ── V1: CLASSIC + V4 HERO — set-list with hero card on top ──────────────
function AWClassic({ exercise }) {
  const next = exercise.sets.find(s => s.active);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54 }}>
      {/* nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <Icon name="x" size={24} color={TOKENS.label2}/>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Dot color={TOKENS.bad}/>
          <span style={{ fontFamily: TOKENS.display, fontSize: 18, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>00:42:18</span>
        </div>
        <button style={{ background: TOKENS.accent, color: TOKENS.accentInk, border: 'none', height: 32, padding: '0 14px', borderRadius: 10, fontWeight: 700, fontSize: 13 }}>Finish</button>
      </div>

      {/* exercise header */}
      <div style={{ padding: '14px 20px 6px' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Exercise 2 of 6</div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }}>{exercise.name}</div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <Tag color="accent">PR set 3</Tag>
          <Tag>{exercise.plan}</Tag>
        </div>
      </div>

      {/* HERO CARD — current set focus (from V4) */}
      <div style={{ margin: '12px 16px 4px', borderRadius: 22, padding: 16, background: 'linear-gradient(160deg, #1A1F0E, #121214 60%)', border: `1px solid ${TOKENS.hairlineStrong}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 160, height: 160, borderRadius: 999, background: TOKENS.accentDim, filter: 'blur(40px)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <Tag color="accent">SET {next.n} · CURRENT</Tag>
            <span style={{ fontSize: 11, color: TOKENS.label3 }}>Last: {next.prev}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.08em' }}>WEIGHT</div>
              <StatNum value="90" unit="kg" size={48}/>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: TOKENS.hairline, margin: '4px 0' }}/>
            <div>
              <div style={{ fontSize: 10, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.08em' }}>REPS</div>
              <StatNum value="8" size={48} accent/>
            </div>
            <div style={{ flex: 1 }}/>
            <button style={{ width: 52, height: 52, borderRadius: 18, background: TOKENS.accent, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${TOKENS.accentDim}` }}>
              <Icon name="check" size={22} color={TOKENS.accentInk}/>
            </button>
          </div>
        </div>
      </div>

      {/* sets list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '10px 16px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 44px', gap: 8, padding: '4px 4px 8px', fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          <div>Set</div><div style={{ textAlign: 'center' }}>kg</div><div style={{ textAlign: 'center' }}>Reps</div><div/>
        </div>
        {exercise.sets.map(s => (
          <div key={s.n} style={{
            display: 'grid', gridTemplateColumns: '32px 1fr 1fr 44px', gap: 8,
            alignItems: 'center', padding: '6px 4px',
            opacity: s.active ? 1 : 1,
          }}>
            <div style={{ fontFamily: TOKENS.display, fontSize: 22, fontWeight: 700, color: s.pr ? TOKENS.accent : (s.done ? TOKENS.label2 : TOKENS.label) }}>{s.n}</div>
            <SetCell dim={!s.done && !s.active} active={s.active}>{s.weight ?? '—'}</SetCell>
            <SetCell dim={!s.done && !s.active} active={s.active}>{s.reps ?? (s.active ? '8' : '—')}</SetCell>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: s.done ? TOKENS.accent : (s.active ? 'rgba(212,255,58,0.14)' : TOKENS.surface3),
              border: s.active ? `1px solid ${TOKENS.accent}` : 'none',
            }}>
              <Icon name="check" size={18} color={s.done ? TOKENS.accentInk : (s.active ? TOKENS.accent : TOKENS.label3)}/>
            </div>
          </div>
        ))}

        <button style={{
          width: '100%', marginTop: 8, height: 44, borderRadius: 12,
          background: 'transparent', border: `1px dashed ${TOKENS.hairlineStrong}`,
          color: TOKENS.label2, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}><Icon name="plus" size={16}/> Add set</button>

        <div style={{ marginTop: 14, fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 4px' }}>Last session</div>
        <div style={{
          marginTop: 6, padding: '10px 12px', borderRadius: 12,
          background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: TOKENS.label2,
        }}>
          <span>5×8 @ 85kg · Apr 28</span>
          <span style={{ fontFamily: TOKENS.display, color: TOKENS.label }}>Vol 3 400</span>
        </div>
      </div>

      {/* rest timer floating */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 110 }}><RestPill /></div>
      <TabBar active="workouts" condensed/>
    </div>
  );
}

// ── V2: CONSOLE — single huge focus on next set, oversized numbers ───────
function AWConsole({ exercise }) {
  const next = exercise.sets.find(s => s.active);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <Icon name="x" size={24} color={TOKENS.label2}/>
        <span style={{ fontFamily: TOKENS.display, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: TOKENS.label2 }}>42:18</span>
        <Icon name="gear" size={22} color={TOKENS.label2}/>
      </div>

      {/* progress dots */}
      <div style={{ padding: '4px 20px 0' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          {exercise.sets.map(s => (
            <div key={s.n} style={{ flex: 1, height: 4, borderRadius: 99, background: s.done ? TOKENS.accent : (s.active ? 'rgba(212,255,58,0.4)' : 'rgba(255,255,255,0.08)') }}/>
          ))}
        </div>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Set {next.n} of {exercise.sets.length}</div>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{exercise.name}</div>
        <div style={{ fontSize: 13, color: TOKENS.label2, marginTop: 4 }}>Last: {next.prev} · Target 90 × 8</div>
      </div>

      {/* huge wheels */}
      <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <BigStepper label="Weight" unit="kg" value={90} step={2.5} accent/>
        <BigStepper label="Reps" unit="" value={8} step={1}/>
      </div>

      {/* big complete CTA */}
      <div style={{ padding: '0 16px 110px' }}>
        <button style={{
          width: '100%', height: 64, borderRadius: 18, border: 'none',
          background: TOKENS.accent, color: TOKENS.accentInk,
          fontWeight: 700, fontSize: 18, letterSpacing: '0.02em',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: `0 8px 32px ${TOKENS.accentDim}`,
        }}>
          <Icon name="check" size={22} color={TOKENS.accentInk}/>
          Log set & rest 2:00
        </button>
      </div>
      <TabBar active="workouts" condensed/>
    </div>
  );
}

function BigStepper({ label, unit, value, step, accent }) {
  return (
    <div style={{
      borderRadius: 22, padding: '18px 20px',
      background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontSize: 11, color: TOKENS.label3, fontFamily: TOKENS.mono }}>± {step}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button style={{ width: 56, height: 56, borderRadius: 16, background: TOKENS.surface3, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="minus" size={22} color={TOKENS.label}/>
        </button>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ fontFamily: TOKENS.display, fontSize: 76, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.02em', color: accent ? TOKENS.accent : TOKENS.label, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
          {unit && <span style={{ fontSize: 18, color: TOKENS.label2, fontWeight: 500 }}>{unit}</span>}
        </div>
        <button style={{ width: 56, height: 56, borderRadius: 16, background: TOKENS.surface3, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={22} color={TOKENS.label}/>
        </button>
      </div>
    </div>
  );
}

// ── V3: FOCUS — full-bleed, monochrome, current set fills most of screen ──
function AWFocus({ exercise }) {
  const next = exercise.sets.find(s => s.active);
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54, background: 'radial-gradient(120% 70% at 50% 0%, rgba(212,255,58,0.06), transparent 60%), ' + TOKENS.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <Icon name="x" size={24} color={TOKENS.label2}/>
        <div style={{ display: 'flex', gap: 4 }}>{exercise.sets.map(s => (
          <div key={s.n} style={{ width: 8, height: 8, borderRadius: 99, background: s.done ? TOKENS.accent : (s.active ? TOKENS.accent : 'rgba(255,255,255,0.14)'), opacity: s.active ? 1 : (s.done ? 1 : 0.6) }}/>
        ))}</div>
        <span style={{ fontFamily: TOKENS.mono, fontSize: 12, color: TOKENS.label2 }}>3/5</span>
      </div>

      <div style={{ padding: '22px 24px 0' }}>
        <div style={{ fontSize: 13, color: TOKENS.label2, fontWeight: 500 }}>{exercise.plan}</div>
        <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, marginTop: 4 }}>{exercise.name}</div>
      </div>

      {/* huge target */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', color: TOKENS.label3 }}>NEXT SET · TARGET</div>
        <div style={{ fontFamily: TOKENS.display, fontSize: 132, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-0.04em', color: TOKENS.label, fontVariantNumeric: 'tabular-nums' }}>
          90<span style={{ fontSize: 36, color: TOKENS.label2, fontWeight: 500 }}>kg</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: -2 }}>
          <span style={{ fontFamily: TOKENS.display, fontSize: 56, fontWeight: 700, color: TOKENS.accent, lineHeight: 1 }}>×8</span>
          <span style={{ fontSize: 13, color: TOKENS.label3 }}>reps</span>
        </div>
        <div style={{ marginTop: 22, padding: '8px 14px', background: TOKENS.surface, borderRadius: 99, fontSize: 12, color: TOKENS.label2, fontWeight: 500, border: `1px solid ${TOKENS.hairline}` }}>
          Last session <span style={{ color: TOKENS.label, fontFamily: TOKENS.display, fontWeight: 600 }}>{next.prev}</span>
        </div>
      </div>

      {/* swipe-up CTA */}
      <div style={{ padding: '0 16px 110px', display: 'flex', gap: 10 }}>
        <button style={{ width: 64, height: 64, borderRadius: 22, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="edit" size={20} color={TOKENS.label2}/>
        </button>
        <button style={{
          flex: 1, height: 64, borderRadius: 22, border: 'none',
          background: TOKENS.accent, color: TOKENS.accentInk, fontWeight: 700, fontSize: 17,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        }}>
          <Icon name="check" size={22} color={TOKENS.accentInk}/>
          Done — start rest
        </button>
      </div>
      <TabBar active="workouts" condensed/>
    </div>
  );
}

// ── V4: CARD STACK — current set as a hero card, sets below ──────────────
function AWCardStack({ exercise }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <Icon name="x" size={24} color={TOKENS.label2}/>
        <span style={{ fontSize: 13, color: TOKENS.label2 }}>Push Day · Block A</span>
        <button style={{ background: TOKENS.surface3, color: TOKENS.label, border: 'none', height: 30, padding: '0 12px', borderRadius: 8, fontWeight: 600, fontSize: 12 }}>Finish</button>
      </div>

      {/* hero card */}
      <div style={{ margin: '12px 16px 0', borderRadius: 26, padding: 20, background: 'linear-gradient(160deg, #1A1F0E, #121214 60%)', border: `1px solid ${TOKENS.hairlineStrong}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -40, top: -40, width: 180, height: 180, borderRadius: 999, background: TOKENS.accentDim, filter: 'blur(40px)' }}/>
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Tag color="accent">SET 4 · CURRENT</Tag>
            <span style={{ fontFamily: TOKENS.mono, fontSize: 12, color: TOKENS.label3 }}>00:42:18</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em' }}>{exercise.name}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginTop: 18 }}>
            <div>
              <div style={{ fontSize: 10, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.08em' }}>WEIGHT</div>
              <StatNum value="90" unit="kg" size={56}/>
            </div>
            <div style={{ width: 1, alignSelf: 'stretch', background: TOKENS.hairline, margin: '4px 0' }}/>
            <div>
              <div style={{ fontSize: 10, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.08em' }}>REPS</div>
              <StatNum value="8" size={56} accent/>
            </div>
            <div style={{ flex: 1 }}/>
            <button style={{ width: 60, height: 60, borderRadius: 20, background: TOKENS.accent, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 8px 24px ${TOKENS.accentDim}` }}>
              <Icon name="check" size={26} color={TOKENS.accentInk}/>
            </button>
          </div>
          <div style={{ marginTop: 14, fontSize: 12, color: TOKENS.label3 }}>Last week: 85 × 7  →  Suggested 90 × 8</div>
        </div>
      </div>

      {/* sets below */}
      <div style={{ flex: 1, overflow: 'auto', padding: '18px 16px 0' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>All sets</div>
        {exercise.sets.map(s => (
          <div key={s.n} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, marginBottom: 6,
            background: s.active ? 'rgba(212,255,58,0.06)' : 'transparent',
            border: s.active ? `1px solid ${TOKENS.accent}` : `1px solid ${TOKENS.hairline}`,
          }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: s.done ? TOKENS.accent : TOKENS.surface3, color: s.done ? TOKENS.accentInk : TOKENS.label2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, fontFamily: TOKENS.display }}>{s.n}</div>
            <div style={{ flex: 1, fontFamily: TOKENS.display, fontSize: 18, fontWeight: 600, color: s.done ? TOKENS.label : TOKENS.label2 }}>
              {s.weight ?? '—'} <span style={{ color: TOKENS.label3 }}>×</span> {s.reps ?? '—'}
            </div>
            {s.pr && <Tag color="accent">PR</Tag>}
            {s.done && <Icon name="check" size={18} color={TOKENS.good}/>}
          </div>
        ))}
      </div>
      <TabBar active="workouts" condensed/>
    </div>
  );
}

// ── V5: HUD — split top stat strip + ring timer + numpad row ─────────────
function AWHud({ exercise }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px' }}>
        <Icon name="x" size={24} color={TOKENS.label2}/>
        <Tag color="accent"><Dot color={TOKENS.accent}/> Live</Tag>
        <Icon name="gear" size={22} color={TOKENS.label2}/>
      </div>

      {/* HUD strip */}
      <div style={{ display: 'flex', gap: 8, padding: '10px 16px' }}>
        {[
          { l: 'TIME', v: '42:18', mono: true },
          { l: 'VOLUME', v: '3 240', sub: 'kg' },
          { l: 'SETS', v: '3 / 24', accent: true },
        ].map((s, i) => (
          <div key={i} style={{ flex: 1, padding: '10px 12px', borderRadius: 14, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: TOKENS.label3 }}>{s.l}</div>
            <div style={{ fontFamily: TOKENS.display, fontSize: 22, fontWeight: 700, marginTop: 2, color: s.accent ? TOKENS.accent : TOKENS.label, fontVariantNumeric: 'tabular-nums' }}>
              {s.v}{s.sub && <span style={{ fontSize: 11, color: TOKENS.label3, marginLeft: 3 }}>{s.sub}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* exercise + ring */}
      <div style={{ padding: '8px 20px 0' }}>
        <div style={{ fontSize: 12, color: TOKENS.label3, fontWeight: 600 }}>EXERCISE 2 / 6</div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>{exercise.name}</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        {/* Ring */}
        <svg width={240} height={240} viewBox="0 0 240 240">
          <circle cx="120" cy="120" r="106" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14"/>
          <circle cx="120" cy="120" r="106" fill="none" stroke={TOKENS.accent} strokeWidth="14" strokeDasharray="666" strokeDashoffset="200" strokeLinecap="round" transform="rotate(-90 120 120)"/>
        </svg>
        <div style={{ position: 'absolute', textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.16em' }}>REST</div>
          <div style={{ fontFamily: TOKENS.display, fontSize: 76, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>1:30</div>
          <div style={{ fontSize: 12, color: TOKENS.label2, marginTop: 4 }}>Next: 90 kg × 8</div>
        </div>
      </div>

      {/* quick num row */}
      <div style={{ padding: '0 16px 110px', display: 'flex', gap: 8 }}>
        <button style={{ flex: 1, height: 52, borderRadius: 14, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, color: TOKENS.label, fontFamily: TOKENS.display, fontSize: 18, fontWeight: 700 }}>−10s</button>
        <button style={{ flex: 1, height: 52, borderRadius: 14, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, color: TOKENS.label, fontFamily: TOKENS.display, fontSize: 18, fontWeight: 700 }}>+10s</button>
        <button style={{ flex: 2, height: 52, borderRadius: 14, background: TOKENS.accent, border: 'none', color: TOKENS.accentInk, fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icon name="play" size={18} color={TOKENS.accentInk}/> Skip rest · Set 4
        </button>
      </div>
      <TabBar active="workouts" condensed/>
    </div>
  );
}

window.ActiveWorkoutScreen = ActiveWorkoutScreen;
