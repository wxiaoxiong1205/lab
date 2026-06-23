from copy import deepcopy
from typing import Any, Dict, Iterable, Optional

from fastapi import FastAPI
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute

SUPPORTED_LANGUAGES = ("zh-CN", "zh-TW", "en-US")
DEFAULT_LANGUAGE = "zh-CN"
OPENAPI_V1_PREFIX = "/openapi/lab/v1"

OPENAPI_V1_INFO: Dict[str, Dict[str, str]] = {
    "zh-CN": {
        "title": "DeepexiLab 开放平台 API",
        "description": "面向外部开发者的 DeepexiLab 开放平台接口文档。接口鉴权沿用平台 Bearer Token 认证。",
        "tag_training_datasets": "开放平台 - 训练数据集",
        "tag_uploads": "开放平台 - 文件上传",
        "tag_file_management": "开放平台 - 文件管理",
        "tag_machine_learning_datasets": "开放平台 - 机器学习数据集",
    },
    "zh-TW": {
        "title": "DeepexiLab 開放平台 API",
        "description": "面向外部開發者的 DeepexiLab 開放平台介面文件。介面鑑權沿用平台 Bearer Token 認證。",
        "tag_training_datasets": "開放平台 - 訓練資料集",
        "tag_uploads": "開放平台 - 檔案上傳",
        "tag_file_management": "開放平台 - 檔案管理",
        "tag_machine_learning_datasets": "開放平台 - 機器學習資料集",
    },
    "en-US": {
        "title": "DeepexiLab Open Platform API",
        "description": "Open platform API reference for external DeepexiLab developers. APIs use the platform Bearer Token authentication flow.",
        "tag_training_datasets": "Open Platform - Training Datasets",
        "tag_uploads": "Open Platform - File Uploads",
        "tag_file_management": "Open Platform - File Management",
        "tag_machine_learning_datasets": "Open Platform - Machine Learning Datasets",
    },
}

