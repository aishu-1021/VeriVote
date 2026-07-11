import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { karnatakaData, parliamentaryMap } from '../data/karnataka'
import './Enroll.css'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Step1Data {
  full_name: string; date_of_birth: string; gender: string
  relative_name: string; relation: string; mobile_number: string; email: string
}
interface Step2Data {
  house_number: string; street: string; city: string; pincode: string
  state: string; district: string; assembly_constituency: string
  parliamentary_constituency: string; assigned_booth: string
}
interface Step3Data {
  aadhaar_number: string; fingerprint_b64: string
}
interface AadhaarResult {
  valid: boolean; reason: string
  name?: string; dob?: string; gender?: string; address?: string
  face_match?: boolean | null; face_score?: number | null; face_reason?: string
  duplicate_voter?: boolean; duplicate_voter_id?: string | null
}

// ── Initial state ─────────────────────────────────────────────────────────────
const INIT1: Step1Data = { full_name:'', date_of_birth:'', gender:'', relative_name:'', relation:'', mobile_number:'', email:'' }
const INIT2: Step2Data = { house_number:'', street:'', city:'', pincode:'', state:'Karnataka', district:'', assembly_constituency:'', parliamentary_constituency:'', assigned_booth:'' }
const INIT3: Step3Data = { aadhaar_number:'', fingerprint_b64:'' }

