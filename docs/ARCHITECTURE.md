# BlueHarvest AI - System Architecture

```
+--------------------------------------------------------------------------+
|                        Client Tier (React 19 + Vite)                     |
|  - Live WebRTC Camera Stream          - Time Interval Analytics          |
|  - Batch Detail Inspection Modal      - Real Mortality & Survival Engine |
|  - DualFishLoader & Brand Icons       - Dark / Light Theme Tokens        |
+--------------------------------------------------------------------------+
                                     |  REST APIs (Axios + Bearer Tokens)
                                     v
+--------------------------------------------------------------------------+
|                       Application Tier (FastAPI ASGI)                    |
|  - Auth & OAuth2 Router              - Count Session Lifecycle Router    |
|  - P2PNet Inference Controller       - Diagnostics & Health Probes       |
|  - Pricing Valuation Engine          - CSV Export & Telemetry Dispatch   |
+--------------------------------------------------------------------------+
           |                                              |
           v                                              v
+-----------------------+                    +-----------------------------+
| Vision Inference Core |                    | Database Tier (SQLAlchemy)  |
| - PyTorch P2PNet      |                    | - Users & Auth Sessions     |
| - CLAHE Preprocessing |                    | - Batch Ledgers & Telemetry |
| - Non-Max Suppression |                    | - Ponds, Tanks & Settings   |
+-----------------------+                    +-----------------------------+
```