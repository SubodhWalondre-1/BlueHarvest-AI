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
## Image Processing Pipeline Sequence

1. **Ingress**: Capture via WebRTC video stream or multipart file upload.
2. **Quality Validation**: Image resolution verification, blur analysis, contrast grading.
3. **Preprocessing**: Normalization, aspect ratio preservation, adaptive histogram equalization.
4. **Model Inference**: Forward pass through P2PNet feature backbone and coordinate regression heads.
5. **Post-Processing**: Hungarian point assignment, threshold filtering, count aggregation.
6. **Telemetry & Ledger**: Save coordinates, total spawn count, timestamp, and metadata to database.
