import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import './Analytics.css'

// ── Types ────────────────────────────────────────────────────────────────────
interface FraudAlert {
  id: number
  alert_type: string
  alert_type_display: string
  voter_id: string
  booth_id: string
  description: string
  severity: 'low' | 'medium' | 'high'
  is_resolved: boolean
  created_at: string
}
interface Block {
  index: number
  event_type: string
  data: Record<string, unknown>
  hash: string
  previous_hash: string
  timestamp: string
}
interface ChainIntegrity {
  is_valid: boolean
  message: string
  broken_at: number | null
}
interface FederatedRound {
  round: number
  global_avg_anomaly_score: number
  total_flagged_across_booths: number
  per_booth_flagged: number[]
}

// ── Palette ───────────────────────────────────────────────────────────────────
const T = {
  lightest: '#b2d8d8',
  light:    '#66b2b2',
  mid:      '#008080',
  dark:     '#006666',
  darkest:  '#004c4c',
  red:      '#c53030',
  orange:   '#c05621',
  green:    '#276749',
  bg:       '#f0f7f7',
  white:    '#ffffff',
  text:     '#1a3333',
  muted:    '#4a7070',
  border:   '#cce0e0',
}

const PIE_COLORS = [T.mid, T.light, T.orange, T.red, T.dark, T.lightest]

const ALERT_ICON: Record<string, string> = {
  duplicate_vote: '🗳️', fingerprint_mismatch: '👆',
  duplicate_aadhaar: '🪪', dead_voter: '⚠️', cross_constituency: '📍',
}
const EVENT_ICON: Record<string, string> = {
  VERIFICATION_APPROVED: '✅', VOTE_RECORDED: '🗳️',
  VERIFICATION_REJECTED: '❌', DUPLICATE_VOTE_ATTEMPT: '🚨',
  VERIFICATION_FAILED: '⚠️', OFFICER_LOGIN: '🔐',
  OFFICER_LOGOUT: '🔓', FEDERATED_SCAN_COMPLETE: '🤖',
}

