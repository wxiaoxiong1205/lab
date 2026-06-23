from fastapi import APIRouter
from app.api.v1 import (
    crud_routes,
    import_export_routes
)

# Create a main router for datasets
router = APIRouter(prefix="/api/v1/datasets", tags=["datasets"])

# Include all sub-api
router.include_router(crud_routes.router)
router.include_router(import_export_routes.router) 