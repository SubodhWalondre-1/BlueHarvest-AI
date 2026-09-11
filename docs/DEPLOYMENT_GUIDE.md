# BlueHarvest AI - Production Deployment Guide

## Docker Multi-Stage Deployment
```bash
# Build production backend image
docker build -t blueharvest-backend:latest ./blueharvest-backend

# Run application container
docker run -d -p 8000:8000 --env-file ./blueharvest-backend/.env blueharvest-backend:latest
```
## Cloud Hosting on Render (render.yaml)
- **Service Type**: Web Service (FastAPI ASGI / Uvicorn worker).
- **Python Version**: 3.11+.
- **Health Check Path**: `/api/v1/diagnostics/health`.
- **Database**: Managed PostgreSQL with connection pooling.

## Static Frontend Hosting on Netlify (netlify.toml)
- **Build Command**: `npm run build`
- **Publish Directory**: `dist`
- **Redirects**: SPA fallback `/* -> /index.html 200`