TRAINING_DATASET_DOCS: Dict[str, Dict[str, Dict[str, str]]] = {
    "download_sample_dataset": {
        "zh-CN": {
            "summary": "下载训练数据集样例",
            "description": "根据项目、数据集类型、训练方法、数据格式和文件类型下载训练数据集样例文件。",
        },
        "zh-TW": {
            "summary": "下載訓練資料集範例",
            "description": "依據專案、資料集類型、訓練方法、資料格式和檔案類型下載訓練資料集範例檔案。",
        },
        "en-US": {
            "summary": "Download a training dataset sample",
            "description": "Downloads a sample training dataset file by project, dataset type, training method, dataset format, and file type.",
        },
    },
    "download_dataset": {
        "zh-CN": {
            "summary": "下载训练数据集版本",
            "description": "下载指定项目、数据集名称和版本对应的训练数据集文件。",
        },
        "zh-TW": {
            "summary": "下載訓練資料集版本",
            "description": "下載指定專案、資料集名稱和版本對應的訓練資料集檔案。",
        },
        "en-US": {
            "summary": "Download a training dataset version",
            "description": "Downloads the training dataset file for the specified project, dataset name, and version.",
        },
    },
    "list_training_datasets": {
        "zh-CN": {
            "summary": "分页查询训练数据集",
            "description": "按项目分页查询训练数据集摘要，支持名称、数据集类型、训练方法、用途和处理状态等过滤条件。",
        },
        "zh-TW": {
            "summary": "分頁查詢訓練資料集",
            "description": "依專案分頁查詢訓練資料集摘要，支援名稱、資料集類型、訓練方法、用途和處理狀態等篩選條件。",
        },
        "en-US": {
            "summary": "List training datasets",
            "description": "Lists training dataset summaries in a project with pagination and filters such as name, dataset type, training method, usage, and processing status.",
        },
    },
    "get_training_dataset_versions": {
        "zh-CN": {
            "summary": "查询训练数据集版本列表",
            "description": "查询指定项目和数据集名称下的全部训练数据集版本。",
        },
        "zh-TW": {
            "summary": "查詢訓練資料集版本清單",
            "description": "查詢指定專案和資料集名稱下的全部訓練資料集版本。",
        },
        "en-US": {
            "summary": "List training dataset versions",
            "description": "Lists all versions for the specified training dataset name in a project.",
        },
    },
    "check_dataset_in_use_status": {
        "zh-CN": {
            "summary": "查询训练数据集使用状态",
            "description": "查询指定训练数据集版本是否正在被任务或其他资源使用。",
        },
        "zh-TW": {
            "summary": "查詢訓練資料集使用狀態",
            "description": "查詢指定訓練資料集版本是否正在被任務或其他資源使用。",
        },
        "en-US": {
            "summary": "Check training dataset usage",
            "description": "Checks whether the specified training dataset version is currently used by tasks or other resources.",
        },
    },
    "preview_dataset_data": {
        "zh-CN": {
            "summary": "预览训练数据集样本",
            "description": "分页预览指定训练数据集版本中的样本数据。",
        },
        "zh-TW": {
            "summary": "預覽訓練資料集樣本",
            "description": "分頁預覽指定訓練資料集版本中的樣本資料。",
        },
        "en-US": {
            "summary": "Preview training dataset samples",
            "description": "Previews sample records from the specified training dataset version with pagination.",
        },
    },
    "create_training_dataset": {
        "zh-CN": {
            "summary": "上传训练数据集",
            "description": "上传训练数据集文件并创建数据集记录。当前开放平台接口复用平台原有上传处理、校验和鉴权逻辑。",
        },
        "zh-TW": {
            "summary": "上傳訓練資料集",
            "description": "上傳訓練資料集檔案並建立資料集記錄。目前開放平台介面複用平台既有上傳處理、校驗和鑑權邏輯。",
        },
        "en-US": {
            "summary": "Upload a training dataset",
            "description": "Uploads a training dataset file and creates a dataset record. This open platform API reuses the platform upload, validation, and authentication logic.",
        },
    },
    "create_dataset_version": {
        "zh-CN": {
            "summary": "上传训练数据集新版本",
            "description": "为指定训练数据集上传一个新版本文件。",
        },
        "zh-TW": {
            "summary": "上傳訓練資料集新版本",
            "description": "為指定訓練資料集上傳一個新版本檔案。",
        },
        "en-US": {
            "summary": "Upload a new training dataset version",
            "description": "Uploads a new file version for the specified training dataset.",
        },
    },
    "delete_dataset_all_versions": {
        "zh-CN": {
            "summary": "删除训练数据集全部版本",
            "description": "删除指定项目和数据集名称下的全部训练数据集版本。",
        },
        "zh-TW": {
            "summary": "刪除訓練資料集全部版本",
            "description": "刪除指定專案和資料集名稱下的全部訓練資料集版本。",
        },
        "en-US": {
            "summary": "Delete all training dataset versions",
            "description": "Deletes all versions for the specified training dataset name in a project.",
        },
    },
    "delete_single_dataset": {
        "zh-CN": {
            "summary": "删除训练数据集单个版本",
            "description": "删除指定项目、数据集名称和版本对应的训练数据集。",
        },
        "zh-TW": {
            "summary": "刪除訓練資料集單一版本",
            "description": "刪除指定專案、資料集名稱和版本對應的訓練資料集。",
        },
        "en-US": {
            "summary": "Delete a training dataset version",
            "description": "Deletes the training dataset version for the specified project, dataset name, and version.",
        },
    },
    "get_training_dataset_aggregation_stats": {
        "zh-CN": {
            "summary": "查询训练数据集聚合统计",
            "description": "按项目查询训练数据集聚合统计，支持用途、数据格式、数据集类型、训练方法类型和属性值过滤。",
        },
        "zh-TW": {
            "summary": "查詢訓練資料集彙總統計",
            "description": "依專案查詢訓練資料集彙總統計，支援用途、資料格式、資料集類型、訓練方法類型和屬性值篩選。",
        },
        "en-US": {
            "summary": "Get training dataset statistics",
            "description": "Gets aggregated training dataset statistics in a project with filters for usage, dataset format, dataset type, training method type, and attribute values.",
        },
    },
    "list_training_datasets_by_filters": {
        "zh-CN": {
            "summary": "按聚合条件过滤训练数据集",
            "description": "按用途、数据格式、数据集类型、训练方法和属性值等聚合条件分页查询训练数据集摘要。",
        },
        "zh-TW": {
            "summary": "依彙總條件篩選訓練資料集",
            "description": "依用途、資料格式、資料集類型、訓練方法和屬性值等彙總條件分頁查詢訓練資料集摘要。",
        },
        "en-US": {
            "summary": "Filter training datasets by aggregate fields",
            "description": "Lists training dataset summaries with pagination using aggregate filters such as usage, dataset format, dataset type, training method, and attribute values.",
        },
    },
}

