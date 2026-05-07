// Other screens: Dashboard, Workouts list, Plans, Exercises, Records, Coach, Settings

function DashboardScreen() {
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader kicker="Tuesday · May 5" title="Hi, Alex" action={
        <div style={{ width: 40, height: 40, borderRadius: 20, background: TOKENS.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>A</span>
        </div>
      }/>

      {/* Up next card */}
      <div style={{ margin: '4px 16px 0', borderRadius: 22, padding: 18, background: 'linear-gradient(140deg, #1B2207, #121214 70%)', border: `1px solid ${TOKENS.hairlineStrong}`, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 220, height: 220, borderRadius: 999, background: TOKENS.accentDim, filter: 'blur(50px)' }}/>
        <div style={{ position: 'relative' }}>
          <Tag color="accent">UP NEXT · TODAY</Tag>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 10 }}>Push Day · Block A</div>
          <div style={{ fontSize: 13, color: TOKENS.label2, marginTop: 4 }}>6 exercises · ~58 min · est. vol 8 200 kg</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button style={{ flex: 1, height: 48, borderRadius: 14, background: TOKENS.accent, color: TOKENS.accentInk, border: 'none', fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Icon name="play" size={18} color={TOKENS.accentInk}/> Start workout
            </button>
            <button style={{ width: 48, height: 48, borderRadius: 14, background: TOKENS.surface3, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="edit" size={18} color={TOKENS.label}/>
            </button>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>This week</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { l: 'Sessions', v: '3', s: 'of 4', icon: 'dumbbell' },
            { l: 'Streak', v: '12', s: 'days', icon: 'flame', accent: true },
            { l: 'Volume', v: '24.8', s: 'k kg', icon: 'chart' },
            { l: 'PRs', v: '4', s: 'this month', icon: 'trophy', accent: true },
          ].map((s, i) => (
            <div key={i} style={{ padding: 14, borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.l}</span>
                <Icon name={s.icon} size={16} color={s.accent ? TOKENS.accent : TOKENS.label3}/>
              </div>
              <StatNum value={s.v} unit={s.s} size={32} accent={s.accent}/>
            </div>
          ))}
        </div>
      </div>

      {/* Volume chart */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, padding: '0 4px' }}>
          <span style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Volume · 8 weeks</span>
          <span style={{ fontSize: 11, color: TOKENS.accent, fontWeight: 600 }}>+18% ↑</span>
        </div>
        <div style={{ padding: 16, borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}` }}>
          <svg viewBox="0 0 320 100" width="100%" height="100">
            <defs>
              <linearGradient id="g1" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={TOKENS.accent} stopOpacity="0.4"/>
                <stop offset="1" stopColor={TOKENS.accent} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d="M0 70 L40 60 L80 65 L120 50 L160 55 L200 38 L240 32 L280 25 L320 20 L320 100 L0 100 Z" fill="url(#g1)"/>
            <path d="M0 70 L40 60 L80 65 L120 50 L160 55 L200 38 L240 32 L280 25 L320 20" fill="none" stroke={TOKENS.accent} strokeWidth="2"/>
            {[0,40,80,120,160,200,240,280,320].map((x,i) => {
              const y = [70,60,65,50,55,38,32,25,20][i];
              return <circle key={i} cx={x} cy={y} r={i === 8 ? 4 : 2} fill={TOKENS.accent}/>;
            })}
          </svg>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: TOKENS.label3, fontFamily: TOKENS.mono }}>
            <span>W1</span><span>W3</span><span>W5</span><span>W7</span><span>NOW</span>
          </div>
        </div>
      </div>

      {/* Recent records */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8, padding: '0 4px' }}>Recent PRs</div>
        <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
          {[
            { e: 'Bench Press', v: '92.5 kg × 6', d: 'Today' },
            { e: 'Deadlift', v: '180 kg × 3', d: '2d ago' },
            { e: 'Pull-up', v: '+25 kg × 5', d: '5d ago' },
          ].map((r, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: TOKENS.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trophy" size={16} color={TOKENS.accent}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{r.e}</div>
                <div style={{ fontSize: 12, color: TOKENS.label3 }}>{r.d}</div>
              </div>
              <div style={{ fontFamily: TOKENS.display, fontSize: 18, fontWeight: 700, color: TOKENS.accent, fontVariantNumeric: 'tabular-nums' }}>{r.v}</div>
            </div>
          ))}
        </div>
      </div>

      <TabBar active="home"/>
    </div>
  );
}

function WorkoutsListScreen() {
  const sessions = [
    { d: 'TODAY', items: [{ name: 'Push Day · Block A', t: 'In progress · 42 min', live: true }] },
    { d: 'THIS WEEK', items: [
      { name: 'Pull Day · Block A', t: 'Mon · 1h 02m · 12 sets', vol: '6 200' },
      { name: 'Legs Heavy', t: 'Sun · 58 min · 14 sets', vol: '8 900' },
    ]},
    { d: 'LAST WEEK', items: [
      { name: 'Push Day · Block A', t: 'Apr 28 · 51 min', vol: '7 100' },
      { name: 'Pull Day · Block A', t: 'Apr 26 · 48 min', vol: '6 050' },
      { name: 'Legs Heavy', t: 'Apr 24 · 55 min', vol: '8 400' },
    ]},
  ];
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader title="Workouts" action={
        <button style={{ height: 36, padding: '0 14px', borderRadius: 12, background: TOKENS.accent, border: 'none', color: TOKENS.accentInk, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="plus" size={16} color={TOKENS.accentInk}/> Start
        </button>
      }/>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, padding: '4px 16px 8px', overflowX: 'auto' }}>
        {['All', 'Push', 'Pull', 'Legs', 'Cardio'].map((f, i) => (
          <div key={f} style={{ height: 32, padding: '0 14px', borderRadius: 99, background: i === 0 ? TOKENS.accent : TOKENS.surface3, color: i === 0 ? TOKENS.accentInk : TOKENS.label2, fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{f}</div>
        ))}
      </div>

      {sessions.map((g, gi) => (
        <div key={gi} style={{ padding: '12px 16px 0' }}>
          <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>{g.d}</div>
          <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
            {g.items.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none' }}>
                <div style={{ width: 38, height: 38, borderRadius: 12, background: s.live ? TOKENS.accentDim : TOKENS.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {s.live ? <Dot color={TOKENS.accent}/> : <Icon name="dumbbell" size={18} color={TOKENS.label2}/>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: TOKENS.label3, marginTop: 2 }}>{s.t}</div>
                </div>
                {s.vol && <div style={{ fontFamily: TOKENS.display, fontSize: 16, fontWeight: 600, color: TOKENS.label2, fontVariantNumeric: 'tabular-nums' }}>{s.vol}<span style={{ fontSize: 11, color: TOKENS.label3, marginLeft: 2 }}>kg</span></div>}
                {s.live && <Tag color="accent">LIVE</Tag>}
                <Icon name="chevron" size={16} color={TOKENS.label3}/>
              </div>
            ))}
          </div>
        </div>
      ))}
      <TabBar active="workouts"/>
    </div>
  );
}

function PlansScreen() {
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader title="Plans" action={
        <button style={{ width: 36, height: 36, borderRadius: 12, background: TOKENS.surface3, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={18} color={TOKENS.label}/>
        </button>
      }/>

      {/* Active plan hero */}
      <div style={{ margin: '0 16px', borderRadius: 22, padding: 18, background: TOKENS.surface, border: `1px solid ${TOKENS.hairlineStrong}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Tag color="accent">ACTIVE</Tag>
          <span style={{ fontSize: 11, color: TOKENS.label3, fontFamily: TOKENS.mono }}>WEEK 3 / 8</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', marginTop: 8 }}>Hypertrophy 5x/week</div>
        <div style={{ fontSize: 12, color: TOKENS.label3, marginTop: 4 }}>Upper / lower split · progressive overload</div>

        {/* week strip */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
          {['M','T','W','T','F','S','S'].map((d, i) => {
            const done = i < 2; const today = i === 1;
            return (
              <div key={i} style={{ flex: 1, height: 52, borderRadius: 12, background: done ? TOKENS.accent : TOKENS.surface3, border: today ? `1px solid ${TOKENS.accent}` : 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: done ? TOKENS.accentInk : TOKENS.label2 }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em' }}>{d}</div>
                <div style={{ fontFamily: TOKENS.display, fontSize: 16, fontWeight: 700, marginTop: 2 }}>{i+5}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* sessions in this week */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>THIS WEEK · 3 OF 5</div>
        <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
          {[
            { n: 'Push Day · Block A', e: 6, d: 'Mon', done: true },
            { n: 'Pull Day · Block A', e: 6, d: 'Tue', live: true },
            { n: 'Legs Heavy', e: 7, d: 'Thu' },
            { n: 'Push Day · Block B', e: 6, d: 'Fri' },
            { n: 'Pull Day · Block B', e: 6, d: 'Sat' },
          ].map((s, i, arr) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none', opacity: s.done ? 0.5 : 1 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: TOKENS.surface3, color: TOKENS.label, fontFamily: TOKENS.display, fontSize: 12, fontWeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: 9, color: TOKENS.label3 }}>{s.d}</span>
                <span>{i+5}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, textDecoration: s.done ? 'line-through' : 'none' }}>{s.n}</div>
                <div style={{ fontSize: 11, color: TOKENS.label3, marginTop: 2 }}>{s.e} exercises · ~55 min</div>
              </div>
              {s.live && <Tag color="accent">TODAY</Tag>}
              {s.done && <Icon name="check" size={18} color={TOKENS.good}/>}
              {!s.done && !s.live && <Icon name="chevron" size={16} color={TOKENS.label3}/>}
            </div>
          ))}
        </div>
      </div>
      <TabBar active="plans"/>
    </div>
  );
}

function ExercisesScreen() {
  const groups = [
    { l: 'CHEST', items: [{ n: 'Bench Press', t: '4×8 · 90 kg', tag: 'PR' }, { n: 'Incline DB Press', t: '3×10 · 28 kg' }] },
    { l: 'BACK', items: [{ n: 'Deadlift', t: '5×3 · 180 kg' }, { n: 'Pull-up', t: '4×8 · BW+25' }, { n: 'Barbell Row', t: '4×8 · 75 kg' }] },
    { l: 'LEGS', items: [{ n: 'Back Squat', t: '5×5 · 130 kg' }, { n: 'Romanian DL', t: '3×10 · 110 kg' }] },
  ];
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader title="Exercises"/>
      {/* Search */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 44, padding: '0 14px', borderRadius: 14, background: TOKENS.surface3, border: `1px solid ${TOKENS.hairline}` }}>
          <Icon name="search" size={18} color={TOKENS.label3}/>
          <span style={{ fontSize: 14, color: TOKENS.label3 }}>Search 184 exercises</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px', overflowX: 'auto' }}>
        {['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'].map((f, i) => (
          <div key={f} style={{ height: 30, padding: '0 12px', borderRadius: 99, background: i === 0 ? TOKENS.accent : 'transparent', border: i === 0 ? 'none' : `1px solid ${TOKENS.hairlineStrong}`, color: i === 0 ? TOKENS.accentInk : TOKENS.label2, fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center' }}>{f}</div>
        ))}
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '8px 16px 0' }}>
          <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>{g.l}</div>
          <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
            {g.items.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: TOKENS.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="dumbbell" size={18} color={TOKENS.label2}/>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{e.n}</div>
                  <div style={{ fontSize: 12, color: TOKENS.label3, marginTop: 1 }}>{e.t}</div>
                </div>
                {e.tag && <Tag color="accent">{e.tag}</Tag>}
                <Icon name="chevron" size={16} color={TOKENS.label3}/>
              </div>
            ))}
          </div>
        </div>
      ))}
      <TabBar active="exercises"/>
    </div>
  );
}

