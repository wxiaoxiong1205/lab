import logging
import os
import shutil
import subprocess
import tempfile
from datetime import datetime
from typing import List, Optional

import yaml
from fastapi import BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from fastapi_pagination import Page
from kubernetes import client
from kubernetes.client import ApiException
from sqlalchemy import select, delete

from app.models.models import ProjectUser, Project, KubernetesResource, ProjectKubernetesRelation, JwtUserInfo
from app.repository.project_mapper import ProjectMapper
from app.schemas import ProjectCreate, ProjectResponse
from app.schemas.project import ProjectDetailResponse, ProjectInDB
from app.schemas.user import UserIds, ProjectUserBatchResponse
from app.schemas.user_extraI import UserExtraItem
from app.schemas.user_page_payload import UserBasePagePayload, UserPagePayload
from app.services.notebook.interface import NotebookService
from app.services.project.interface import ProjectService
from app.services.project.project import DefaultProjectService
from app.services.user.interface import UserService
from app.utils.auth import get_password_hash
from app.utils.error_messages import data_not_found_error
from app.utils.k8s_call import get_k8s_api, k8s_call
from app.utils.storage_enum import PvcName

logger = logging.getLogger(__name__)


class BelleProjectService(DefaultProjectService):
    def __init__(self, user_service: UserService, notebook_service: NotebookService, mapper: ProjectMapper):
        self.user_service = user_service
        self.notebook_service = notebook_service
        self.mapper = mapper
        super().__init__(user_service, notebook_service, mapper)

    async def create(self, project: ProjectCreate, current_user: JwtUserInfo) -> Project:
        db_project = Project(**ProjectInDB(**project.model_dump()).model_dump())
        db_project.created_id = current_user.userId
        db_project.created_by = current_user.username
        db_project.former_name = project.name
        await self.mapper.insert(db_project)
        await self.mapper.commit()
        await self.mapper.refresh(db_project)
        return db_project