UPLOAD_DOCS: Dict[str, Dict[str, Dict[str, str]]] = {
    "create_upload": {
        "zh-CN": {
            "summary": "初始化分片上传",
            "description": "创建文件分片上传会话，返回后续上传分片和完成上传所需的上传会话 ID。",
        },
        "zh-TW": {
            "summary": "初始化分片上傳",
            "description": "建立檔案分片上傳工作階段，回傳後續上傳分片和完成上傳所需的上傳工作階段 ID。",
        },
        "en-US": {
            "summary": "Create a multipart upload",
            "description": "Creates a multipart upload session and returns the upload session ID required for uploading chunks and completing the upload.",
        },
    },
    "upload_chunk": {
        "zh-CN": {
            "summary": "上传文件分片",
            "description": "上传指定上传会话中的单个文件分片。分片索引从 0 开始。",
        },
        "zh-TW": {
            "summary": "上傳檔案分片",
            "description": "上傳指定上傳工作階段中的單一檔案分片。分片索引從 0 開始。",
        },
        "en-US": {
            "summary": "Upload a file chunk",
            "description": "Uploads one file chunk for the specified upload session. Chunk indexes start from 0.",
        },
    },
    "complete_upload": {
        "zh-CN": {
            "summary": "完成分片上传",
            "description": "校验并合并指定上传会话中的所有分片，生成最终文件。",
        },
        "zh-TW": {
            "summary": "完成分片上傳",
            "description": "校驗並合併指定上傳工作階段中的所有分片，產生最終檔案。",
        },
        "en-US": {
            "summary": "Complete a multipart upload",
            "description": "Validates and merges all chunks in the specified upload session to create the final file.",
        },
    },
    "get_upload": {
        "zh-CN": {
            "summary": "查询分片上传进度",
            "description": "查询指定上传会话已上传的分片索引和完成状态。",
        },
        "zh-TW": {
            "summary": "查詢分片上傳進度",
            "description": "查詢指定上傳工作階段已上傳的分片索引和完成狀態。",
        },
        "en-US": {
            "summary": "Get multipart upload progress",
            "description": "Gets uploaded chunk indexes and completion status for the specified upload session.",
        },
    },
}

FILE_MANAGEMENT_DOCS: Dict[str, Dict[str, Dict[str, str]]] = {
    "create_folder": {
        "zh-CN": {"summary": "创建文件夹", "description": "在指定项目下创建文件夹，用于组织文件。"},
        "zh-TW": {"summary": "建立檔案夾", "description": "在指定專案下建立檔案夾，用於組織檔案。"},
        "en-US": {"summary": "Create a folder", "description": "Creates a folder in the specified project for organizing files."},
    },
    "list_folders": {
        "zh-CN": {"summary": "查询文件夹列表", "description": "查询指定项目下的文件夹列表，支持按名称模糊搜索。"},
        "zh-TW": {"summary": "查詢檔案夾清單", "description": "查詢指定專案下的檔案夾清單，支援依名稱模糊搜尋。"},
        "en-US": {"summary": "List folders", "description": "Lists folders in the specified project with optional fuzzy name search."},
    },
    "get_folder": {
        "zh-CN": {"summary": "查询文件夹详情", "description": "查询指定文件夹的详细信息，包括文件数量。"},
        "zh-TW": {"summary": "查詢檔案夾詳情", "description": "查詢指定檔案夾的詳細資訊，包含檔案數量。"},
        "en-US": {"summary": "Get folder details", "description": "Gets details for the specified folder, including file count."},
    },
    "update_folder": {
        "zh-CN": {"summary": "更新文件夹", "description": "更新文件夹名称和描述。"},
        "zh-TW": {"summary": "更新檔案夾", "description": "更新檔案夾名稱和描述。"},
        "en-US": {"summary": "Update a folder", "description": "Updates a folder name and description."},
    },
    "delete_folder": {
        "zh-CN": {"summary": "删除文件夹", "description": "删除指定文件夹，支持批量删除；仅空文件夹可删除。"},
        "zh-TW": {"summary": "刪除檔案夾", "description": "刪除指定檔案夾，支援批量刪除；僅可刪除空檔案夾。"},
        "en-US": {"summary": "Delete folders", "description": "Deletes specified folders in batches. Only empty folders can be deleted."},
    },
    "list_files": {
        "zh-CN": {"summary": "查询文件列表", "description": "查询指定项目下的文件列表，支持按文件夹、文件名和文件后缀筛选。"},
        "zh-TW": {"summary": "查詢檔案清單", "description": "查詢指定專案下的檔案清單，支援依檔案夾、檔名和副檔名篩選。"},
        "en-US": {"summary": "List files", "description": "Lists files in the specified project with filters for folder, file name, and suffix."},
    },
    "download_file": {
        "zh-CN": {"summary": "下载文件", "description": "下载单个文件或批量下载多个文件；批量下载会打包为 zip。"},
        "zh-TW": {"summary": "下載檔案", "description": "下載單一檔案或批量下載多個檔案；批量下載會打包為 zip。"},
        "en-US": {"summary": "Download files", "description": "Downloads a single file or multiple files. Multiple files are packaged as a zip archive."},
    },
    "get_file": {
        "zh-CN": {"summary": "查询文件详情", "description": "查询指定文件的详细信息。"},
        "zh-TW": {"summary": "查詢檔案詳情", "description": "查詢指定檔案的詳細資訊。"},
        "en-US": {"summary": "Get file details", "description": "Gets details for the specified file."},
    },
    "delete_file": {
        "zh-CN": {"summary": "删除文件", "description": "删除指定文件，支持批量删除。"},
        "zh-TW": {"summary": "刪除檔案", "description": "刪除指定檔案，支援批量刪除。"},
        "en-US": {"summary": "Delete files", "description": "Deletes specified files in batches."},
    },
    "save_file_by_upload_id": {
        "zh-CN": {"summary": "保存上传文件信息", "description": "分片上传完成后，根据 upload_id 保存文件信息到文件管理。"},
        "zh-TW": {"summary": "儲存上傳檔案資訊", "description": "分片上傳完成後，依 upload_id 將檔案資訊儲存到檔案管理。"},
        "en-US": {"summary": "Save uploaded file info", "description": "Saves uploaded file information to file management by upload_id after multipart upload completion."},
    },
}

