from fastapi_pagination import Page

from app.schemas.openapi.v1.common import OpenApiPageData
from app.schemas.openapi.v1.file_management import OpenFileFolder, OpenFileManagementFile
from app.services.openapi.v1.training_dataset_service import to_model, to_page_data


def to_file_folder(value) -> OpenFileFolder:
    return to_model(OpenFileFolder, value)


def to_file_folder_page(page: Page) -> OpenApiPageData[OpenFileFolder]:
    return to_page_data(OpenFileFolder, page)


def to_file_management_file(value) -> OpenFileManagementFile:
    return to_model(OpenFileManagementFile, value)


def to_file_management_file_page(page: Page) -> OpenApiPageData[OpenFileManagementFile]:
    return to_page_data(OpenFileManagementFile, page)
