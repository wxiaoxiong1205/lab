/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  docs: [
    {
      "type": "category",
      "label": "DeepexiLab 文档中心",
      "items": [
        {
          "type": "doc",
          "id": "index",
          "label": "产品概述"
        },
        {
          "type": "doc",
          "id": "operation",
          "label": "操作指南"
        }
      ]
    },
    {
      "type": "category",
      "label": "开放平台",
      "items": [
        {
          "type": "category",
          "label": "接口 API",
          "items": [
            {
              "type": "doc",
              "id": "common",
              "label": "开放平台接口公共说明"
            },
            {
              "type": "category",
              "label": "认证与签名",
              "items": [
                {
                  "type": "doc",
                  "id": "auth/generate_signature",
                  "label": "密钥签名生成"
                }
              ]
            },
            {
              "type": "category",
              "label": "数据集接口",
              "items": [
                {
                  "type": "doc",
                  "id": "dataset/create_dataset",
                  "label": "上传数据集"
                },
                {
                  "type": "doc",
                  "id": "dataset/create_dataset_version",
                  "label": "上传数据集新版本"
                },
                {
                  "type": "doc",
                  "id": "dataset/delete_dataset_version",
                  "label": "删除数据集单个版本"
                },
                {
                  "type": "doc",
                  "id": "dataset/delete_dataset_all_versions",
                  "label": "删除数据集全部版本"
                },
                {
                  "type": "doc",
                  "id": "dataset/list_datasets",
                  "label": "分页查询数据集"
                },
                {
                  "type": "doc",
                  "id": "dataset/filter_datasets",
                  "label": "按聚合条件过滤数据集"
                },
                {
                  "type": "doc",
                  "id": "dataset/list_dataset_versions",
                  "label": "查询数据集版本列表"
                },
                {
                  "type": "doc",
                  "id": "dataset/check_dataset_in_use",
                  "label": "查询数据集使用状态"
                },
                {
                  "type": "doc",
                  "id": "dataset/preview_dataset_samples",
                  "label": "预览数据集样本"
                },
                {
                  "type": "doc",
                  "id": "dataset/get_dataset_aggregation_stats",
                  "label": "查询数据集聚合统计"
                },
                {
                  "type": "doc",
                  "id": "dataset/download_dataset",
                  "label": "下载数据集版本"
                },
                {
                  "type": "doc",
                  "id": "dataset/download_sample_dataset",
                  "label": "下载数据集样例"
                }
              ]
            },
            {
              "type": "category",
              "label": "文件上传接口",
              "items": [
                {
                  "type": "doc",
                  "id": "upload/init_upload",
                  "label": "初始化分片上传"
                },
                {
                  "type": "doc",
                  "id": "upload/upload_chunk",
                  "label": "上传文件分片"
                },
                {
                  "type": "doc",
                  "id": "upload/get_upload_progress",
                  "label": "查询分片上传进度"
                },
                {
                  "type": "doc",
                  "id": "upload/complete_upload",
                  "label": "完成分片上传"
                }
              ]
            }
          ]
        },
        {
          "type": "doc",
          "id": "open-platform/labutil",
          "label": "Labutil 文档"
        }
      ]
    }
  ]
}

module.exports = sidebars
