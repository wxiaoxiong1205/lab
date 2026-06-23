# GRPO Template Production Adaptation

## Purpose

This note records how the V1.14 GRPO training-parameter template requirement should be adapted after the production source replacement.

The 1.0 Demo contains a localStorage-based GRPO template center. This requirement must not be migrated by copying Demo storage or mock state into production. The production baseline now has a dedicated writable template-management surface. Training creation consumes enabled templates, version detail shows saved template snapshots, and reward-function upload is handled separately through the production chunk-upload path.

## Current Production Evidence

- Production training creation already accepts and persists the first GRPO parameter slice through `additional_params.grpo_config`.
- Production frontend already shows GRPO-specific fields in `production/frontend/apps/lab/src/components/finetune/ParamTabs.tsx`.
- Production backend has `TrainingMethodType.RFT_GRPO` and related enum mapping.
- Production system settings now expose:
  - `属性配置`
  - `标签配置`
  - `训练参数模板`
- Production template persistence uses dedicated `training_parameter_templates` APIs instead of Demo localStorage.
- Production training creation uses the shared chunk uploader for RFT-GRPO custom reward `.py` files and saves the upload reference in `additional_params.grpo_reward_function`.
- Production `common_config` currently provides read-only APIs:
  - `GET /api/v1/common-config`
  - `GET /api/v1/common-config/key/{key}`
- Production `common_config.config_value` is modeled as `String(2000)`, which is not a good long-term fit for multiple editable YAML templates.

## Demo Evidence

Demo reference files:

- `archive/1.0-demo/app/src/services/grpoTrainingParameterTemplateStore.ts`
- `archive/1.0-demo/app/src/components/GrpoTemplateSettings.tsx`
- `archive/1.0-demo/app/src/components/GrpoTrainingParameterFormPreview.tsx`
- `archive/1.0-demo/app/src/components/RewardRulesConfig.tsx`
- `archive/1.0-demo/app/src/pages/Training/CreateTraining.tsx`
- `archive/1.0-demo/app/src/pages/Training/VersionDetail.tsx`

Reusable behavior:

- Templates have name, description, enabled state, training method, fine-tune type, YAML content, and parsed parameter preview.
- YAML root fields are limited to `fineTuneType` and `params`.
- Templates do not include reward rules, DeepSpeed, model, dataset, resource, task name, task version, or scheduling fields.
- Disabled templates must not appear in the training creation selection.
- GRPO version detail should show the saved YAML snapshot used by that run, not the current mutable template definition.

Non-reusable implementation:

- Demo localStorage store.
- Demo in-memory seed/update actions as production persistence.
- Any Demo-only mock task or mock version data.

## Production Adaptation Decision

Do not copy the Demo template store into production.

The production-safe implementation should be split into independent steps:

1. Add a production persistence contract for training-parameter templates.
   - Preferred: a dedicated backend model/table for training parameter templates.
   - Acceptable interim: extend `common_config` only if a migration changes `config_value` to a text field and write APIs are explicitly added.
2. Add backend CRUD APIs with schema validation.
   - List templates by training method.
   - Create/update/delete/copy/toggle enabled.
   - Validate GRPO YAML before save.
3. Add the system settings `模板管理` tab.
   - Reuse production Ant Design 5 patterns.
   - Keep it under `production/frontend/apps/lab/src/pages/systemManage/systemSetting`.
4. Connect training creation.
   - RFT-GRPO flow loads enabled templates.
   - Template selection snapshots YAML into task submission payload.
   - Per-run edits do not mutate the source template.
5. Connect training version detail.
   - Show the saved YAML snapshot from the task version payload.
   - Fall back to current `additional_params.grpo_config` only for older versions.
6. Add reward-rule upload separately.
   - Reward-function file upload is not the same as parameter-template management.
   - It should follow production file/upload service conventions.
   - Store only the production upload reference on the training task payload; do not inline Python code into the parameter template.

## Current Status

Status: `partial-conflict`.

Done:

- First GRPO production adaptation is complete for training method enum, frontend display, GRPO parameter fields, dataset filtering, and `additional_params.grpo_config` persistence.
- Production backend has a dedicated `training_parameter_templates` ORM model, Alembic migration, and `/api/v1/training-parameter-templates` CRUD surface prepared for template persistence.
- Production frontend system settings has a training-parameter-template tab wired to the production CRUD surface.
- Production training creation now loads enabled RFT-GRPO templates, applies selected template parameters into the existing form, and submits a stable `additional_params.grpo_template_snapshot` with template id, name, YAML content, source params, and final applied GRPO params.
- Production training creation now supports a single RFT-GRPO custom reward `.py` upload through `ChunkFileUploader`, validates the file suffix, provides a Python reference-template download, and submits `additional_params.grpo_reward_function` with `upload_id`, `file_name`, `file_url`, `source`, and `template_name`.
- Production training version detail now shows the saved GRPO YAML snapshot from `additional_params.grpo_template_snapshot`, with a legacy fallback generated from `additional_params.grpo_config`.

Not done:

- GRPO three-stage Hand/Work/Submit resource config.

## Guardrails

- Do not add localStorage as the production source of truth for templates.
- Do not store real secrets or environment-specific paths in template content.
- Do not merge reward-rule files into template YAML.
- Do not change existing production SFT/DPO behavior while adding GRPO templates.
- Keep each follow-up migration as an independent commit.