MACHINE_LEARNING_DATASET_DOCS: Dict[str, Dict[str, Dict[str, str]]] = {
    "create_machine_learning_dataset_with_file": {
        "zh-CN": {"summary": "上传机器学习数据集", "description": "上传文件创建机器学习数据集版本。"},
        "zh-TW": {"summary": "上傳機器學習資料集", "description": "上傳檔案建立機器學習資料集版本。"},
        "en-US": {"summary": "Upload a machine learning dataset", "description": "Uploads files to create a machine learning dataset version."},
    },
    "create_machine_learning_dataset_version": {
        "zh-CN": {"summary": "上传机器学习数据集新版本", "description": "继承已有版本并可追加新文件，创建机器学习数据集新版本。"},
        "zh-TW": {"summary": "上傳機器學習資料集新版本", "description": "繼承既有版本並可追加新檔案，建立機器學習資料集新版本。"},
        "en-US": {"summary": "Upload a new machine learning dataset version", "description": "Inherits an existing version and optionally appends new files to create a new machine learning dataset version."},
    },
    "download_machine_learning_sample_dataset": {
        "zh-CN": {"summary": "下载机器学习数据集样例", "description": "根据数据类型、标注模板和文件格式下载机器学习数据集样例文件。"},
        "zh-TW": {"summary": "下載機器學習資料集範例", "description": "依資料類型、標註模板和檔案格式下載機器學習資料集範例檔案。"},
        "en-US": {"summary": "Download a machine learning dataset sample", "description": "Downloads a machine learning dataset sample file by data type, template type, and file type."},
    },
    "download_machine_learning_dataset": {
        "zh-CN": {"summary": "下载机器学习数据集", "description": "下载指定机器学习数据集版本，支持按导出格式下载。"},
        "zh-TW": {"summary": "下載機器學習資料集", "description": "下載指定機器學習資料集版本，支援依匯出格式下載。"},
        "en-US": {"summary": "Download a machine learning dataset", "description": "Downloads the specified machine learning dataset version with the selected export format."},
    },
    "get_machine_learning_dataset_versions": {
        "zh-CN": {"summary": "查询机器学习数据集版本列表", "description": "根据数据集 ID 查询同名机器学习数据集的全部版本。"},
        "zh-TW": {"summary": "查詢機器學習資料集版本清單", "description": "依資料集 ID 查詢同名機器學習資料集的全部版本。"},
        "en-US": {"summary": "List machine learning dataset versions", "description": "Lists all versions for the machine learning dataset group identified by dataset ID."},
    },
    "list_machine_learning_datasets": {
        "zh-CN": {"summary": "分页查询机器学习数据集", "description": "分页查询项目下机器学习数据集，支持名称、任务类型、模板和标注状态筛选。"},
        "zh-TW": {"summary": "分頁查詢機器學習資料集", "description": "分頁查詢專案下機器學習資料集，支援名稱、任務類型、模板和標註狀態篩選。"},
        "en-US": {"summary": "List machine learning datasets", "description": "Lists machine learning datasets in a project with filters for name, task type, template type, and annotation status."},
    },
    "update_machine_learning_dataset_basic_info": {
        "zh-CN": {"summary": "编辑机器学习数据集基础信息", "description": "编辑机器学习数据集名称或描述；修改名称会同步同名数据集的所有版本。"},
        "zh-TW": {"summary": "編輯機器學習資料集基礎資訊", "description": "編輯機器學習資料集名稱或描述；修改名稱會同步同名資料集的所有版本。"},
        "en-US": {"summary": "Update machine learning dataset basic info", "description": "Updates a machine learning dataset name or description. Renaming syncs all versions with the same name."},
    },
    "get_machine_learning_dataset_detail": {
        "zh-CN": {"summary": "查询机器学习数据集详情", "description": "查询指定机器学习数据集详情，并分页返回样本数据。"},
        "zh-TW": {"summary": "查詢機器學習資料集詳情", "description": "查詢指定機器學習資料集詳情，並分頁返回樣本資料。"},
        "en-US": {"summary": "Get machine learning dataset details", "description": "Gets details for the specified machine learning dataset and paginated sample data."},
    },
    "delete_machine_learning_dataset": {
        "zh-CN": {"summary": "删除机器学习数据集版本", "description": "删除指定机器学习数据集版本及其存储文件。"},
        "zh-TW": {"summary": "刪除機器學習資料集版本", "description": "刪除指定機器學習資料集版本及其儲存檔案。"},
        "en-US": {"summary": "Delete a machine learning dataset version", "description": "Deletes the specified machine learning dataset version and its stored files."},
    },
    "delete_machine_learning_dataset_all_versions": {
        "zh-CN": {"summary": "删除机器学习数据集全部版本", "description": "根据数据集 ID 定位同名数据集，并删除全部版本。"},
        "zh-TW": {"summary": "刪除機器學習資料集全部版本", "description": "依資料集 ID 定位同名資料集，並刪除全部版本。"},
        "en-US": {"summary": "Delete all machine learning dataset versions", "description": "Deletes all versions for the machine learning dataset group identified by dataset ID."},
    },
    "get_machine_learning_task_export_formats": {
        "zh-CN": {"summary": "查询机器学习数据集导出格式", "description": "返回每个机器学习任务模板支持的导出格式。"},
        "zh-TW": {"summary": "查詢機器學習資料集匯出格式", "description": "返回每個機器學習任務模板支援的匯出格式。"},
        "en-US": {"summary": "List machine learning export formats", "description": "Returns supported export formats for each machine learning task template."},
    },
}