// ── Helper ────────────────────────────────────────────────────────────────────
function b64ToBlob(b64: string): Blob {
  const parts = b64.split(',')
  const mime  = parts[0].split(':')[1].split(';')[0]
  const bytes = atob(parts[1])
  const arr   = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Enroll() {
  const navigate = useNavigate()

  // Step state
  const [currentStep, setCurrentStep] = useState(1)
  const [step1, setStep1] = useState<Step1Data>(INIT1)
  const [step2, setStep2] = useState<Step2Data>(INIT2)
  const [step3, setStep3] = useState<Step3Data>(INIT3)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Aadhaar & photo state
  const [aadhaarResult, setAadhaarResult]       = useState<AadhaarResult | null>(null)
  const [aadhaarVerifying, setAadhaarVerifying] = useState(false)
  const [photoB64, setPhotoB64]                 = useState('')
  const [cameraActive, setCameraActive]         = useState(false)
  const [cameraError, setCameraError]           = useState('')
  const videoRef  = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Fingerprint & submit state
  const [captureStatus, setCaptureStatus] = useState<'idle'|'capturing'|'done'|'failed'>('idle')
  const [submitting, setSubmitting]       = useState(false)
  const [submitError, setSubmitError]     = useState('')

  // ── Cleanup camera on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // ── Attach stream to video after cameraActive renders ───────────────────────
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(e => console.error('Video play error:', e))
    }
  }, [cameraActive])

  // ── Camera ──────────────────────────────────────────────────────────────────
  const openCamera = async () => {
    setCameraError('')
    setPhotoB64('')
    setAadhaarResult(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width:640, height:480 } })
      streamRef.current = stream
      setCameraActive(true) // useEffect will attach stream after render
    } catch (e) {
      setCameraError('Camera access denied. Please allow camera permission in browser.')
    }
  }

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return
    const v = videoRef.current
    const c = canvasRef.current
    c.width  = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')?.drawImage(v, 0, 0)
    const b64 = c.toDataURL('image/jpeg', 0.85)
    setPhotoB64(b64)
    streamRef.current?.getTracks().forEach(t => t.stop())
    setCameraActive(false)
    setAadhaarResult(null)
  }

  const retakePhoto = () => {
    setPhotoB64('')
    setAadhaarResult(null)
    openCamera()
  }

  // ── Aadhaar Verification ────────────────────────────────────────────────────
  const verifyAadhaar = async () => {
    const clean = step3.aadhaar_number.replace(/\s|-/g, '')
    if (clean.length !== 12) { setErrors(e => ({ ...e, aadhaar_number: 'Enter full 12-digit Aadhaar number first' })); return }
    if (!photoB64) { setErrors(e => ({ ...e, photo: 'Capture your photo first before verifying' })); return }

    setAadhaarVerifying(true)
    setAadhaarResult(null)
    try {
      const token = localStorage.getItem('auth_token')
      const res   = await fetch('http://127.0.0.1:8000/api/aadhaar/verify/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${token}` },
        body: JSON.stringify({ aadhaar_number: clean, photo_b64: photoB64 }),
      })
      const data: AadhaarResult = await res.json()
      setAadhaarResult(data)
    } catch {
      setAadhaarResult({ valid: false, reason: 'Network error. Please try again.' })
    } finally {
      setAadhaarVerifying(false)
    }
  }

  // ── Fingerprint ─────────────────────────────────────────────────────────────
  const captureFingerprint = async () => {
    setCaptureStatus('capturing')
    try {
      const res = await api.post('/booth/capture-fingerprint/')
      setStep3(p => ({ ...p, fingerprint_b64: res.data.descriptor_b64 }))
      setCaptureStatus('done')
    } catch { setCaptureStatus('failed') }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const calculateAge = (dob: string) => {
    if (!dob) return ''
    const today = new Date(); const birth = new Date(dob)
    let age = today.getFullYear() - birth.getFullYear()
    const m = today.getMonth() - birth.getMonth()
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
    return age >= 0 ? String(age) : ''
  }
  const maxDOB = () => { const d = new Date(); d.setFullYear(d.getFullYear()-18); return d.toISOString().split('T')[0] }

  const handleDistrictChange = (district: string) =>
    setStep2(p => ({ ...p, district, assembly_constituency:'', parliamentary_constituency:'', assigned_booth:'' }))

  const handleConstituencyChange = (ac: string) =>
    setStep2(p => ({ ...p, assembly_constituency: ac,
      parliamentary_constituency: parliamentaryMap[ac] || 'To be assigned',
      assigned_booth: ac ? `Booth ${ac.substring(0,3).toUpperCase()}-001` : '' }))

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateStep1 = () => {
    const e: Record<string,string> = {}
    if (!step1.full_name.trim()) e.full_name = 'Full name is required'
    if (!step1.date_of_birth) e.date_of_birth = 'Date of birth is required'
    else if (Number(calculateAge(step1.date_of_birth)) < 18) e.date_of_birth = 'Voter must be at least 18 years old'
    if (!step1.gender) e.gender = 'Please select gender'
    if (!step1.relative_name.trim()) e.relative_name = 'This field is required'
    if (!step1.relation) e.relation = 'Please select relation'
    if (!step1.mobile_number || step1.mobile_number.length < 10) e.mobile_number = 'Valid mobile number required'
    setErrors(e); return Object.keys(e).length === 0
  }
  const validateStep2 = () => {
    const e: Record<string,string> = {}
    if (!step2.house_number.trim()) e.house_number = 'Required'
    if (!step2.street.trim()) e.street = 'Required'
    if (!step2.city.trim()) e.city = 'Required'
    if (!step2.pincode || step2.pincode.length !== 6) e.pincode = 'Valid 6-digit pincode required'
    if (!step2.district) e.district = 'Please select district'
    if (!step2.assembly_constituency) e.assembly_constituency = 'Please select constituency'
    setErrors(e); return Object.keys(e).length === 0
  }
  const validateStep3 = () => {
    const e: Record<string,string> = {}
    if (step3.aadhaar_number.replace(/\s|-/g,'').length !== 12) e.aadhaar_number = 'Valid 12-digit Aadhaar required'
    if (!photoB64) e.photo = 'Photo capture is required'
    if (!aadhaarResult?.valid) e.aadhaar_verify = 'Aadhaar must be verified before submitting'
    if (aadhaarResult?.duplicate_voter) e.aadhaar_verify = 'This face is already enrolled as a voter'
    if (aadhaarResult?.face_match === false) e.face = 'Face does not match Aadhaar photo. Enrollment cannot proceed.'
    if (!step3.fingerprint_b64) e.fingerprint_b64 = 'Fingerprint scan is required'
    setErrors(e); return Object.keys(e).length === 0
  }

  const nextStep = () => {
    if (currentStep === 1 && validateStep1()) setCurrentStep(2)
    if (currentStep === 2 && validateStep2()) setCurrentStep(3)
  }
  const prevStep = () => setCurrentStep(p => p - 1)

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validateStep3()) return
    setSubmitting(true); setSubmitError('')

    const formData = new FormData()
    Object.entries(step1).forEach(([k,v]) => formData.append(k, v))
    Object.entries(step2).forEach(([k,v]) => formData.append(k, v))
    formData.append('aadhaar_number', step3.aadhaar_number.replace(/\s|-/g,''))
    formData.append('fingerprint_b64', step3.fingerprint_b64)

    if (photoB64) {
      const blob = b64ToBlob(photoB64)
      formData.append('passport_photo', blob, 'webcam_photo.jpg')
    }

    try {
      const token = localStorage.getItem('auth_token')
      const res = await fetch('http://127.0.0.1:8000/api/voters/enroll/', {
        method: 'POST',
        headers: { 'Authorization': `Token ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (res.ok) navigate('/dashboard', { state: { success: true, voter_id: data.voter_id } })
      else setSubmitError(JSON.stringify(data))
    } catch { setSubmitError('Network error. Please try again.') }
    finally { setSubmitting(false) }
  }

  // ── Step indicator ──────────────────────────────────────────────────────────
  const StepIndicator = () => (
    <div className="step-indicator">
      {[1,2,3].map(n => (
        <div key={n} className="step-item">
          <div className={`step-circle ${currentStep===n?'active':currentStep>n?'done':''}`}>
            {currentStep > n ? '✓' : n}
          </div>
          <span className={`step-label ${currentStep===n?'active':''}`}>
            {n===1?'Personal Details':n===2?'Address & Constituency':'Documents & Biometrics'}
          </span>
          {n < 3 && <div className={`step-line ${currentStep>n?'done':''}`}></div>}
        </div>
      ))}
    </div>
  )

  // ── Aadhaar result badge ────────────────────────────────────────────────────
  const AadhaarResultBadge = () => {
    if (!aadhaarResult) return null
    if (!aadhaarResult.valid) return (
      <div className="aadhaar-result aadhaar-fail">
        <div className="ar-title">❌ Aadhaar Verification Failed</div>
        <div className="ar-reason">{aadhaarResult.reason}</div>
      </div>
    )
    return (
      <div className="aadhaar-result aadhaar-ok">
        <div className="ar-title">✅ Aadhaar Verified</div>
        <div className="ar-details">
          <span><strong>Name:</strong> {aadhaarResult.name}</span>
          <span><strong>DOB:</strong> {aadhaarResult.dob}</span>
          <span><strong>Gender:</strong> {aadhaarResult.gender === 'M' ? 'Male' : aadhaarResult.gender === 'F' ? 'Female' : 'Other'}</span>
        </div>
        {aadhaarResult.face_match !== null && aadhaarResult.face_match !== undefined && (
          <div className={`ar-face ${aadhaarResult.face_match ? 'face-ok' : 'face-fail'}`}>
            {aadhaarResult.face_match
              ? `✅ Face Match Confirmed (score: ${((aadhaarResult.face_score || 0)*100).toFixed(0)}%)`
              : `❌ Face Mismatch — Person does not match Aadhaar photo (score: ${((aadhaarResult.face_score || 0)*100).toFixed(0)}%)`}
          </div>
        )}
        {aadhaarResult.face_match === null && aadhaarResult.face_reason && (
          <div className="ar-face face-skip">⚠️ {aadhaarResult.face_reason}</div>
        )}
        {aadhaarResult.duplicate_voter && (
          <div className="ar-face face-fail">
            🚨 Duplicate Face Detected — Already enrolled as voter {aadhaarResult.duplicate_voter_id}
          </div>
        )}
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="enroll-page">
      <div className="top-bar">
        <span>Government of India - Election Commission of India</span>
        <span>Help | Contact | English ▾</span>
      </div>
      <header className="header">
        <div className="header-left">
          <div className="ashoka-wheel">⊕</div>
          <div><h1 className="site-title">VeriVote</h1><p className="site-subtitle">National Voter Registration Portal</p></div>
        </div>
        <div className="header-right">
          <span className="officer-badge">
            {localStorage.getItem('officer') ? JSON.parse(localStorage.getItem('officer')!).name : ''} | Booth KA-04
          </span>
        </div>
      </header>
      <nav className="navbar">
        <a href="#" onClick={() => navigate('/dashboard')}>Enrollment</a>
        <a href="#">Help</a>
      </nav>

      <main className="enroll-main">
        <StepIndicator />
        <h2 className="enroll-title">New Voter Registration - Step {currentStep} of 3</h2>

        {/* ── STEP 1 ── */}
        {currentStep === 1 && (
          <div className="enroll-card">
            <div className="section-header"><span className="section-icon">👤</span><h3>Part A: Personal Identity</h3></div>
            <div className="field-group">
              <label>Full Name <span className="required">*</span></label>
              <input type="text" placeholder="Exactly as printed on Aadhaar card" value={step1.full_name}
                onChange={e => setStep1(p=>({...p,full_name:e.target.value}))} />
              <span className="hint">Do not use initials - write full name as on Aadhaar</span>
              {errors.full_name && <span className="error">{errors.full_name}</span>}
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Date of Birth <span className="required">*</span></label>
                <input type="date" max={maxDOB()} value={step1.date_of_birth}
                  onChange={e => setStep1(p=>({...p,date_of_birth:e.target.value}))} />
                {errors.date_of_birth && <span className="error">{errors.date_of_birth}</span>}
              </div>
              <div className="field-group">
                <label>Age</label>
                <input type="text" value={calculateAge(step1.date_of_birth)} disabled placeholder="Auto-calculated" />
              </div>
            </div>
            <div className="field-group">
              <label>Gender <span className="required">*</span></label>
              <div className="gender-row">
                {[['M','♂ Male'],['F','♀ Female'],['O','⚧ Transgender / Other']].map(([val,label])=>(
                  <button key={val} className={`gender-btn ${step1.gender===val?'selected':''}`}
                    onClick={()=>setStep1(p=>({...p,gender:val}))}>{label}</button>
                ))}
              </div>
              {errors.gender && <span className="error">{errors.gender}</span>}
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Father's / Husband's Name <span className="required">*</span></label>
                <input type="text" value={step1.relative_name} onChange={e=>setStep1(p=>({...p,relative_name:e.target.value}))} />
                {errors.relative_name && <span className="error">{errors.relative_name}</span>}
              </div>
              <div className="field-group">
                <label>Relation <span className="required">*</span></label>
                <select value={step1.relation} onChange={e=>setStep1(p=>({...p,relation:e.target.value}))}>
                  <option value="">Select</option>
                  <option value="father">Father</option><option value="husband">Husband</option>
                  <option value="mother">Mother</option><option value="guardian">Guardian</option>
                </select>
                {errors.relation && <span className="error">{errors.relation}</span>}
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Mobile Number <span className="required">*</span></label>
                <div className="input-prefix">
                  <span className="prefix">+91</span>
                  <input type="tel" maxLength={10} value={step1.mobile_number}
                    onChange={e=>setStep1(p=>({...p,mobile_number:e.target.value.replace(/\D/g,'')}))} />
                </div>
                <span className="hint">OTP alerts will be sent to this number</span>
                {errors.mobile_number && <span className="error">{errors.mobile_number}</span>}
              </div>
              <div className="field-group">
                <label>Email Address</label>
                <input type="email" placeholder="Optional" value={step1.email}
                  onChange={e=>setStep1(p=>({...p,email:e.target.value}))} />
              </div>
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={()=>navigate('/dashboard')}>← Back to Dashboard</button>
              <button className="btn-primary" onClick={nextStep}>Save & Next →</button>
            </div>
          </div>
        )}

        {/* ── STEP 2 ── */}
        {currentStep === 2 && (
          <div className="enroll-card">
            <div className="info-banner">ℹ In India, your registered address determines your constituency.</div>
            <div className="section-header"><span className="section-icon">📍</span><h3>Part B: Address & Constituency Details</h3></div>
            <div className="field-row">
              <div className="field-group">
                <label>House No. / Flat No. <span className="required">*</span></label>
                <input type="text" value={step2.house_number} onChange={e=>setStep2(p=>({...p,house_number:e.target.value}))} />
                {errors.house_number && <span className="error">{errors.house_number}</span>}
              </div>
              <div className="field-group">
                <label>Street / Area <span className="required">*</span></label>
                <input type="text" value={step2.street} onChange={e=>setStep2(p=>({...p,street:e.target.value}))} />
                {errors.street && <span className="error">{errors.street}</span>}
              </div>
            </div>
            <div className="field-group">
              <label>Village / Town / City <span className="required">*</span></label>
              <input type="text" value={step2.city} onChange={e=>setStep2(p=>({...p,city:e.target.value}))} />
              {errors.city && <span className="error">{errors.city}</span>}
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Pincode <span className="required">*</span></label>
                <input type="text" maxLength={6} value={step2.pincode}
                  onChange={e=>setStep2(p=>({...p,pincode:e.target.value.replace(/\D/g,'')}))} />
                {errors.pincode && <span className="error">{errors.pincode}</span>}
              </div>
              <div className="field-group">
                <label>State</label><input type="text" value="Karnataka" disabled />
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>District <span className="required">*</span></label>
                <select value={step2.district} onChange={e=>handleDistrictChange(e.target.value)}>
                  <option value="">Select District</option>
                  {Object.keys(karnatakaData).sort().map(d=><option key={d} value={d}>{d}</option>)}
                </select>
                {errors.district && <span className="error">{errors.district}</span>}
              </div>
              <div className="field-group">
                <label>Assembly Constituency <span className="required">*</span></label>
                <select value={step2.assembly_constituency} onChange={e=>handleConstituencyChange(e.target.value)} disabled={!step2.district}>
                  <option value="">Select Constituency</option>
                  {(karnatakaData[step2.district]||[]).map(c=><option key={c} value={c}>{c}</option>)}
                </select>
                {errors.assembly_constituency && <span className="error">{errors.assembly_constituency}</span>}
              </div>
            </div>
            <div className="field-group">
              <label>Parliamentary Constituency</label>
              <input type="text" value={step2.parliamentary_constituency} disabled />
            </div>
            <div className="field-group">
              <label>Assigned Polling Booth</label>
              <input type="text" value={step2.assigned_booth} disabled />
            </div>
            <div className="btn-row">
              <button className="btn-secondary" onClick={prevStep}>← Back</button>
              <button className="btn-primary" onClick={nextStep}>Save & Next →</button>
            </div>
          </div>
        )}

        {/* ── STEP 3 ── */}
        {currentStep === 3 && (
          <div className="step3-grid">
            <div className="enroll-card">
              <div className="section-header"><span className="section-icon">📷</span><h3>Part D: Photo & Aadhaar Verification</h3></div>

              <div className="field-group">
                <label>Voter Photo (Webcam) <span className="required">*</span></label>
                <p className="hint" style={{marginBottom:10}}>
                  Ask the voter to look directly into the camera. Photo will be compared with Aadhaar database.
                </p>

                {cameraActive && (
                  <div className="webcam-container">
                    <video ref={videoRef} className="webcam-video" autoPlay playsInline muted />
                    <button className="webcam-capture-btn" onClick={capturePhoto}>📸 Capture Photo</button>
                  </div>
                )}

                <canvas ref={canvasRef} style={{ display:'none' }} />

                {photoB64 && !cameraActive && (
                  <div className="webcam-preview">
                    <img src={photoB64} alt="Captured" className="webcam-preview-img" />
                    <button className="btn-secondary" style={{marginTop:8, fontSize:12}} onClick={retakePhoto}>
                      🔄 Retake Photo
                    </button>
                  </div>
                )}

                {!cameraActive && !photoB64 && (
                  <button className="webcam-open-btn" onClick={openCamera}>
                    📷 Open Camera
                  </button>
                )}

                {cameraError && <div className="error">{cameraError}</div>}
                {errors.photo && <span className="error">{errors.photo}</span>}
              </div>

              <div className="field-group">
                <label>Aadhaar Number <span className="required">*</span></label>
                <input
                  type="text"
                  placeholder="XXXX-XXXX-XXXX"
                  maxLength={14}
                  value={step3.aadhaar_number}
                  onChange={e => {
                    setStep3(p=>({...p,aadhaar_number:e.target.value}))
                    setAadhaarResult(null)
                  }}
                />
                <div className="privacy-notice">
                  🔒 Your Aadhaar number is hashed (SHA-256) before storage. The raw number is never stored by VeriVote.
                </div>
                {errors.aadhaar_number && <span className="error">{errors.aadhaar_number}</span>}

                <button
                  className="aadhaar-verify-btn"
                  onClick={verifyAadhaar}
                  disabled={aadhaarVerifying || !photoB64}
                  style={{marginTop:10}}
                >
                  {aadhaarVerifying ? '⏳ Verifying...' : '🔍 Verify Aadhaar & Match Photo'}
                </button>
                {!photoB64 && <span className="hint" style={{color:'#c05621'}}>⚠ Capture photo before verifying</span>}
              </div>

              <AadhaarResultBadge />
              {errors.aadhaar_verify && <div className="error" style={{marginTop:8}}>{errors.aadhaar_verify}</div>}
              {errors.face && <div className="error" style={{marginTop:8}}>{errors.face}</div>}

              <div className="declaration-box">
                <div className="declaration-title">📋 Enrollment Officer Declaration</div>
                <label className="declaration-check">
                  <input type="checkbox" />
                  <span>
                    I certify that I have verified the voter's identity documents in person,
                    the voter is an Indian citizen above 18, all information is accurate,
                    and the biometric data belongs to the voter present before me.
                  </span>
                </label>
              </div>
            </div>

            <div className="enroll-card biometric-card">
              <div className="section-header"><span className="section-icon">👆</span><h3>Part E: Biometric</h3></div>
              <p className="biometric-instruction">
                Ask the voter to place their RIGHT index finger flat and still on the MFS100 scanner.
              </p>

              <div className={`fingerprint-display ${captureStatus==='done'?'captured':captureStatus==='failed'?'failed':''}`}>
                {captureStatus==='idle'      && <div className="fp-rings"><div></div><div></div><div></div></div>}
                {captureStatus==='capturing' && <div className="fp-scanning">Scanning...</div>}
                {captureStatus==='done'      && <div className="fp-success">✓ Captured</div>}
                {captureStatus==='failed'    && <div className="fp-failed">✕ Failed — Retry</div>}
              </div>

              <div className="checklist">
                <div className="checklist-title">ENROLLMENT CHECKLIST</div>

                <div className={`checklist-item ${photoB64?'done':''}`}>
                  <span>📷 Webcam Photo</span>
                  <span className={photoB64?'status-done':'status-pending'}>{photoB64?'✓ Captured':'◷ Pending'}</span>
                </div>

                <div className={`checklist-item ${aadhaarResult?.valid?'done':''}`}>
                  <span>🔐 Aadhaar Verified</span>
                  <span className={aadhaarResult?.valid?'status-done':'status-pending'}>
                    {aadhaarResult?.valid ? '✓ Valid' : '◷ Pending'}
                  </span>
                </div>

                <div className={`checklist-item ${aadhaarResult?.face_match===true?'done':aadhaarResult?.face_match===false?'fail':''}`}>
                  <span>👤 Face Match</span>
                  <span className={aadhaarResult?.face_match===true?'status-done':aadhaarResult?.face_match===false?'status-fail':'status-pending'}>
                    {aadhaarResult?.face_match===true  ? '✓ Matched'  :
                     aadhaarResult?.face_match===false ? '✕ Mismatch' :
                     aadhaarResult?.face_match===null  ? '⚠ Skipped'  : '◷ Pending'}
                  </span>
                </div>

                <div className={`checklist-item ${aadhaarResult?.valid && !aadhaarResult?.duplicate_voter?'done':aadhaarResult?.duplicate_voter?'fail':''}`}>
                  <span>🚫 Duplicate Check</span>
                  <span className={aadhaarResult?.valid && !aadhaarResult?.duplicate_voter?'status-done':aadhaarResult?.duplicate_voter?'status-fail':'status-pending'}>
                    {aadhaarResult?.duplicate_voter ? '✕ Duplicate!' :
                     aadhaarResult?.valid           ? '✓ Unique'     : '◷ Pending'}
                  </span>
                </div>

                <div className={`checklist-item ${captureStatus==='done'?'done':''}`}>
                  <span>👆 Fingerprint</span>
                  <span className={captureStatus==='done'?'status-done':'status-pending'}>
                    {captureStatus==='done'?'✓ Ready':'◷ Pending'}
                  </span>
                </div>
              </div>

              <button
                className={`capture-btn ${captureStatus==='done'?'capture-done':''}`}
                onClick={captureFingerprint}
                disabled={captureStatus==='capturing'}
              >
                {captureStatus==='capturing' ? 'Scanning...'                      :
                 captureStatus==='done'      ? '✓ Fingerprint Captured — Rescan'  :
                                              '👆 Capture Fingerprint (MFS100)'}
              </button>

              {errors.fingerprint_b64 && <span className="error">{errors.fingerprint_b64}</span>}
              {submitError && <div className="error-banner">{submitError}</div>}
            </div>

            <div className="step3-btn-row">
              <button className="btn-secondary" onClick={prevStep}>← Back</button>
              <button
                className="btn-primary"
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  !photoB64 ||
                  !aadhaarResult?.valid ||
                  aadhaarResult?.duplicate_voter === true ||
                  aadhaarResult?.face_match === false ||
                  captureStatus !== 'done'
                }
              >
                {submitting ? 'Submitting...' : 'Complete Registration →'}
              </button>
            </div>
          </div>
        )}
      </main>

      <footer className="footer">
        <span>VeriVote © 2026 | Election Commission of India</span>
        <span>Powered by Biometric Authentication Technology</span>
        <span>🔧 Demo Mode - No real data submitted</span>
      </footer>
    </div>
  )
}