const API = 'http://127.0.0.1:8000'

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ flex: 1, height: 8, background: T.border, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: T.mid, borderRadius: 4, transition: 'width 0.6s' }} />
      </div>
      <span style={{ fontSize: 13, color: T.dark, fontWeight: 700, width: 24, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Analytics() {
  const navigate = useNavigate()
  const [alerts, setAlerts]         = useState<FraudAlert[]>([])
  const [blocks, setBlocks]         = useState<Block[]>([])
  const [integrity, setIntegrity]   = useState<ChainIntegrity | null>(null)
  const [fedResults, setFedResults] = useState<FederatedRound[] | null>(null)
  const [loadingFed, setLoadingFed] = useState(false)
  const [runningFed, setRunningFed] = useState(false)
  const [activeTab, setActiveTab]   = useState<'overview' | 'blockchain' | 'federated'>('overview')
  const [currentTime, setCurrent]   = useState(new Date())
  const [chainMsg, setChainMsg]     = useState('')
  const [chainOk, setChainOk]       = useState(true)

  const token   = localStorage.getItem('booth_token') || localStorage.getItem('token') || ''
  const headers = { Authorization: `Token ${token}` }

  useEffect(() => { const t = setInterval(() => setCurrent(new Date()), 1000); return () => clearInterval(t) }, [])
  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 30000); return () => clearInterval(i) }, [])
  useEffect(() => { if (activeTab === 'federated') fetchFed() }, [activeTab])

  const fetchAll = async () => {
    const [a, b, i] = await Promise.all([
      axios.get(`${API}/api/fraud/alerts/`, { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/api/chain/log/`,    { headers }).catch(() => ({ data: [] })),
      axios.get(`${API}/api/chain/integrity/`, { headers }).catch(() => ({ data: null })),
    ])
    setAlerts(a.data || [])
    setBlocks(b.data || [])
    if (i.data) { setIntegrity(i.data); setChainOk(i.data.is_valid) }
  }

  const fetchFed = async () => {
    setLoadingFed(true)
    try {
      const r = await axios.get(`${API}/api/federated/results/`, { headers })
      setFedResults(r.data?.message ? null : r.data)
    } catch { setFedResults(null) }
    finally { setLoadingFed(false) }
  }

  const runFederated = async () => {
    setRunningFed(true)
    try { await axios.post(`${API}/api/federated/run/`, {}, { headers }); await fetchFed(); await fetchAll() }
    catch (e) { console.error(e) }
    finally { setRunningFed(false) }
  }

  const resolveAlert = async (id: number) => {
    await axios.patch(`${API}/api/fraud/alerts/${id}/resolve/`, {}, { headers }).catch(() => {})
    setAlerts(p => p.map(a => a.id === id ? { ...a, is_resolved: true } : a))
  }

  const verifyChain = async () => {
    const r = await axios.get(`${API}/api/chain/integrity/`, { headers }).catch(() => null)
    if (r) {
      setIntegrity(r.data); setChainOk(r.data.is_valid)
      setChainMsg(r.data.is_valid ? '✅ Chain verified — no tampering detected.' : `🚨 TAMPERED! Block #${r.data.broken_at} is corrupted.`)
      setTimeout(() => setChainMsg(''), 6000)
    }
  }

  // Derived
  const totalAlerts   = alerts.length
  const highAlerts    = alerts.filter(a => a.severity === 'high').length
  const unresolved    = alerts.filter(a => !a.is_resolved).length
  const approved      = blocks.filter(b => b.event_type === 'VERIFICATION_APPROVED').length
  const rejected      = blocks.filter(b => b.event_type === 'VERIFICATION_REJECTED').length
  const duplicates    = blocks.filter(b => b.event_type === 'DUPLICATE_VOTE_ATTEMPT').length
  const votesRecorded = blocks.filter(b => b.event_type === 'VOTE_RECORDED').length

  const alertsByType  = alerts.reduce<Record<string, number>>((a, x) => { a[x.alert_type] = (a[x.alert_type]||0)+1; return a }, {})
  const alertsByBooth = alerts.reduce<Record<string, number>>((a, x) => { if(x.booth_id) a[x.booth_id]=(a[x.booth_id]||0)+1; return a }, {})
  const eventCounts   = blocks.reduce<Record<string, number>>((a, x) => { a[x.event_type]=(a[x.event_type]||0)+1; return a }, {})

  const maxBooth = Math.max(...Object.values(alertsByBooth), 1)
  const lastFed  = fedResults?.[fedResults.length - 1]

  // Chart data
  const alertTypePie  = Object.entries(alertsByType).map(([name, value]) => ({ name: name.replace(/_/g,' '), value }))
  const severityPie   = [
    { name: 'High',   value: alerts.filter(a=>a.severity==='high').length },
    { name: 'Medium', value: alerts.filter(a=>a.severity==='medium').length },
    { name: 'Low',    value: alerts.filter(a=>a.severity==='low').length },
  ].filter(x=>x.value>0)
  const verifyBar     = [
    { name: 'Approved', count: approved },
    { name: 'Rejected', count: rejected },
    { name: 'Duplicate', count: duplicates },
    { name: 'Votes Cast', count: votesRecorded },
  ]
  const boothBar = Object.entries(alertsByBooth).map(([name, count]) => ({ name, count }))
  const fedLine  = fedResults?.map(r => ({
    round: `R${r.round}`,
    score: parseFloat(r.global_avg_anomaly_score.toFixed(4)),
    flagged: r.total_flagged_across_booths,
  })) || []

  const today = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' })

  return (
    <div className="an-page">

      {/* Top bar */}
      <div className="an-topbar">
        <span>Government of India - Election Commission of India</span>
        <div className="an-live"><span className="an-dot" />LIVE MONITORING</div>
        <span>{currentTime.toLocaleTimeString('en-IN')}</span>
      </div>

      {/* Header */}
      <header className="an-header">
        <div className="an-header-left">
          <span className="an-chakra">⊕</span>
          <div>
            <h1 className="an-title">VeriVote</h1>
            <p className="an-sub">Fraud Intelligence &amp; Blockchain Audit Dashboard</p>
          </div>
        </div>
        <div className="an-header-right">
          <div className="an-date">{today}</div>
          <div className="an-election">General Elections 2026</div>
        </div>
      </header>

      {/* Chain message */}
      {chainMsg && <div className={`an-banner ${chainMsg.includes('TAMPERED') ? 'an-banner-err' : 'an-banner-ok'}`}>{chainMsg}</div>}

      {/* Navbar */}
      <nav className="an-nav">
        {(['overview','blockchain','federated'] as const).map(tab => (
          <button key={tab} className={`an-navbtn ${activeTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
            {tab==='overview'&&'📊 Fraud Overview'}
            {tab==='blockchain'&&'🔗 Blockchain Audit'}
            {tab==='federated'&&'🤖 Federated AI'}
          </button>
        ))}
        <div style={{flex:1}} />
        <button className="an-chain-btn" onClick={verifyChain} style={{ background: chainOk ? T.green : T.red }}>
          {chainOk ? '🔒 Chain Valid' : '🚨 Chain Broken'}
        </button>
        <button className="an-back-btn" onClick={()=>navigate('/booth/dashboard')}>← Back</button>
      </nav>

      {/* Status bar */}
      <div className="an-statusbar">
        <span>📊 Analytics Dashboard</span>
        <span>🏛️ Election Commission of India</span>
        <span>🔄 Auto-refresh every 30s</span>
        <button className="an-refresh" onClick={fetchAll}>↻ Refresh</button>
      </div>

      <main className="an-main">

        {/* ── OVERVIEW ──────────────────────────────────────── */}
        {activeTab === 'overview' && (<>

          {/* KPI */}
          <div className="an-kpi-grid">
            {[
              { label:'TOTAL FRAUD ALERTS', value: totalAlerts,   accent: T.red,    sub:'All incidents detected' },
              { label:'HIGH SEVERITY',       value: highAlerts,    accent: T.orange, sub:'Needs immediate action' },
              { label:'UNRESOLVED',          value: unresolved,    accent: T.dark,   sub:'Pending officer review' },
              { label:'VOTES RECORDED',      value: votesRecorded, accent: T.green,  sub:'Successfully verified' },
            ].map(k=>(
              <div key={k.label} className="an-kpi" style={{ borderTop:`4px solid ${k.accent}` }}>
                <div className="an-kpi-label">{k.label}</div>
                <div className="an-kpi-num" style={{ color:k.accent }}>{k.value}</div>
                <div className="an-kpi-sub">{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Charts row */}
          <div className="an-2col">

            {/* Fraud type pie */}
            <div className="an-card">
              <div className="an-card-title">🥧 Fraud Alert Breakdown by Type</div>
              <p className="an-explain">Each slice shows what kind of fraud was detected. Larger slice = more common fraud type.</p>
              {alertTypePie.length === 0 ? (
                <div className="an-empty">✅ No fraud alerts yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={alertTypePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {alertTypePie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Severity pie */}
            <div className="an-card">
              <div className="an-card-title">🥧 Alerts by Severity Level</div>
              <p className="an-explain">Shows how serious the detected fraud was. Red = high risk, requires immediate action.</p>
              {severityPie.length === 0 ? (
                <div className="an-empty">✅ No fraud alerts yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={severityPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {severityPie.map((entry) => (
                        <Cell key={entry.name}
                          fill={entry.name==='High'?T.red:entry.name==='Medium'?T.orange:T.green} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Verification bar chart */}
          <div className="an-card">
            <div className="an-card-title">📊 Verification Results (from Blockchain)</div>
            <p className="an-explain">
              Every time a voter is scanned at the booth, the result is logged to the blockchain.
              This chart shows how many were approved, rejected (fingerprint didn't match), duplicate attempts (same person tried twice), and total votes cast.
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={verifyBar} margin={{ top:5, right:20, left:0, bottom:5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="name" tick={{ fill: T.muted, fontSize:13 }} />
                <YAxis tick={{ fill: T.muted, fontSize:13 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" radius={[4,4,0,0]}>
                  {verifyBar.map((entry) => (
                    <Cell key={entry.name}
                      fill={entry.name==='Approved'?T.green:entry.name==='Votes Cast'?T.mid:T.red} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Booth bar chart */}
          {boothBar.length > 0 && (
            <div className="an-card">
              <div className="an-card-title">📍 Fraud Alerts per Booth</div>
              <p className="an-explain">Which booths had the most fraud incidents? Taller bar = more problems at that booth.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={boothBar} margin={{ top:5, right:20, left:0, bottom:5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="name" tick={{ fill:T.muted, fontSize:12 }} />
                  <YAxis tick={{ fill:T.muted, fontSize:12 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={T.mid} radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Alert list */}
          <div className="an-card">
            <div className="an-card-title">🚨 All Fraud Alerts</div>
            {alerts.length===0 ? (
              <div className="an-empty"><div style={{fontSize:36}}>✅</div><p>No fraud alerts. System is clean.</p></div>
            ) : (
              alerts.map(a=>(
                <div key={a.id} className={`an-alert-row ${a.is_resolved?'an-resolved':''}`}>
                  <div className="an-alert-left">
                    <span style={{fontSize:22}}>{ALERT_ICON[a.alert_type]||'🚨'}</span>
                    <div>
                      <div className="an-alert-type">{a.alert_type_display}</div>
                      <div className="an-alert-desc">{a.description}</div>
                      <div className="an-alert-meta">
                        <span>Voter: {a.voter_id}</span>
                        {a.booth_id&&<span>Booth: {a.booth_id}</span>}
                        <span>{a.created_at}</span>
                      </div>
                    </div>
                  </div>
                  <div className="an-alert-right">
                    <span className={`an-badge sev-${a.severity}`}>{a.severity.toUpperCase()}</span>
                    {!a.is_resolved
                      ? <button className="an-resolve-btn" onClick={()=>resolveAlert(a.id)}>Mark Resolved</button>
                      : <span className="an-resolved-tag">✓ Resolved</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </>)}

        {/* ── BLOCKCHAIN ────────────────────────────────────── */}
        {activeTab === 'blockchain' && (<>

          <div className={`an-integrity ${chainOk?'int-ok':'int-broken'}`}>
            <div>
              <div className="int-title">{chainOk?'🔒 Blockchain Integrity: VERIFIED':'🚨 Blockchain Integrity: COMPROMISED'}</div>
              <div className="int-sub">{integrity?.message||'Run integrity check to verify.'}{integrity?.broken_at!=null&&` — Broken at Block #${integrity.broken_at}`}</div>
            </div>
            <button className="an-run-btn" onClick={verifyChain}>🔍 Run Integrity Check</button>
          </div>

          <div className="an-card">
            <div className="an-card-title">ℹ️ What is the Blockchain Audit Chain?</div>
            <p className="an-explain" style={{fontSize:14, lineHeight:1.7}}>
              Every action at the polling booth — officer login, fingerprint scan, vote approval, fraud rejection — is recorded as a "block" in an audit chain.
              Each block contains a cryptographic hash of the previous block, so if anyone tries to edit or delete a record, the chain breaks and the tampering is immediately detected.
              This is what makes the system tamper-evident: you can't silently change history.
            </p>
          </div>

          <div className="an-card">
            <div className="an-card-title">📊 Event Type Breakdown</div>
            <p className="an-explain">How many times each type of event was logged to the blockchain today.</p>
            {Object.keys(eventCounts).length===0 ? (
              <div className="an-empty"><p>No blocks recorded yet.</p></div>
            ) : (
              <div className="an-2col">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={Object.entries(eventCounts).map(([name,value])=>({name:name.replace(/_/g,' '),value}))}
                      dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {Object.keys(eventCounts).map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip /><Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{display:'flex', flexDirection:'column', gap:6, justifyContent:'center'}}>
                  {Object.entries(eventCounts).map(([type,count])=>(
                    <div key={type} style={{display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                      background:T.bg, borderRadius:6, border:`1px solid ${T.border}`}}>
                      <span style={{fontSize:16}}>{EVENT_ICON[type]||'📋'}</span>
                      <span style={{flex:1, fontSize:13, color:T.text}}>{type.replace(/_/g,' ')}</span>
                      <span style={{fontWeight:700, color:T.dark, fontSize:15}}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="an-card">
            <div className="an-card-title">🔗 Audit Chain Log</div>
            <p className="an-explain">Every row is one immutable blockchain record. If anyone edits the database, the hash chain breaks and integrity check will fail.</p>
            {blocks.length===0 ? (
              <div className="an-empty"><p>No blocks yet. Perform verifications to populate the chain.</p></div>
            ) : (
              <div className="an-block-table">
                <div className="an-block-header">
                  <span>Block #</span><span>Event</span><span>Timestamp</span><span>Hash</span>
                </div>
                {blocks.map(b=>(
                  <div key={b.index} className="an-block-row">
                    <span style={{color:T.muted, fontWeight:700}}>#{b.index}</span>
                    <span style={{fontWeight:600, color:T.dark}}>{EVENT_ICON[b.event_type]||'📋'} {b.event_type.replace(/_/g,' ')}</span>
                    <span style={{color:T.muted, fontSize:12}}>{b.timestamp}</span>
                    <span style={{fontFamily:'monospace', fontSize:11, color:T.light}}>{b.hash.slice(0,20)}...</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>)}

        {/* ── FEDERATED ─────────────────────────────────────── */}
        {activeTab === 'federated' && (<>

          <div className="an-card" style={{marginBottom:20}}>
            <div className="an-card-title">ℹ️ What is Federated Learning? (Simple explanation)</div>
            <p className="an-explain" style={{fontSize:14, lineHeight:1.8}}>
              <strong>The problem:</strong> To detect fraud patterns, we'd normally need to combine data from all booths — but that's a privacy risk (raw voter data in one place).<br/>
              <strong>Federated Learning solves this:</strong> Instead of sending raw data to a central server, each booth trains a fraud-detection AI model on its own data locally.
              Then only the <em>learned patterns</em> (tiny numbers called model weights) are sent to the server — never the actual voter records.<br/>
              <strong>FedAvg:</strong> The server averages these patterns from all booths to produce a smarter global model.<br/>
              <strong>What "anomaly score" means:</strong> The model scores each verification event. More negative score = more anomalous = more likely to be fraud. Booths with many low-scoring events get flagged.
            </p>
          </div>

          <div className="an-fed-header">
            <div>
              <h2 style={{fontSize:18, fontWeight:700, color:T.text, margin:'0 0 4px'}}>🤖 Federated Anomaly Detection</h2>
              <p style={{fontSize:13, color:T.muted, margin:0}}>
                4 simulated booths — Isolation Forest — FedAvg aggregation — synthetic fraud patterns injected
              </p>
            </div>
            <button className={`an-run-btn ${runningFed?'btn-off':''}`} onClick={runFederated} disabled={runningFed}>
              {runningFed ? '⏳ Running...' : '▶ Run Federated Scan'}
            </button>
          </div>

          {lastFed && (
            <div className="an-kpi-grid">
              {[
                { label:'ROUNDS DONE',      value: fedResults?.length,                          sub:'Federated rounds run' },
                { label:'ANOMALIES FLAGGED',value: lastFed.total_flagged_across_booths,         sub:'Suspicious patterns found' },
                { label:'GLOBAL AVG SCORE', value: lastFed.global_avg_anomaly_score.toFixed(3), sub:'More negative = more anomalous' },
                { label:'BOOTHS SCANNED',   value: lastFed.per_booth_flagged.length,            sub:'Simulated booth nodes' },
              ].map(k=>(
                <div key={k.label} className="an-kpi" style={{ borderTop:`4px solid ${T.mid}` }}>
                  <div className="an-kpi-label">{k.label}</div>
                  <div className="an-kpi-num" style={{ color:T.dark, fontSize: typeof k.value==='string'?26:40 }}>{k.value}</div>
                  <div className="an-kpi-sub">{k.sub}</div>
                </div>
              ))}
            </div>
          )}

          {fedResults && fedResults.length > 0 ? (<>

            {/* Line chart - score over rounds */}
            <div className="an-card">
              <div className="an-card-title">📈 Anomaly Score & Flagged Count per Round</div>
              <p className="an-explain">
                The line shows the global anomaly score across rounds. A flatter line means the model converged (stabilised).
                The bar shows total anomalies flagged. In this simulation all booths have the same synthetic data, so rounds are similar.
              </p>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={fedLine} margin={{top:5, right:20, left:0, bottom:5}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="round" tick={{fill:T.muted, fontSize:13}} />
                  <YAxis yAxisId="score" tick={{fill:T.muted, fontSize:12}} />
                  <YAxis yAxisId="flagged" orientation="right" tick={{fill:T.muted, fontSize:12}} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="score" type="monotone" dataKey="score" stroke={T.mid} strokeWidth={2} dot name="Avg Anomaly Score" />
                  <Line yAxisId="flagged" type="monotone" dataKey="flagged" stroke={T.red} strokeWidth={2} dot name="Total Flagged" />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Per-booth bar */}
            <div className="an-card">
              <div className="an-card-title">📊 Per-Booth Anomalies (Last Round)</div>
              <p className="an-explain">
                How many suspicious events each simulated booth flagged in the last round.
                In a real system, booths with high counts would be investigated by ECI supervisors.
              </p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={lastFed?.per_booth_flagged.map((v,i)=>({name:`Booth ${i}`, flagged:v})) || []}
                  margin={{top:5, right:20, left:0, bottom:5}}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="name" tick={{fill:T.muted, fontSize:13}} />
                  <YAxis tick={{fill:T.muted, fontSize:13}} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="flagged" fill={T.mid} radius={[4,4,0,0]} name="Anomalies Flagged" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Round details */}
            <div className="an-card">
              <div className="an-card-title">📋 Round-by-Round Details</div>
              {fedResults.map(r=>(
                <div key={r.round} className="an-fed-round">
                  <div className="fed-rh">
                    <span className="fed-rlabel">Round {r.round}</span>
                    <span style={{fontSize:13, color:T.muted}}>Global avg score: <strong>{r.global_avg_anomaly_score.toFixed(4)}</strong></span>
                    <span style={{fontSize:13, color:T.muted}}>Total flagged: <strong style={{color:T.red}}>{r.total_flagged_across_booths}</strong></span>
                  </div>
                  <div style={{display:'flex', gap:8, flexWrap:'wrap' as const}}>
                    {r.per_booth_flagged.map((f,i)=>(
                      <div key={i} className={`fed-booth ${f>0?'fed-booth-flag':'fed-booth-ok'}`}>
                        <div style={{fontSize:11, fontWeight:700, opacity:0.7}}>Booth {i}</div>
                        <div style={{fontWeight:700}}>{f} flagged</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

          </>) : loadingFed ? (
            <div className="an-card an-empty"><p>Loading federated results...</p></div>
          ) : (
            <div className="an-card an-empty">
              <div style={{fontSize:48}}>🤖</div>
              <p style={{fontWeight:600}}>No results yet.</p>
              <p style={{fontSize:13, color:T.muted}}>Click "Run Federated Scan" above to start the anomaly detection across all simulated booths.</p>
            </div>
          )}

          {/* How it works steps */}
          <div className="an-card">
            <div className="an-card-title">🔬 What Happens When You Click "Run Federated Scan"</div>
            <div className="an-fed-steps">
              {[
                { n:'1', t:'Synthetic Data Generated', d:'Each of 4 simulated booths gets 200 voter verification records with 5% injected fraud patterns (rapid attempts, low match scores, geographic anomalies).' },
                { n:'2', t:'Local Isolation Forest Trains', d:'Each booth trains its own Isolation Forest ML model on its own data. The model learns what "normal" looks like and flags outliers — without sending raw data anywhere.' },
                { n:'3', t:'Anomaly Scores Extracted', d:'Each booth sends only its anomaly scores (a small array of numbers) to the central server. No voter names, no fingerprints — just learned patterns.' },
                { n:'4', t:'FedAvg Aggregation', d:'The server averages scores across all booths (FedAvg algorithm). This produces a global fraud signal. Results are saved and FraudAlerts are created for booths above threshold.' },
              ].map(s=>(
                <div key={s.n} className="fed-step">
                  <div className="fed-step-n">{s.n}</div>
                  <div className="fed-step-t">{s.t}</div>
                  <div className="fed-step-d">{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </>)}
      </main>

      <footer className="an-footer">
        <span>VeriVote © 2026 | Election Commission of India</span>
        <span>🔒 All booth activity is encrypted and blockchain-logged</span>
        <span>Analytics Dashboard</span>
      </footer>
    </div>
  )
}