FIELD_DOCS: Dict[str, Dict[str, str]] = {
    "project_id": {
        "zh-CN": "项目 ID。",
        "zh-TW": "專案 ID。",
        "en-US": "Project ID.",
    },
    "dataset_name": {
        "zh-CN": "数据集名称。",
        "zh-TW": "資料集名稱。",
        "en-US": "Dataset name.",
    },
    "name": {
        "zh-CN": "名称。",
        "zh-TW": "名稱。",
        "en-US": "Name.",
    },
    "version": {
        "zh-CN": "数据集版本号。",
        "zh-TW": "資料集版本號。",
        "en-US": "Dataset version.",
    },
    "dataset_id": {
        "zh-CN": "数据集 ID。",
        "zh-TW": "資料集 ID。",
        "en-US": "Dataset ID.",
    },
    "folder_id": {
        "zh-CN": "文件夹 ID。",
        "zh-TW": "檔案夾 ID。",
        "en-US": "Folder ID.",
    },
    "folder_ids": {
        "zh-CN": "文件夹 ID 字符串，多个 ID 使用英文逗号分隔。",
        "zh-TW": "檔案夾 ID 字串，多個 ID 使用英文逗號分隔。",
        "en-US": "Folder ID string. Separate multiple IDs with commas.",
    },
    "file_id": {
        "zh-CN": "文件 ID。",
        "zh-TW": "檔案 ID。",
        "en-US": "File ID.",
    },
    "file_ids": {
        "zh-CN": "文件 ID 字符串，多个 ID 使用英文逗号分隔。",
        "zh-TW": "檔案 ID 字串，多個 ID 使用英文逗號分隔。",
        "en-US": "File ID string. Separate multiple IDs with commas.",
    },
    "dataset_type": {
        "zh-CN": "数据集类型。",
        "zh-TW": "資料集類型。",
        "en-US": "Dataset type.",
    },
    "data_type": {
        "zh-CN": "数据类型。",
        "zh-TW": "資料類型。",
        "en-US": "Data type.",
    },
    "data_source": {
        "zh-CN": "数据来源。",
        "zh-TW": "資料來源。",
        "en-US": "Data source.",
    },
    "annotation_type": {
        "zh-CN": "标注类型。",
        "zh-TW": "標註類型。",
        "en-US": "Annotation type.",
    },
    "template_type": {
        "zh-CN": "标注模板。",
        "zh-TW": "標註模板。",
        "en-US": "Template type.",
    },
    "task_type": {
        "zh-CN": "任务类型。",
        "zh-TW": "任務類型。",
        "en-US": "Task type.",
    },
    "is_annotated": {
        "zh-CN": "是否有标注数据。",
        "zh-TW": "是否有標註資料。",
        "en-US": "Whether the dataset has annotations.",
    },
    "export_format": {
        "zh-CN": "导出格式。",
        "zh-TW": "匯出格式。",
        "en-US": "Export format.",
    },
    "inherit_from_version": {
        "zh-CN": "是否从已有版本继承数据。",
        "zh-TW": "是否從既有版本繼承資料。",
        "en-US": "Whether to inherit data from an existing version.",
    },
    "source_version": {
        "zh-CN": "被继承的源版本号。",
        "zh-TW": "被繼承的來源版本號。",
        "en-US": "Source version to inherit from.",
    },
    "notebook_id": {
        "zh-CN": "Notebook ID。",
        "zh-TW": "Notebook ID。",
        "en-US": "Notebook ID.",
    },
    "notebook_name": {
        "zh-CN": "Notebook 名称。",
        "zh-TW": "Notebook 名稱。",
        "en-US": "Notebook name.",
    },
    "notebook_path": {
        "zh-CN": "Notebook 文件来源地址。",
        "zh-TW": "Notebook 檔案來源地址。",
        "en-US": "Notebook file source path.",
    },
    "training_method_type": {
        "zh-CN": "训练方法类型。",
        "zh-TW": "訓練方法類型。",
        "en-US": "Training method type.",
    },
    "dataset_format": {
        "zh-CN": "数据格式。",
        "zh-TW": "資料格式。",
        "en-US": "Dataset format.",
    },
    "file_type": {
        "zh-CN": "样例文件类型。",
        "zh-TW": "範例檔案類型。",
        "en-US": "Sample file type.",
    },
    "export_type": {
        "zh-CN": "数据集导出格式；未传入时默认导出 JSONL。",
        "zh-TW": "資料集匯出格式；未傳入時預設匯出 JSONL。",
        "en-US": "Dataset export format. Defaults to JSONL when omitted.",
    },
    "suffix": {
        "zh-CN": "文件后缀搜索，如 jsonl、jpg，不需要包含点号。",
        "zh-TW": "副檔名搜尋，如 jsonl、jpg，不需包含點號。",
        "en-US": "File suffix filter, such as jsonl or jpg, without the dot.",
    },
    "usage": {
        "zh-CN": "数据集用途。",
        "zh-TW": "資料集用途。",
        "en-US": "Dataset usage.",
    },
    "processing_status": {
        "zh-CN": "数据集处理状态。",
        "zh-TW": "資料集處理狀態。",
        "en-US": "Dataset processing status.",
    },
    "page": {
        "zh-CN": "页码，从 1 开始。",
        "zh-TW": "頁碼，從 1 開始。",
        "en-US": "Page number, starting from 1.",
    },
    "size": {
        "zh-CN": "每页数量。",
        "zh-TW": "每頁數量。",
        "en-US": "Number of items per page.",
    },
    "chunk_upload_ids": {
        "zh-CN": "分片上传 ID 列表，多个 ID 使用英文逗号分隔。上传新版本时，继承模式可不传；传入时会与源版本数据合并。",
        "zh-TW": "分片上傳 ID 清單，多個 ID 使用英文逗號分隔。上傳新版本時，繼承模式可不傳；傳入時會與來源版本資料合併。",
        "en-US": "Chunk upload ID list. Separate multiple IDs with commas. When uploading a new version, this is optional in inheritance mode; if provided, uploaded data is merged with the source version.",
    },
    "description": {
        "zh-CN": "描述，最多 1000 个字符。",
        "zh-TW": "描述，最多 1000 個字元。",
        "en-US": "Description, up to 1000 characters.",
    },
    "dataset_config": {
        "zh-CN": "数据集配置，JSON 字符串。",
        "zh-TW": "資料集設定，JSON 字串。",
        "en-US": "Dataset configuration as a JSON string.",
    },
    "attr_values": {
        "zh-CN": "关联属性值和选项，JSON 数组字符串。",
        "zh-TW": "關聯屬性值和選項，JSON 陣列字串。",
        "en-US": "Related attribute values and options as a JSON array string.",
    },
    "attr_name": {
        "zh-CN": "按属性名称筛选，需与 option_value 同时传入。",
        "zh-TW": "依屬性名稱篩選，需與 option_value 同時傳入。",
        "en-US": "Attribute name filter. Must be used together with option_value.",
    },
    "option_value": {
        "zh-CN": "按属性选项值筛选，需与 attr_name 同时传入。",
        "zh-TW": "依屬性選項值篩選，需與 attr_name 同時傳入。",
        "en-US": "Attribute option value filter. Must be used together with attr_name.",
    },
    "upload_id": {
        "zh-CN": "上传会话 ID。",
        "zh-TW": "上傳工作階段 ID。",
        "en-US": "Upload session ID.",
    },
    "chunk_index": {
        "zh-CN": "分片索引，从 0 开始。",
        "zh-TW": "分片索引，從 0 開始。",
        "en-US": "Chunk index, starting from 0.",
    },
    "file_hash": {
        "zh-CN": "文件 SHA-256 哈希值。",
        "zh-TW": "檔案 SHA-256 雜湊值。",
        "en-US": "File SHA-256 hash.",
    },
    "file": {
        "zh-CN": "分片文件。",
        "zh-TW": "分片檔案。",
        "en-US": "Chunk file.",
    },
    "file_name": {
        "zh-CN": "文件名。",
        "zh-TW": "檔案名稱。",
        "en-US": "File name.",
    },
    "file_size": {
        "zh-CN": "文件大小，单位字节。",
        "zh-TW": "檔案大小，單位位元組。",
        "en-US": "File size in bytes.",
    },
    "chunk_size": {
        "zh-CN": "分片大小，单位字节。",
        "zh-TW": "分片大小，單位位元組。",
        "en-US": "Chunk size in bytes.",
    },
    "total_chunks": {
        "zh-CN": "总分片数。",
        "zh-TW": "總分片數。",
        "en-US": "Total number of chunks.",
    },
    "uploaded_chunks": {
        "zh-CN": "已上传分片索引列表。",
        "zh-TW": "已上傳分片索引清單。",
        "en-US": "Uploaded chunk indexes.",
    },
    "is_complete": {
        "zh-CN": "是否已完成。",
        "zh-TW": "是否已完成。",
        "en-US": "Whether the upload is complete.",
    },
    "file_url": {
        "zh-CN": "文件地址。",
        "zh-TW": "檔案地址。",
        "en-US": "File URL.",
    },
    "total_chunk_num": {
        "zh-CN": "总分片数。",
        "zh-TW": "總分片數。",
        "en-US": "Total number of chunks.",
    },
}