function RecordsScreen() {
  const lifts = [
    { n: 'Bench Press', v: '92.5', x: '× 6', delta: '+2.5', recent: true },
    { n: 'Back Squat', v: '142.5', x: '× 3', delta: '+5' },
    { n: 'Deadlift', v: '180', x: '× 3', delta: '+5', recent: true },
    { n: 'Overhead Press', v: '60', x: '× 5' },
    { n: 'Pull-up (+kg)', v: '25', x: '× 5', recent: true },
    { n: 'Barbell Row', v: '85', x: '× 6' },
  ];
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader title="Records" kicker="4 PRs this month"/>

      {/* hero number */}
      <div style={{ margin: '0 16px', padding: 20, borderRadius: 22, background: 'linear-gradient(160deg, #1B2207, #121214 70%)', border: `1px solid ${TOKENS.hairlineStrong}` }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em' }}>ESTIMATED 1RM · BENCH</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
          <span style={{ fontFamily: TOKENS.display, fontSize: 72, fontWeight: 700, color: TOKENS.accent, letterSpacing: '-0.02em', lineHeight: 0.9, fontVariantNumeric: 'tabular-nums' }}>108</span>
          <span style={{ fontSize: 18, color: TOKENS.label2 }}>kg</span>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: TOKENS.accent, fontWeight: 600 }}>+4.2% ↑</span>
        </div>
        {/* mini sparkline */}
        <svg viewBox="0 0 320 60" width="100%" height="50" style={{ marginTop: 8 }}>
          <path d="M0 50 L40 45 L80 48 L120 38 L160 40 L200 28 L240 22 L280 18 L320 10" fill="none" stroke={TOKENS.accent} strokeWidth="2"/>
        </svg>
      </div>

      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>ALL LIFTS</div>
        <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
          {lifts.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: l.recent ? TOKENS.accentDim : TOKENS.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="trophy" size={14} color={l.recent ? TOKENS.accent : TOKENS.label2}/>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{l.n}</div>
                {l.delta && <div style={{ fontSize: 11, color: TOKENS.accent, fontWeight: 600 }}>{l.delta} kg vs prev</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontFamily: TOKENS.display, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{l.v}</span>
                <span style={{ fontSize: 11, color: TOKENS.label3 }}>kg</span>
                <span style={{ fontSize: 11, color: TOKENS.label3, marginLeft: 4 }}>{l.x}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <TabBar active="home"/>
    </div>
  );
}

