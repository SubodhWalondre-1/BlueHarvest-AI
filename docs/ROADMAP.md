# BlueHarvest AI - Project Roadmap & Milestones

## Vision
BlueHarvest AI is an intelligent aquaculture computer vision system designed to provide real-time, automated count and health analytics for fish spawn (fry) using state-of-the-art deep learning architectures.

## Phase 1: Core Research & Foundation (August 2026)
- [x] Problem definition, user interviews with fish hatchery managers
- [x] Computer vision architecture evaluation: Point detection vs density regression
- [x] Model architecture selection: P2PNet (Point-to-Point Network)
- [x] Data collection protocols, lighting standardization, and image preprocessing
- [x] Backend architecture scaffold (FastAPI, SQLAlchemy 2.0, PostgreSQL/SQLite)
- [x] Database entity modeling for hatcheries, ponds, batches, and users

## Phase 2: Inference Engine & Backend API (September 2026)
- [x] PyTorch model inference runtime with automated CPU/CUDA hardware selection
- [x] Image validation pipeline (resolution, blur detection, illumination checks)
- [x] JWT token authentication, OAuth2 Google integration, user management
- [x] Batch session management, metrics aggregation, historical telemetry
- [x] System diagnostics, telemetry health probes, notification dispatchers
- [x] Automated pytest test suite covering auth, counts, and session lifecycles

## Phase 3: Client Dashboard & Visual Experience (October 2026)
- [x] React 19 + Vite frontend application with responsive design tokens
- [x] Dark/light theme management with automatic system preference detection
- [x] WebRTC live camera streaming and drag-and-drop batch file uploads
- [x] High-precision spawn pricing engine (₹0.025/spawn + flat ₹50 packing fee)
- [x] Real-time aquaculture mortality & survival calculations (1-4h 2%, 12-24h 10%, Pond 70%)
- [x] Batch detail modal with 3-column CSS Grid alignment and CSV export