FIELD_DOC_OVERRIDES: Dict[str, Dict[str, Dict[str, str]]] = {
    "openapi_v1_training_datasets_list_training_datasets": {
        "query:dataset_name": {
            "zh-CN": "数据集名称或按名称搜索的关键字。",
            "zh-TW": "資料集名稱或依名稱搜尋的關鍵字。",
            "en-US": "Dataset name or keyword used to search by name.",
        },
    },
    "openapi_v1_training_datasets_list_training_datasets_by_filters": {
        "query:dataset_name": {
            "zh-CN": "数据集名称或按名称搜索的关键字。",
            "zh-TW": "資料集名稱或依名稱搜尋的關鍵字。",
            "en-US": "Dataset name or keyword used to search by name.",
        },
    },
    "openapi_v1_uploads_complete_upload": {
        "query:usage": {
            "zh-CN": "文件用途。",
            "zh-TW": "檔案用途。",
            "en-US": "File usage.",
        },
        "query:project_id": {
            "zh-CN": "项目 ID。非公共用途时必填。",
            "zh-TW": "專案 ID。非公共用途時必填。",
            "en-US": "Project ID. Required for non-public usage.",
        },
    },
}


def normalize_language(language: Optional[str]) -> str:
    if not language:
        return DEFAULT_LANGUAGE
    normalized = language.strip()
    return normalized if normalized in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


