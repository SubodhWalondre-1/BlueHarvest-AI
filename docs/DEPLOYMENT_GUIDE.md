# BlueHarvest AI - Production Deployment Guide

## Docker Multi-Stage Deployment
```bash
# Build production backend image
docker build -t blueharvest-backend:latest ./blueharvest-backend

# Run application container
docker run -d -p 8000:8000 --env-file ./blueharvest-backend/.env blueharvest-backend:latest
```