from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class OpenFileFolder(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int = Field(..., description="Folder ID.")
    folder_name: str = Field(..., validation_alias="name", description="Folder name.")
    description: Optional[str] = Field(None, description="Folder description.")
    project_id: int = Field(..., description="Project ID.")
    created_at: datetime = Field(..., description="Creation time.")
    updated_at: datetime = Field(..., description="Last update time.")
    created_by: Optional[str] = Field(None, description="Creator.")
    file_count: int = Field(0, description="Number of files in the folder.")


class OpenFileFolderCreate(BaseModel):
    folder_name: str = Field(..., min_length=1, max_length=100, description="Folder name.")
    description: Optional[str] = Field(None, max_length=1000, description="Folder description.")
    project_id: int = Field(..., description="Project ID.")

    @property
    def name(self) -> str:
        return self.folder_name


class OpenFileFolderUpdate(BaseModel):
    folder_name: Optional[str] = Field(None, min_length=1, max_length=100, description="Folder name.")
    description: Optional[str] = Field(None, max_length=1000, description="Folder description.")

    @property
    def name(self) -> Optional[str]:
        return self.folder_name


class OpenFileManagementFile(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int = Field(..., description="File ID.")
    file_name: str = Field(..., description="File name.")
    file_size: int = Field(..., description="File size in bytes.")
    file_hash: str = Field(..., description="File hash.")
    file_path: str = Field(..., description="File storage path.")
    folder_id: Optional[int] = Field(None, description="Folder ID.")
    folder_name: Optional[str] = Field(None, description="Folder name.")
    project_id: int = Field(..., description="Project ID.")
    upload_id: Optional[str] = Field(None, description="Upload session ID.")
    created_at: datetime = Field(..., description="Creation time.")
    created_by: Optional[str] = Field(None, description="Creator.")