def get_training_dataset_doc(endpoint_name: str, language: str = DEFAULT_LANGUAGE) -> Dict[str, str]:
    docs = TRAINING_DATASET_DOCS.get(endpoint_name, {})
    return docs.get(normalize_language(language)) or docs.get(DEFAULT_LANGUAGE, {})


def get_upload_doc(endpoint_name: str, language: str = DEFAULT_LANGUAGE) -> Dict[str, str]:
    docs = UPLOAD_DOCS.get(endpoint_name, {})
    return docs.get(normalize_language(language)) or docs.get(DEFAULT_LANGUAGE, {})


def get_file_management_doc(endpoint_name: str, language: str = DEFAULT_LANGUAGE) -> Dict[str, str]:
    docs = FILE_MANAGEMENT_DOCS.get(endpoint_name, {})
    return docs.get(normalize_language(language)) or docs.get(DEFAULT_LANGUAGE, {})


def get_machine_learning_dataset_doc(endpoint_name: str, language: str = DEFAULT_LANGUAGE) -> Dict[str, str]:
    docs = MACHINE_LEARNING_DATASET_DOCS.get(endpoint_name, {})
    return docs.get(normalize_language(language)) or docs.get(DEFAULT_LANGUAGE, {})


def get_field_doc(
    field_name: str,
    language: str = DEFAULT_LANGUAGE,
    operation_id: Optional[str] = None,
    location: Optional[str] = None,
) -> Optional[str]:
    language = normalize_language(language)
    if operation_id and location:
        override = FIELD_DOC_OVERRIDES.get(operation_id, {}).get(f"{location}:{field_name}", {})
        if override:
            return override.get(language) or override.get(DEFAULT_LANGUAGE)
    field_doc = FIELD_DOCS.get(field_name, {})
    return field_doc.get(language) or field_doc.get(DEFAULT_LANGUAGE)


