from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.api.openapi.v1.docs import (
    OPENAPI_V1_PREFIX,
    create_openapi_v1_docs,
    create_openapi_v1_redoc,
    create_openapi_v1_schema,
    normalize_language,
)
from app.api.openapi.v1 import chunk_upload, file_management, machine_learning_dataset, training_dataset

router = APIRouter(prefix=OPENAPI_V1_PREFIX, tags=["openapi-v1"])

router.include_router(training_dataset.router)
router.include_router(chunk_upload.router)
router.include_router(file_management.router)
router.include_router(machine_learning_dataset.router)


@router.get("/openapi.json", include_in_schema=False)
async def openapi_schema(request: Request, lang: str = "zh-CN") -> JSONResponse:
    language = normalize_language(lang)
    return JSONResponse(create_openapi_v1_schema(request.app, language))


@router.get("/openapi.{lang}.json", include_in_schema=False)
async def localized_openapi_schema(request: Request, lang: str) -> JSONResponse:
    language = normalize_language(lang)
    return JSONResponse(create_openapi_v1_schema(request.app, language))


@router.get("/docs", include_in_schema=False)
async def openapi_docs(lang: str = "zh-CN"):
    return create_openapi_v1_docs(lang)


@router.get("/redoc", include_in_schema=False)
async def openapi_redoc(lang: str = "zh-CN"):
    return create_openapi_v1_redoc(lang)
