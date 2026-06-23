from typing import Any, Dict, Optional

import yaml
from fastapi import HTTPException
from fastapi_pagination import Page
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from starlette import status

from app.models.models import JwtUserInfo
from app.models.training_parameter_template import TrainingParameterTemplate
from app.schemas.training_parameter_template import (
    TrainingParameterTemplateCopyRequest,
    TrainingParameterTemplateCreateRequest,
    TrainingParameterTemplateResponse,
    TrainingParameterTemplateUpdateRequest,
    TrainingTemplateFineTuneType,
    TrainingTemplateMethod,
)
from app.services.training_parameter_template.interface import TrainingParameterTemplateService
from app.utils.error_messages import data_exists_error


ALLOWED_GRPO_PARAM_KEYS = {
    "learning_rate",
    "num_train_epochs",
    "per_device_train_batch_size",
    "gradient_accumulation_steps",
    "warmup_ratio",
    "lr_scheduler_type",
    "bf16",
    "gradient_checkpointing",
    "max_grad_norm",
    "rope_scaling",
    "seed",
    "weight_decay",
    "cutoff_len",
    "preprocessing_num_workers",
    "eval_steps",
    "eval_strategy",
    "greater_is_better",
    "load_best_model_at_end",
    "metric_for_best_model",
    "per_device_eval_batch_size",
    "save_steps",
    "save_strategy",
    "save_total_limit",
    "logging_steps",
    "num_generations",
    "max_prompt_length",
    "max_completion_length",
    "temperature",
    "top_p",
    "top_k",
    "repetition_penalty",
    "kl_coefficient",
    "clip_range",
    "advantage_estimator",
    "reward_normalization",
    "reward_scale",
    "lora_rank",
    "lora_target_modules",
    "lora_alpha",
    "lora_dropout",
}


def parse_template_content(content: str) -> tuple[str, Dict[str, Any]]:
    try:
        parsed = yaml.safe_load(content)
    except yaml.YAMLError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"YAML模板解析失败: {exc}")

    if not isinstance(parsed, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="YAML模板根节点必须是对象")

    invalid_root_keys = [key for key in parsed.keys() if key not in {"fineTuneType", "params"}]
    if invalid_root_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的根字段: {', '.join(invalid_root_keys)}",
        )

    fine_tune_type = parsed.get("fineTuneType")
    if fine_tune_type not in {item.value for item in TrainingTemplateFineTuneType}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="fineTuneType 仅支持 full 或 lora")

    params = parsed.get("params")
    if not isinstance(params, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="params 必须是对象")

    invalid_param_keys = [key for key in params.keys() if key not in ALLOWED_GRPO_PARAM_KEYS]
    if invalid_param_keys:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"不支持的训练参数字段: {', '.join(invalid_param_keys)}",
        )

    return fine_tune_type, params


def to_response(template: TrainingParameterTemplate) -> TrainingParameterTemplateResponse:
    return TrainingParameterTemplateResponse.model_validate(template)


class DefaultTrainingParameterTemplateService(TrainingParameterTemplateService):
    async def list_templates(
        self,
        training_method: Optional[TrainingTemplateMethod],
        enabled: Optional[bool],
        name: Optional[str],
        page: int,
        size: int,
    ) -> Page[TrainingParameterTemplateResponse]:
        query = select(TrainingParameterTemplate).order_by(TrainingParameterTemplate.updated_at.desc())
        if training_method:
            query = query.where(TrainingParameterTemplate.training_method == training_method.value)
        if enabled is not None:
            query = query.where(TrainingParameterTemplate.enabled == enabled)
        if name:
            query = query.where(TrainingParameterTemplate.name.ilike(f"%{name}%"))

        result = await self.mapper.query_page(query, page, size)
        return Page(
            items=[to_response(item) for item in result.items],
            total=result.total,
            page=result.page,
            size=result.size,
            pages=result.pages,
        )

    async def create_template(
        self,
        current_user: JwtUserInfo,
        request: TrainingParameterTemplateCreateRequest,
    ) -> TrainingParameterTemplateResponse:
        fine_tune_type, params = parse_template_content(request.template_content)
        template = TrainingParameterTemplate(
            name=request.name,
            description=request.description,
            training_method=request.training_method.value,
            fine_tune_type=fine_tune_type,
            template_content=request.template_content,
            params=params,
            enabled=request.enabled,
            created_id=current_user.userId,
            created_by=current_user.username,
            tenant_id=current_user.tenantId,
        )
        try:
            await self.mapper.insert(template)
            await self.mapper.commit()
        except IntegrityError:
            await self.mapper.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=data_exists_error(request.name))
        return to_response(template)

    async def update_template(
        self,
        template_id: int,
        request: TrainingParameterTemplateUpdateRequest,
    ) -> TrainingParameterTemplateResponse:
        template = await self.mapper.query_one(
            select(TrainingParameterTemplate).where(TrainingParameterTemplate.id == template_id)
        )
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练参数模板不存在")

        payload = request.model_dump(exclude_unset=True)
        if "template_content" in payload:
            fine_tune_type, params = parse_template_content(payload["template_content"])
            template.fine_tune_type = fine_tune_type
            template.params = params
        for key, value in payload.items():
            if hasattr(template, key):
                setattr(template, key, value)

        try:
            await self.mapper.commit()
        except IntegrityError:
            await self.mapper.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=data_exists_error(template.name))
        return to_response(template)

    async def copy_template(
        self,
        template_id: int,
        current_user: JwtUserInfo,
        request: TrainingParameterTemplateCopyRequest,
    ) -> TrainingParameterTemplateResponse:
        source = await self.mapper.query_one(
            select(TrainingParameterTemplate).where(TrainingParameterTemplate.id == template_id)
        )
        if not source:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练参数模板不存在")
        return await self.create_template(
            current_user,
            TrainingParameterTemplateCreateRequest(
                name=request.name,
                description=source.description,
                training_method=TrainingTemplateMethod(source.training_method),
                template_content=source.template_content,
                enabled=source.enabled,
            ),
        )

    async def delete_template(self, template_id: int) -> None:
        template = await self.mapper.query_one(
            select(TrainingParameterTemplate).where(TrainingParameterTemplate.id == template_id)
        )
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练参数模板不存在")
        await self.mapper.delete(template)
        await self.mapper.commit()

    async def toggle_template(self, template_id: int, enabled: bool) -> TrainingParameterTemplateResponse:
        template = await self.mapper.query_one(
            select(TrainingParameterTemplate).where(TrainingParameterTemplate.id == template_id)
        )
        if not template:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="训练参数模板不存在")
        template.enabled = enabled
        await self.mapper.commit()
        return to_response(template)