def get_openapi_routes(routes: Iterable[Any]) -> list[Any]:
    return [
        route
        for route in routes
        if isinstance(route, APIRoute)
        and route.path.startswith(f"{OPENAPI_V1_PREFIX}/")
        and not route.path.startswith(f"{OPENAPI_V1_PREFIX}/docs")
        and "openapi" not in route.path.rsplit("/", 1)[-1]
    ]


def _add_bearer_security(openapi_schema: Dict[str, Any]) -> None:
    components = openapi_schema.setdefault("components", {})
    security_schemes = components.setdefault("securitySchemes", {})
    security_schemes["Bearer"] = {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
        "description": "Bearer Token",
    }
    openapi_schema["security"] = [{"Bearer": []}]

    for path_item in openapi_schema.get("paths", {}).values():
        for method, operation in path_item.items():
            if method.lower() in {"get", "post", "put", "delete", "patch", "head", "options"}:
                operation.setdefault("security", [{"Bearer": []}])


def _apply_language(openapi_schema: Dict[str, Any], language: str) -> Dict[str, Any]:
    schema = deepcopy(openapi_schema)
    language = normalize_language(language)
    tag_name = OPENAPI_V1_INFO[language]["tag_training_datasets"]

    schema["info"]["title"] = OPENAPI_V1_INFO[language]["title"]
    schema["info"]["description"] = OPENAPI_V1_INFO[language]["description"]
    upload_tag_name = OPENAPI_V1_INFO[language]["tag_uploads"]
    file_management_tag_name = OPENAPI_V1_INFO[language]["tag_file_management"]
    machine_learning_dataset_tag_name = OPENAPI_V1_INFO[language]["tag_machine_learning_datasets"]
    schema["tags"] = [
        {"name": tag_name},
        {"name": upload_tag_name},
        {"name": file_management_tag_name},
        {"name": machine_learning_dataset_tag_name},
    ]

    for path_item in schema.get("paths", {}).values():
        for method, operation in path_item.items():
            if method.lower() not in {"get", "post", "put", "delete", "patch", "head", "options"}:
                continue
            operation_id = operation.get("operationId", "")
            if operation_id.startswith("openapi_v1_uploads_"):
                endpoint_name = operation_id.replace("openapi_v1_uploads_", "", 1)
                doc = get_upload_doc(endpoint_name, language)
                operation["tags"] = [upload_tag_name]
            elif operation_id.startswith("openapi_v1_file_management_"):
                endpoint_name = operation_id.replace("openapi_v1_file_management_", "", 1)
                doc = get_file_management_doc(endpoint_name, language)
                operation["tags"] = [file_management_tag_name]
            elif operation_id.startswith("openapi_v1_machine_learning_datasets_"):
                endpoint_name = operation_id.replace("openapi_v1_machine_learning_datasets_", "", 1)
                doc = get_machine_learning_dataset_doc(endpoint_name, language)
                operation["tags"] = [machine_learning_dataset_tag_name]
            else:
                endpoint_name = operation_id.replace("openapi_v1_training_datasets_", "", 1)
                doc = get_training_dataset_doc(endpoint_name, language)
                operation["tags"] = [tag_name]
            if doc:
                operation["summary"] = doc.get("summary", operation.get("summary"))
                operation["description"] = doc.get("description", operation.get("description"))
            for parameter in operation.get("parameters", []):
                field_doc = get_field_doc(
                    parameter.get("name", ""),
                    language,
                    operation_id=operation_id,
                    location=parameter.get("in"),
                )
                if field_doc:
                    parameter["description"] = field_doc

    for component_schema in schema.get("components", {}).get("schemas", {}).values():
        for field_name, property_schema in component_schema.get("properties", {}).items():
            field_doc = get_field_doc(field_name, language)
            if field_doc:
                property_schema["description"] = field_doc

    return schema


def create_openapi_v1_schema(app: FastAPI, language: str = DEFAULT_LANGUAGE) -> Dict[str, Any]:
    language = normalize_language(language)
    schema = get_openapi(
        title=OPENAPI_V1_INFO[language]["title"],
        version=app.version,
        description=OPENAPI_V1_INFO[language]["description"],
        routes=get_openapi_routes(app.routes),
    )
    _add_bearer_security(schema)
    return _apply_language(schema, language)


def create_openapi_v1_docs(language: str = DEFAULT_LANGUAGE):
    language = normalize_language(language)
    return get_swagger_ui_html(
        openapi_url=f"{OPENAPI_V1_PREFIX}/openapi.{language}.json",
        title=OPENAPI_V1_INFO[language]["title"],
    )


def create_openapi_v1_redoc(language: str = DEFAULT_LANGUAGE):
    language = normalize_language(language)
    return get_redoc_html(
        openapi_url=f"{OPENAPI_V1_PREFIX}/openapi.{language}.json",
        title=OPENAPI_V1_INFO[language]["title"],
        redoc_js_url="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js",
    )
