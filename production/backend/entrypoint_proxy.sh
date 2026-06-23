#!/bin/bash
exec uvicorn app.proxy_main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app --app-dir /app