function CoachScreen() {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', paddingTop: 54 }}>
      {/* header */}
      <div style={{ padding: '8px 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, background: TOKENS.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="sparkle" size={18} color={TOKENS.accent}/>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Coach</div>
            <div style={{ fontSize: 11, color: TOKENS.label3, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Dot color={TOKENS.good} size={6}/> Online · context: last 30d
            </div>
          </div>
        </div>
        <Icon name="history" size={22} color={TOKENS.label2}/>
      </div>

      {/* messages */}
      <div style={{ flex: 1, overflow: 'auto', padding: '4px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '12px 14px', borderRadius: '18px 18px 18px 4px', background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, fontSize: 14, lineHeight: 1.45 }}>
          You logged 3 push sessions this week — strong consistency. Bench is up <span style={{ color: TOKENS.accent, fontWeight: 600 }}>+4.2%</span> in 4 weeks.
        </div>
        <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '12px 14px', borderRadius: '18px 18px 18px 4px', background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, fontSize: 14, lineHeight: 1.45 }}>
          For tomorrow's pull day I'd suggest dropping volume on rows by one set — your right shoulder mobility flag is still active.
        </div>

        {/* user msg */}
        <div style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '12px 14px', borderRadius: '18px 18px 4px 18px', background: TOKENS.accent, color: TOKENS.accentInk, fontSize: 14, fontWeight: 500, lineHeight: 1.45 }}>
          Should I deload next week?
        </div>

        <div style={{ alignSelf: 'flex-start', maxWidth: '82%', padding: '12px 14px', borderRadius: '18px 18px 18px 4px', background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, fontSize: 14, lineHeight: 1.45 }}>
          <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 6 }}>RECOMMENDATION</div>
          Yes — RPE has crept up across all big lifts. Drop top set load by 10%, keep volume.
          <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: TOKENS.bg, border: `1px solid ${TOKENS.hairline}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 11, color: TOKENS.label3 }}>Apply to plan</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Hypertrophy · Week 4</div>
            </div>
            <button style={{ background: TOKENS.accent, color: TOKENS.accentInk, border: 'none', height: 30, padding: '0 12px', borderRadius: 8, fontWeight: 700, fontSize: 12 }}>Apply</button>
          </div>
        </div>
      </div>

      {/* suggestions row */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px', overflowX: 'auto' }}>
        {['Plan next week', 'Why am I plateauing?', 'Form tips: bench'].map((s, i) => (
          <div key={s} style={{ flexShrink: 0, height: 32, padding: '0 12px', borderRadius: 99, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, fontSize: 12, color: TOKENS.label2, fontWeight: 500, display: 'flex', alignItems: 'center' }}>{s}</div>
        ))}
      </div>

      {/* composer */}
      <div style={{ padding: '0 16px 110px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 6px 6px 16px', borderRadius: 24, background: TOKENS.surface, border: `1px solid ${TOKENS.hairlineStrong}` }}>
          <span style={{ flex: 1, fontSize: 14, color: TOKENS.label3 }}>Message coach…</span>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: TOKENS.surface3, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="mic" size={16} color={TOKENS.label2}/>
          </button>
          <button style={{ width: 36, height: 36, borderRadius: 18, background: TOKENS.accent, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="send" size={16} color={TOKENS.accentInk}/>
          </button>
        </div>
      </div>
      <TabBar active="coach"/>
    </div>
  );
}

function SettingsScreen() {
  const groups = [
    { l: 'TRAINING', items: [
      { i: 'dumbbell', n: 'Units', v: 'kg' },
      { i: 'timer', n: 'Default rest', v: '2:00' },
      { i: 'bolt', n: 'Plate calculator', v: '20kg bar' },
    ]},
    { l: 'COACH', items: [
      { i: 'sparkle', n: 'AI Coach', v: 'On' },
      { i: 'history', n: 'Context window', v: '30 days' },
    ]},
    { l: 'ACCOUNT', items: [
      { i: 'gear', n: 'API tokens', v: '2 active' },
      { i: 'gear', n: 'Export data', v: '' },
    ]},
  ];
  return (
    <div style={{ height: '100%', overflow: 'auto', paddingTop: 54, paddingBottom: 110 }}>
      <PageHeader title="Settings"/>

      {/* profile */}
      <div style={{ margin: '0 16px 16px', padding: 16, borderRadius: 18, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: TOKENS.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: TOKENS.accent }}>A</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Alex Becker</div>
          <div style={{ fontSize: 12, color: TOKENS.label3 }}>alex@fittrack.app</div>
        </div>
        <Icon name="chevron" size={18} color={TOKENS.label3}/>
      </div>

      {groups.map((g, gi) => (
        <div key={gi} style={{ padding: '8px 16px 0' }}>
          <div style={{ fontSize: 11, color: TOKENS.label3, fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8, padding: '0 4px' }}>{g.l}</div>
          <div style={{ borderRadius: 16, background: TOKENS.surface, border: `1px solid ${TOKENS.hairline}`, overflow: 'hidden' }}>
            {g.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderTop: i ? `1px solid ${TOKENS.hairline}` : 'none' }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: TOKENS.surface3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name={it.i} size={16} color={TOKENS.label2}/>
                </div>
                <div style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{it.n}</div>
                {it.v && <span style={{ fontSize: 13, color: TOKENS.label3 }}>{it.v}</span>}
                <Icon name="chevron" size={16} color={TOKENS.label3}/>
              </div>
            ))}
          </div>
        </div>
      ))}
      <TabBar active="home"/>
    </div>
  );
}

Object.assign(window, {
  DashboardScreen, WorkoutsListScreen, PlansScreen,
  ExercisesScreen, RecordsScreen, CoachScreen, SettingsScreen,
});
