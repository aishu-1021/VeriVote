# VeriVote - Biometric Voter Verification System

![Python](https://img.shields.io/badge/Python-3.13-blue) ![Django](https://img.shields.io/badge/Django-5.0.3-green) ![React](https://img.shields.io/badge/React-18-61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6)

A privacy-preserving, tamper-evident voter verification framework combining federated anomaly detection with blockchain-based audit logging.

**Institution:** Dayananda Sagar Academy of Technology and Management (DSATM), Bengaluru
**Semester:** Fourth Semester - Full Stack PBL
**Target:** IEEE Conference Publication

---

## Problem Statement

India's current voting system faces several fraud vulnerabilities:

| Fraud Type | Description |
|-----------|-------------|
| Dead voter impersonation | Voting using a deceased person's voter ID |
| Duplicate enrollment | Same person enrolled in multiple constituencies |
| Fingerprint misuse | Using another person's identity for enrollment |
| Booth capturing | Impersonation voting before legitimate voter arrives |
| Record tampering | Corrupt officers editing verification records |

---

## Key Features

### Module 1 - Voter Enrollment
- 3-step enrollment form (Personal Details, Address, Documents and Biometrics)
- Aadhaar verification against simulated UIDAI database
- Webcam photo capture with ArcFace face matching against Aadhaar photo
- Duplicate face detection across all enrolled voters
- MFS100 fingerprint scan with duplicate fingerprint detection
- SHA-256 hashing of Aadhaar number - never stored in plaintext
- Fraud alert and blockchain log on duplicate fingerprint attempt

### Module 2 - Polling Booth Verification
- Booth officer authentication
- Voter ID lookup and fingerprint verification using MFS110 MatchISO
- Duplicate vote detection
- All events logged to blockchain automatically

### Module 3 - Fraud Intelligence and Analytics Dashboard
- Blockchain Audit Chain: tamper-evident log of all booth events
- Federated Anomaly Detection: Isolation Forest + FedAvg across booths
- Real-time fraud alerts with severity classification
- Charts: fraud by type, booth, severity, verification results
- One-click blockchain integrity check

---

## System Architecture

```
LAYER 1 - IDENTITY VERIFICATION
  Aadhaar Number  -->  SHA-256 Hash  -->  UIDAI DB Lookup
  Webcam Photo    -->  ArcFace (InsightFace)  -->  Face Match
  Fingerprint     -->  MFS100 MatchISO  -->  Biometric Match

LAYER 2 - FRAUD DETECTION (Federated Learning)
  Each booth trains Isolation Forest on local data
  Only model weights shared (never raw voter data)
  FedAvg aggregation  -->  Global fraud signal

LAYER 3 - ACCOUNTABILITY (Blockchain)
  Every verification event  -->  SHA-256 hash chain
  Previous hash embedded in each block
  Tamper detection via integrity check API
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Python | 3.13 | Core language |
| Django | 5.0.3 | Web framework |
| Django REST Framework | 3.15.1 | API layer |
| SQLite | - | Database |
| InsightFace | 1.0.1 | ArcFace face recognition |
| scikit-learn | Latest | Isolation Forest (federated AI) |
| Flower (flwr) | Latest | Federated learning framework |
| OpenCV | 5.0.0 | Image processing |
| ONNX Runtime | Latest | Model inference |

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 + TypeScript | UI framework |
| Vite | Build tool |
| Recharts | Analytics charts |
| Axios | API calls |

### Hardware
| Device        | Purpose |
|---------------|---------|
| Mantra MFS110 | Fingerprint scanning and ISO minutiae matching |
| Webcam        | Voter photo capture for face verification |

---

## Project Structure

```
VERIVOTE NEW/
├── aadhaar/                     # Simulated UIDAI Aadhaar database
│   ├── models.py                # AadhaarRecord model (hashed Aadhaar)
│   ├── views.py                 # Verification API
│   ├── face_utils.py            # ArcFace face matching (InsightFace)
│   └── management/commands/     # seed_aadhaar management command
├── audit_chain/                 # Blockchain audit layer
│   ├── chain.py                 # Block creation and chain verification
│   └── models.py                # Block model
├── biometric/                   # MFS100 fingerprint engine
│   ├── capture.py               # Live fingerprint capture
│   └── verify.py                # ISO minutiae matching
├── booth/                       # Polling booth interface
│   └── views.py                 # Verification and fraud detection
├── federated/                   # Federated Learning layer
│   ├── client.py                # Booth-level Isolation Forest
│   ├── server.py                # FedAvg aggregation
│   └── data.py                  # Real/synthetic booth data
├── fraud_detection/             # Fraud alert system
├── voters/                      # Voter enrollment
│   ├── models.py                # Voter and EnrollmentOfficer models
│   ├── serializers.py           # Enrollment + duplicate fingerprint check
│   └── views.py                 # Enrollment API
├── frontend/                    # React/TypeScript frontend
│   └── src/pages/
│       ├── Enroll.tsx           # 3-step enrollment with webcam + Aadhaar
│       ├── BoothVerify.tsx      # Election day verification
│       └── Analytics.tsx        # Fraud dashboard + blockchain log
└── VeriVote/                    # Django project settings
```

---

## Installation and Setup

### Prerequisites
- Python 3.13
- Node.js 18+
- Mantra MFS110 fingerprint scanner and drivers
- Windows 10/11 (required for MFS100 SDK)
- Windows Long Path support enabled

### Step 1 - Enable Windows Long Paths
Run PowerShell as Administrator:
```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```
Restart your computer after this.

### Step 2 - Clone the repository
```bash
git clone https://github.com/aishu-1021/VeriVote_new.git
cd VeriVote_new
```

### Step 3 - Create and activate virtual environment
```bash
python -m venv venv
venv\Scripts\activate
```

### Step 4 - Install Python dependencies
```bash
pip install django==5.0.3 djangorestframework==3.15.1 django-cors-headers==4.3.1 psycopg2-binary==2.9.12 Pillow==10.4.0 opencv-contrib-python numpy python-dotenv==1.0.1 scikit-learn flwr insightface onnxruntime deepface tf-keras pythonnet
```

### Step 5 - Install MFS100 Fingerprint Driver
Download and install from:
```
https://www.mantratec.com/resources/Software-Download/MFS100-Software
```

### Step 6 - Setup database
```bash
python manage.py makemigrations
python manage.py migrate
python manage.py seed_aadhaar
python manage.py createsuperuser
```

### Step 7 - Add Aadhaar photos for face matching
```
Go to: http://127.0.0.1:8000/admin/
Navigate to: Aadhaar Records -> select each record -> upload a clear face photo
```

### Step 8 - Create officers via Django Admin
```
Enrollment Officers -> Add
Booth Officers -> Add
```

### Step 9 - Run the backend server
```bash
python manage.py runserver
```

### Step 10 - Run the frontend
```bash
cd frontend
npm install
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Django Admin: http://localhost:8000/admin

---

## Security Design

### Privacy Principles
- Aadhaar numbers: never stored in plaintext, always SHA-256 hashed
- Fingerprint templates: stored as binary, never transmitted in cleartext
- Federated Learning: raw booth data never leaves the booth - only model weights shared
- Blockchain: voter ID hashed before logging, party vote choice never recorded

### What Goes On-Chain
```json
{
  "event_type": "VERIFICATION_APPROVED",
  "voter_id_hash": "a1b2c3...",
  "booth_id": "BOOTH/KA/001",
  "officer_id": "BOOTH001",
  "match_score": 87.5
}
```

### What Never Goes On-Chain
- Raw Aadhaar numbers
- Raw voter IDs
- Which party the voter voted for
- Raw fingerprint templates

---

## Testing Scenarios

### Enrollment Testing
| Scenario | Expected Result |
|----------|----------------|
| Valid Aadhaar + matching face | Verified, proceed to fingerprint |
| Invalid Aadhaar number | Not found in UIDAI database |
| Already enrolled Aadhaar | Already registered as voter |
| Face mismatch | Person does not match Aadhaar photo |
| Duplicate face in voter DB | Face already enrolled |
| Duplicate fingerprint | Fingerprint already registered + FraudAlert logged |

### Booth Testing
| Scenario | Expected Result |
|----------|----------------|
| Valid voter + correct fingerprint | APPROVED TO VOTE |
| Valid voter + wrong fingerprint | REJECTED - Fingerprint mismatch + FraudAlert |
| Already voted voter | REJECTED - Already voted + FraudAlert |
| Invalid voter ID | REJECTED - Voter not enrolled |

### Blockchain Testing
| Scenario | Expected Result |
|----------|----------------|
| Edit any block in Django Admin | Integrity check returns is_valid: false |
| Normal unmodified chain | Chain integrity verified |

---

## Research Contributions

This project proposes a dual-layer trust architecture for electoral integrity:

**Layer 1 - Detection (Federated Learning)**
Each polling booth trains a local Isolation Forest on verification event features (match scores, timing patterns, geographic anomalies). Only model weights are aggregated using FedAvg - never raw voter data. This enables privacy-preserving cross-booth fraud detection.

**Layer 2 - Accountability (Blockchain)**
Every verification event is SHA-256 hash-chained. Any post-hoc modification to any record breaks the chain linkage and is immediately detectable via the integrity check API.

**Contribution Statement:**
> A privacy-preserving, tamper-evident voter verification framework combining federated anomaly detection for fraud pattern recognition without centralizing sensitive biometric data, with blockchain-based audit logging for verification record integrity.



---

Made with love for a fraud-free India