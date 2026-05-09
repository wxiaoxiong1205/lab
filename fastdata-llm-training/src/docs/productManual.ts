export interface ProductManualHeading {
  id: string
  title: string
  level: number
}

export interface ProductManualChunk {
  docId: string
  title: string
  sectionTitle: string
  routePath: string
  anchor: string
  content: string
}

export interface ProductManualDocument {
  docId: string
  title: string
  routePath: string
  html: string
  headings: ProductManualHeading[]
  chunks: ProductManualChunk[]
}

export const productManual = {
  "docId": "deepexilab-product-manual-v1-2",
  "title": "DeepexiLab产品使用手册-V1.2",
  "routePath": "/docs/product-manual",
  "html": "<h1 id=\"manual-section-1\" class=\"manual-heading manual-heading-1\">DeepexiLab产品使用手册-V1.2</h1>\n<h1 id=\"manual-section-2\" class=\"manual-heading manual-heading-1\">1. 产品概述</h1>\n<h2 id=\"manual-section-3\" class=\"manual-heading manual-heading-2\">1.1. 产品介绍</h2>\n<p class=\"manual-paragraph\"><strong><em>DeepexiLab是一个一站式模型训练平台，打通「数据管理-模型训练-效果评估」全链路，实现异构算力（GPU/NPU）无感调度。平台提供数据接入、分布式训练、模型评估与版本管理等完整能力，持续沉淀 AI 资产，全面提升训练效率与模型价值。Lab算力管理架构生屏蔽 GPU/NPU 异构差异，实现高效弹性调度算力，有效提升算力资源利用率。</em></strong></p>\n<h2 id=\"manual-section-4\" class=\"manual-heading manual-heading-2\">1.2. 核心优势：</h2>\n<ul class=\"manual-list\"><li><strong><em>全链路闭环</em></strong><strong><em>：覆盖从数据准备到模型服务的完整流程</em></strong></li><li><strong><em>异构算力调度</em></strong><strong><em>：智能屏蔽GPU/NPU差异，资源利用率提升40%+</em></strong></li><li><strong><em>企业级管理</em></strong><strong><em>：项目隔离、权限管控、资源审计三位一体</em></strong></li><li><strong><em>低门槛开发</em></strong><strong><em>：内置主流框架，支持零代码微调</em></strong></li></ul>\n<h2 id=\"manual-section-5\" class=\"manual-heading manual-heading-2\">1.3. 快速开始（完成第一个模型微调）</h2>\n<p class=\"manual-paragraph\"><strong><em>场景：使用SFT对Qwen2.5-0.5B模型进行监督微调</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>步骤概览：</em></strong></p>\n<ul class=\"manual-list\"><li><strong><em>准备数据</em></strong><strong><em>：上传JSONL格式的Prompt-Response数据</em></strong></li><li><strong><em>创建任务</em></strong><strong><em>：选择基础模型与微调方式</em></strong></li><li><strong><em>启动训练</em></strong><strong><em>：配置1-2张GPU，设置学习率0.0001</em></strong></li><li><strong><em>评估效果</em></strong><strong><em>：使用自动评估对比微调前后效果</em></strong></li></ul>\n<p class=\"manual-paragraph\"><strong><em>最佳实践</em></strong><strong><em>：首次建议使用LoRA微调，显存占用减少70%，训练速度提升2-3倍</em></strong></p>\n<h2 id=\"manual-section-6\" class=\"manual-heading manual-heading-2\">1.4. 功能介绍</h2>\n<h3 id=\"manual-section-7\" class=\"manual-heading manual-heading-3\">1.4.1. 用户模块</h3>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId4.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-8\" class=\"manual-heading manual-heading-4\">1.4.1.1. <span style=\"color:#262626\">数据管理</span></h4>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>训练数据管理</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>训练数据管理是模型开发流程的“原材料仓库”，支持对多格式训练数据的统一接入与版本控制。通过数据统一管理，保障训练输入的准确性与一致性，为高质量模型训练奠定坚实基础。</em></strong></span></p>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>测试数据管理</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>测试数据管理是模型评估与验证的关键环节，负责对测试数据集进行统一管理与版本控制。它确保测试数据的独立性、覆盖性和代表性，支持模型在多样场景下的公正评估与持续优化。</em></strong></span></p>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>推理结果集</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>推理结果集管理用于系统化存储、追踪与分析模型的预测输出，</em></strong></span><strong><em>支持离线推理、在线推理和文件导入的推理方式，适用于模型选型、效果评估或模型复用场景。</em></strong></p>\n<h4 id=\"manual-section-9\" class=\"manual-heading manual-heading-4\">1.4.1.2. <span style=\"color:#262626\">数据处理</span></h4>\n<ul class=\"manual-list\"><li><strong><em>数据清洗</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>提供自动化的数据质量提升服务，支持缺失值处理、异常值检测、重复数据去除等清洗算子，确保数据一致性和准确性。</em></strong></span></p>\n<ul class=\"manual-list\"><li><strong><em>数据标注</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>提供在线标注能力，支持选择训练、验证、测试数据集，帮助提高数据标注效率。</em></strong></span></p>\n<h4 id=\"manual-section-10\" class=\"manual-heading manual-heading-4\">1.4.1.3. <span style=\"color:#262626\">模型训练</span></h4>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>在线Notebook</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>在线Notebook打造“开箱即用”的云端Python研发环境：基于Web的JupyterLab内核一键启动，自动完成依赖镜像加载与显卡资源弹性分配。内置主流深度学习框架，帮助提升研发与交付效率。</em></strong></span></p>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>大模型训练</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>大模型训练模块旨在简化训练流程，提高模型训练的效率和效果。用户创建模型训练任务后，通过设置任务的基础信息，选择基础模型和训练方法，调整训练参数如学习率和批大小，管理训练和验证数据集，并分配GPU资源，即可启动训练任务。任务运行完成后，用户可查看训练详情。</em></strong></span></p>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>模型管理</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>提供对训练产出模型的统一管理，通过版本控制帮助用户快速定位相关模型，支持查看模型的详细信息，提高后续模型训练效果比较、模型部署等操作效率。</em></strong></span></p>\n<h4 id=\"manual-section-11\" class=\"manual-heading manual-heading-4\">1.4.1.4. <span style=\"color:#262626\">模型评估</span></h4>\n<ul class=\"manual-list\"><li><strong><em>效果评估</em></strong></li><li><strong><em>自动评估</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>自动评估对对参评模型基于评测数据生成的输出进行自动评分，提供⽂本类⽣成模型的裁判员评估和基础指标评估两种方式。支持单个模型或多个模型对比评估，评估完成后将生成对应评估报告，汇总相关指标得分及每条数据的评估详情和评估日志，用户可根据需要自行查看，分析下一阶段模型迭代方向。</em></strong></span></p>\n<ul class=\"manual-list\"><li><strong><em>基准评估</em></strong></li></ul>\n<p class=\"manual-paragraph\"><strong><em>基准评估</em></strong><span style=\"color:#0f1115\"><strong><em>内置 MMLU、C-Eval等基准数据集，提供自动化评测框架，对参评模型进行标准化能力评估。</em></strong></span></p>\n<ul class=\"manual-list\"><li><strong><em>人工评估</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>支持对文本生成、图像理解等任务进行专家评测。评估人员可从多个维度对模型回复进行主观评分，综合专业判断与实际经验，量化评估模型输出质量。</em></strong></span></p>\n<ul class=\"manual-list\"><li><strong><em>评估指标</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>评估指标功能，支持用户创建和管理自定义评估指标，可快速用于自动评估中的裁判员评估，实现指标的统一管理与调用。内置常用评估指标（如准确率、BLEU、ROUGE 等），作用于自动评估环节，量化模型基础能力表现。</em></strong></span></p>\n<h4 id=\"manual-section-12\" class=\"manual-heading manual-heading-4\">1.4.1.5. <span style=\"color:#262626\">模型服务</span></h4>\n<ul class=\"manual-list\"><li><strong><em>模型部署</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>支持将基础模型、训练完成的等模型部署为在线服务，可便捷用于评估、AI标注等场景。</em></strong></span></p>\n<ul class=\"manual-list\"><li><strong><em>在线推理服务</em></strong></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>支持接入第三方模型服务，可快速应用于推理结果集和模型评估等场景。</em></strong></span></p>\n<h3 id=\"manual-section-13\" class=\"manual-heading manual-heading-3\">1.4.2. <span style=\"color:#262626\">管理员模块</span></h3>\n<h4 id=\"manual-section-14\" class=\"manual-heading manual-heading-4\">1.4.2.1. <span style=\"color:#262626\">项目管理</span></h4>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>项目管理为AI研发提供全生命周期协作框架，支持以项目维度统筹数据、模型、任务与成员权限。通过项目管控实现跨团队协作透明化，保障模型研发过程可控、可追溯、可交付。</em></strong></span></p>\n<h4 id=\"manual-section-15\" class=\"manual-heading manual-heading-4\">1.4.2.2. <span style=\"color:#262626\">集群管理</span></h4>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>集群管理提供对训练资源的统一纳管与智能调度，支持显卡部署与弹性扩缩容。通过资源池划分、任务优先级调度与实时监控，最大化提升算力利用率，保障关键任务稳定运行，降低基础设施运维复杂度。</em></strong></span></p>\n<h4 id=\"manual-section-16\" class=\"manual-heading manual-heading-4\">1.4.2.3. <span style=\"color:#262626\">存储管理</span></h4>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>存储管理为训练全流程提供高效、可靠的数据存储支撑，支持火山引擎 TOS、MinIO 和 NFS等多种存储后端。</em></strong></span></p>\n<h4 id=\"manual-section-17\" class=\"manual-heading manual-heading-4\">1.4.2.4. <span style=\"color:#262626\">镜像管理</span></h4>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>镜像列表</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>提供项目中所有镜像的集中视图与统一管理功能。支持镜像的分类展示与快速检索，便于用户高效查看，加速项目部署与迭代流程。</em></strong></span></p>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>镜像仓库</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#0f1115\"><strong><em>提供企业级镜像的集中存储、分发与管理平台。支持镜像的安全存储，确保镜像资源的一致性、可用性与可追溯性，为持续集成与部署提供可靠基础。</em></strong></span></p>\n<h4 id=\"manual-section-18\" class=\"manual-heading manual-heading-4\">1.4.2.5. <span style=\"color:#262626\">基础模型管理</span></h4>\n<p class=\"manual-paragraph\"><strong><em>基础模型管理是企业二次训练模型的“能力中枢”，初始化提供基础模型清单，帮助用户快速选型并二次开发，降低大模型应用门槛，加速业务场景落地。</em></strong></p>\n<h4 id=\"manual-section-19\" class=\"manual-heading manual-heading-4\">1.4.2.6. <span style=\"color:#262626\">系统配置</span></h4>\n<ul class=\"manual-list\"><li><span style=\"color:#262626\"><strong><em>属性配置</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><strong><em>支持自定义数据管理（含训练/测试数据集）与在线推理服务的属性参数，适配不同业务场景需求。</em></strong></p>\n<h4 id=\"manual-section-20\" class=\"manual-heading manual-heading-4\">1.4.2.7. <span style=\"color:#262626\">平台管理员</span></h4>\n<p class=\"manual-paragraph\"><strong><em>租户管理员可配置平台管理员，平台管理员有权限查看与管理所有项目，为各项目分配项目管理员。</em></strong></p>\n<h2 id=\"manual-section-21\" class=\"manual-heading manual-heading-2\">1.5. 名词解释</h2>\n<h3 id=\"manual-section-22\" class=\"manual-heading manual-heading-3\">1.5.1. 微调类型（文本生成）</h3>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>训练类型</em></strong></td><td><strong><em>说明</em></strong></td></tr><tr><td><strong><em>全参微调</em></strong></td><td><strong><em>在每一轮迭代中同步更新预训练模型的全部参数，以追求理论上限的精度，但需占用大量显存与计算资源。</em></strong></td></tr><tr><td><strong><em>Lora微调</em></strong></td><td><strong><em>冻结原始权重，仅在自注意力模块旁插入低秩可训练矩阵 ，显著降低显存、通信与部署成本。</em></strong></td></tr></tbody></table></div>\n<h3 id=\"manual-section-23\" class=\"manual-heading manual-heading-3\">1.5.2. 微调参数</h3>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>参数类型</em></strong></td><td><strong><em>参数</em></strong></td><td><strong><em>说明</em></strong></td></tr><tr><td><strong><em>基础参数</em></strong></td><td><strong><em>学习率</em></strong></td><td><strong><em>学习率（Learning Rate），控制模型学习新知识的速度。过高会导致训练不稳定，过低会使训练速度过慢。</em></strong></td></tr><tr><td></td><td><strong><em>训练轮次</em></strong></td><td><strong><em>训练轮次（num_epochs），控制训练过程中遍历过数据集合的次数。建议设置在1-15之间，小数据集可用更少轮次以避免过拟合。</em></strong></td></tr><tr><td></td><td><strong><em>训练Batch</em></strong></td><td><strong><em>控制每个设备上进行训练时的批次大小，影响训练速度和内存占用。</em></strong></td></tr><tr><td></td><td><strong><em>梯度累积步数</em></strong></td><td><strong><em>控制梯度累积的步数，影响训练速度和内存占用。</em></strong></td></tr><tr><td></td><td><strong><em>预热比例</em></strong></td><td><strong><em>预热比例（Warmup Ratio），训练开始时学习率逐渐增加到设定值的过程占总训练步数的比例。</em></strong></td></tr><tr><td></td><td><strong><em>学习率调度器类型</em></strong></td><td></td></tr><tr><td></td><td><strong><em>是否使用bf16精度</em></strong></td><td><strong><em>是否使用bf16精度，使用bf16精度可以提高训练速度，但会略微降低训练精度。</em></strong></td></tr><tr><td><strong><em>高级配置</em></strong></td><td><strong><em>最大梯度范数</em></strong></td><td><strong><em>梯度裁剪有助于稳定训练过程，防止梯度爆炸问题。常用值为1.0。</em></strong></td></tr><tr><td></td><td><strong><em>RoPE缩放方法</em></strong></td><td><strong><em>RoPE缩放方法用于扩展模型的上下文窗口大小，YaRN是一种高效的上下文扩展技术。</em></strong></td></tr><tr><td></td><td><strong><em>随机种子</em></strong></td><td><strong><em>设置固定的随机种子可以确保训练过程的可重复性，便于实验比较和调试。</em></strong></td></tr><tr><td></td><td><strong><em>权重衰减</em></strong></td><td><strong><em>权重衰减是一种正则化技术，有助于防止模型过拟合。设置为0表示不使用权重衰减。</em></strong></td></tr><tr><td></td><td><strong><em>梯度检查点</em></strong></td><td><strong><em>通过梯度检查点技术减少训练过程中的内存占用，适用于显存受限的情况。</em></strong></td></tr><tr><td><strong><em>数据处理配置</em></strong></td><td><strong><em>预处理各种进程数</em></strong></td><td><strong><em>预处理各种进程数（Preprocessing Num Workers），控制预处理各种进程数。</em></strong></td></tr><tr><td></td><td><strong><em>最大token长度</em></strong></td><td><strong><em>训练样本的最大token长度限制（Cutoff Len），训练样本的最大token长度限制。</em></strong></td></tr><tr><td><strong><em>Lora配置</em></strong></td><td><strong><em>LoRA秩</em></strong></td><td><strong><em>LoRA秩（LoRA Rank），LoRA的秩决定了可训练参数的数量。秩越低，参数越少，训练速度越快，但可能影响模型的表达能力。建议选择8或16。</em></strong></td></tr><tr><td></td><td><strong><em>LoRA 目标模块</em></strong></td><td><strong><em>可以是 'all' 或具体的模块名称，LoRA的目标模块决定了可训练参数的数量。目标模块越少，参数越少，训练速度越快，但可能影响模型的表达能力。</em></strong></td></tr><tr><td></td><td><strong><em>LoRA alpha</em></strong></td><td><strong><em>LoRA alpha 参数，通常设置为 lora_rank 的2倍，影响模型的表达能力。</em></strong></td></tr><tr><td></td><td><strong><em>LoRA dropout 率</em></strong></td><td><strong><em>LoRA dropout 率，LoRA的dropout率决定了可训练参数的数量。dropout率越低，参数越少，训练速度越快，但可能影响模型的表达能力。</em></strong></td></tr><tr><td><strong><em>评估配置</em></strong></td><td><strong><em>评估策略</em></strong></td><td><strong><em>控制模型评估的频率和时机，按步数评估会在训练到指定步数时进行评估,评估策略与评估间隔步数保持一致。</em></strong></td></tr><tr><td></td><td><strong><em>评估间隔步数</em></strong></td><td><strong><em>当评估策略选择&quot;按步数评估&quot;时，每训练指定步数后进行一次模型评估,评估间隔步数与评估策略保持一致。</em></strong></td></tr><tr><td></td><td><strong><em>评估batch</em></strong></td><td><strong><em>控制每个设备上进行评估时的批次大小，影响评估速度和内存占用。</em></strong></td></tr><tr><td></td><td><strong><em>最佳模型指标</em></strong></td><td><strong><em>选择用于判断训练过程中最佳模型的评估指标，通常使用损失值。</em></strong></td></tr><tr><td></td><td><strong><em>指标越大越好</em></strong></td><td><strong><em>控制评估指标的优化方向，例如准确率越大越好，而损失值越小越好。</em></strong></td></tr><tr><td></td><td><strong><em>训练结束加载最佳模型</em></strong></td><td><strong><em>开启后，训练结束时会自动加载评估表现最佳的模型权重。</em></strong></td></tr><tr><td><strong><em>保存配置</em></strong></td><td><strong><em>模型保存策略</em></strong></td><td><strong><em>控制模型保存的频率和时机，按步数保存会在训练到指定步数时进行模型保存,保存策略与保存步数保持一致。</em></strong></td></tr><tr><td></td><td><strong><em>模型保存步数</em></strong></td><td><strong><em>当保存策略选择&quot;按步数保存&quot;时，每训练指定步数后进行一次模型保存,保存步数与保存策略保持一致。</em></strong></td></tr><tr><td></td><td><strong><em>模型保存总数限制</em></strong></td><td><strong><em>模型保存总数限制。</em></strong></td></tr><tr><td><strong><em>监控配置</em></strong></td><td><strong><em>日志</em></strong></td><td><strong><em>日志记录频率。</em></strong></td></tr></tbody></table></div>\n<h3 id=\"manual-section-24\" class=\"manual-heading manual-heading-3\">1.5.3. 数据清洗</h3>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>清洗能力</em></strong></td><td><strong><em>说明</em></strong></td></tr><tr><td><strong><em>数据格式清洗</em></strong></td><td><strong><em>空白字符清洗</em></strong></td><td><strong><em>移除多余的空行、行首/行尾空格、制表符，并将多种换行符统一为\\n</em></strong></td></tr><tr><td></td><td><strong><em>乱码清洗</em></strong></td><td><strong><em>清洗多种乱码，包括编码异常、键盘乱打、低质量重复文本等</em></strong></td></tr><tr><td></td><td><strong><em>HTML标签清洗</em></strong></td><td><strong><em>移除HTML标签，保留纯文本内容</em></strong></td></tr><tr><td></td><td><strong><em>多余换行符清洗</em></strong></td><td><strong><em>将连续多个换行符合并为单个换行符</em></strong></td></tr><tr><td><strong><em>LLM生成数据清洗</em></strong></td><td><strong><em>长度异常文本过滤器</em></strong></td><td><strong><em>移除长度小于指定间值或大于指定间值（按token数计算）的内容</em></strong></td></tr><tr><td></td><td><strong><em>重复生成内容移除器</em></strong></td><td><strong><em>检测并移除LLM重复生成的内容片段</em></strong></td></tr><tr><td></td><td><strong><em>截断句移除器</em></strong></td><td><strong><em>移除不完整的截断句子，保证文本完整性</em></strong></td></tr><tr><td></td><td><strong><em>语种过滤器</em></strong></td><td><strong><em>基于语言识别过滤非目标语种的内容，过滤掉不属于lang_filter_allowed_languages的语言</em></strong></td></tr><tr><td><strong><em>数据去重</em></strong></td><td><strong><em>精确匹配去重器</em></strong></td><td><strong><em>基于精确哈希值的文档去重，适用于完全相同内容的检测基于内容的哈希值（如MD5,SHA256）进行精确匹配，删除完全一样的数据项</em></strong></td></tr><tr><td></td><td><strong><em>MinHash去重器</em></strong></td><td><strong><em>利用MinHash和局部敏感哈希（LSH）技术，高效地找出Jaccard相似度高的文本对，适合在海量数据中进行近乎重复的文档检测。使用MinHash LSH在文档级别去重样本</em></strong></td></tr><tr><td></td><td><strong><em>SimHash去重器</em></strong></td><td><strong><em>将文本转换为一个紧凌的SimHash指纹（如64位），通过计算指纹间的汉明距离来判断文本相似度。为每个样本计算SimHash值，并根据指定的汉明距离阀值移除重复项。注：若执行失败，需要安装simhash-pybind库（uv pip install simhash-pybind)</em></strong></td></tr><tr><td><strong><em>敏感数据清洗</em></strong></td><td><strong><em>联系方式脱敏</em></strong></td><td><strong><em>基于正则表达式，识别并处理手机号、Email地址和座机号</em></strong></td></tr><tr><td></td><td><strong><em>身份与证件脱敏</em></strong></td><td><strong><em>基于正则表达式和校验规则，识别并处理身份证号、护照号等</em></strong></td></tr><tr><td></td><td><strong><em>网络与地址脱敏</em></strong></td><td><strong><em>识别并处理IP地址、URL链接、MAC地址及物理地址</em></strong></td></tr><tr><td></td><td><strong><em>金融与车辆脱敏</em></strong></td><td><strong><em>识别并处理银行卡号、信用卡号、车牌号、VIN码等</em></strong></td></tr><tr><td></td><td><strong><em>社交账号脱敏</em></strong></td><td><strong><em>识别并处理微信号、QQ号、微博账号等社交平台账号</em></strong></td></tr><tr><td></td><td><strong><em>自定义关键词脱敏</em></strong></td><td><strong><em>根据用户提供的关键词列表进行脱敏处理</em></strong></td></tr></tbody></table></div>\n<h3 id=\"manual-section-25\" class=\"manual-heading manual-heading-3\">1.5.4. 自动评估</h3>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>评估方法</em></strong></td><td><strong><em>说明</em></strong></td></tr><tr><td><strong><em>裁判员评估</em></strong></td><td><strong><em>使用裁判模型，根据设定的评分指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。</em></strong></td></tr><tr><td><strong><em>基础指标评估</em></strong></td><td><strong><em>根据准确率、F1等一系列预设的深度学习指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。</em></strong></td></tr></tbody></table></div>\n<h1 id=\"manual-section-26\" class=\"manual-heading manual-heading-1\">2. 操作指南</h1>\n<h2 id=\"manual-section-27\" class=\"manual-heading manual-heading-2\">2.1. 用户模块</h2>\n<h3 id=\"manual-section-28\" class=\"manual-heading manual-heading-3\">2.1.1. 账号登录</h3>\n<p class=\"manual-paragraph\"><strong><em>在浏览器输入链接访问系统，输入用户名密码，点击登录按钮，信息无误即可登录成功。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId5.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-29\" class=\"manual-heading manual-heading-3\">2.1.2. 首页</h3>\n<p class=\"manual-paragraph\"><strong><em>本页为您使用本平台提供快速指引，您可先阅读页面提供的简要介绍，快速了解平台功能，然后点击对应的功能，前往具体操作界面。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId6.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-30\" class=\"manual-heading manual-heading-3\">2.1.3. 数据服务-数据管理</h3>\n<h4 id=\"manual-section-31\" class=\"manual-heading manual-heading-4\">2.1.3.1. 训练数据管理</h4>\n<p class=\"manual-paragraph\"><strong><em>平台可统一纳管用于模型训练的数据集，并支持对数据集进行多版本迭代、增量导入和删除等操作。同步支持训练数据及和验证数据集单独管理，以满足模型开发人员多样的训练数据需求。</em></strong><strong><em>支持JSON, JSONL，CSV格式。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId7.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-32\" class=\"manual-heading manual-heading-5\">2.1.3.1.1. 创建数据集</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航栏【数据服务】→ 【数据管理】→ 【训练数据管理】→ 【创建数据集】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>在指定数据集名称、描述、数据用途、数据格式、数据来源等基本信息后，您可发起数据上传并点击提交，完成数据集创建。当前支持：</em></strong></p>\n<ul class=\"manual-list\"><li><strong><em>文本生成-监督学习SFT数据用途：Prompt-Response、Role-based数据格式</em></strong></li><li><strong><em>图像理解-监督学习SFT数据用途：Role-based数据格式</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId8.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-33\" class=\"manual-heading manual-heading-5\">2.1.3.1.2. 查看数据集详情</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：训练数据管理列表 → 目标数据集 → 【操作】列 → 【查看详情】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击数据集列表页-操作-查看详情，即可查看对应数据集的详情，如下图所示。支持新增版本、跳转训练页面、下载、删除。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId9.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-34\" class=\"manual-heading manual-heading-5\">2.1.3.1.3. 新增版本</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：数据集详情页 → 【新增版本】按钮</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击新增版本进入到数据版本新增页面，可选择是否继续历史版本。若开启，则可选择所需继承的版本；若关闭，可单独本地上传数据文件。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId10.png\" alt=\"\" style=\"width:613px\" /><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId11.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-35\" class=\"manual-heading manual-heading-4\">2.1.3.2. 测试数据管理</h4>\n<p class=\"manual-paragraph\"><strong><em>平台可统一纳管用于模型评估的测试数据集，并支持对数据集进行多版本迭代、增量导入和删除等操作，</em></strong><strong><em>支持JSON, JSONL，CSV格式。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId12.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-36\" class=\"manual-heading manual-heading-5\">2.1.3.2.1. 创建数据集</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【数据服务】→ 【数据管理】→【测试数据管理】→ 【创建数据集】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>在指定数据集名称、描述、数据用途、数据格式、数据来源等基本信息后，您可发起数据上传并点击提交，完成数据集创建。</em></strong><strong><em>当前支持：</em></strong></p>\n<ul class=\"manual-list\"><li><strong><em>文本生成-监督学习SFT数据用途：Prompt-Response、Role-based数据格式</em></strong></li><li><strong><em>图像理解-监督学习SFT数据用途：Role-based数据格式7</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId13.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-37\" class=\"manual-heading manual-heading-5\">2.1.3.2.2. 查看数据集详情</h5>\n<p class=\"manual-paragraph\"><strong><em>点击数据集列表页-操作-查看详情，即可查看对应数据集的详情，如下图所示。支持新增版本、跳转训练页面、下载、删除。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId14.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-38\" class=\"manual-heading manual-heading-5\">2.1.3.2.3. 新增版本</h5>\n<p class=\"manual-paragraph\"><strong><em>点击新增版本进入到数据版本新增页面，可选择是否继续历史版本。若开启，则可选择所需继承的版本；若关闭，可单独本地上传数据文件。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId15.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-39\" class=\"manual-heading manual-heading-4\">2.1.3.3. 推理结果集</h4>\n<p class=\"manual-paragraph\"><strong><em>集中存储与检索模型推理结果的数据集，支持离线推理、在线推理和文件导入的推理方式，可快速用于模型效果评估。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId16.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-40\" class=\"manual-heading manual-heading-5\">2.1.3.3.1. 创建数据集</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【数据服务】→ 【推理结果集】→ 【创建推理结果数据集】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>填完数据集名称、描述、数据用途、推理方式、待推理数据、显卡类型及型号、显卡数量等基本信息后，点击确定即可完成数据集创建。推理方式支持离线推理、在线推理、导入推理结果集三种方式。待推理数据支持选择训练、验证和测试数据集。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId17.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-41\" class=\"manual-heading manual-heading-5\">2.1.3.3.2. 查看数据集详情</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：推理结果集列表 → 【操作】→ 【查看】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击数据集列表页-操作-查看，即可查看对应推理结果集的详情，如下图所示。支持下载、删除、去评估，以及任务日志查询。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId18.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-42\" class=\"manual-heading manual-heading-3\">2.1.4. 数据服务-数据处理</h3>\n<h4 id=\"manual-section-43\" class=\"manual-heading manual-heading-4\">2.1.4.1. 数据清洗</h4>\n<p class=\"manual-paragraph\"><strong><em>提供自动化的数据质量提升服务，支持缺失值处理、异常值检测、重复数据去除等清洗算子，确保数据一致性和准确性。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId19.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-44\" class=\"manual-heading manual-heading-5\">2.1.4.1.1. 创建清洗任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【数据服务】→ 【数据处理】→ 【数据清洗】→ 【创建清洗任务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击列表页“创建清洗任务”按钮，进入创建页，选择需要清洗的数据集版本，系统默认清洗后数据集增加最新版本。可进行定时配置。清洗能力和顺序可自由调整，系统带有清洗模板，可直接使用，亦可将当前配置的清洗流程保存为模板，以便下次使用。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId20.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-45\" class=\"manual-heading manual-heading-5\">2.1.4.1.2. 清洗任务查看</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：数据清洗列表 → 目标清洗任务 → 【详情】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>列表页操作点击“详情”，进入清洗任务详情，可查看清洗详情，包括基本信息、清洗结果的预览，以及清洗日志。清洗后的数据集以及清洗日志均可下载进行详细查看。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId21.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-46\" class=\"manual-heading manual-heading-4\">2.1.4.2. 数据标注</h4>\n<p class=\"manual-paragraph\"><strong><em>提供在线标注能力，支持文本生成和图像理解类型，支持选择训练、验证、测试数据集，帮助提高数据标注效率。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId22.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-47\" class=\"manual-heading manual-heading-5\">2.1.4.2.1. 创建在线标注任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【数据服务】→ 【数据处理】→ 【数据标注】→ 【创建标注任务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>列表页点击“创建标注任务”按钮，即可新建标注任务。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId23.png\" alt=\"\" style=\"width:258px\" /></p>\n<h5 id=\"manual-section-48\" class=\"manual-heading manual-heading-5\">2.1.4.2.2. 标注任务详情</h5>\n<p class=\"manual-paragraph\"><strong><em>列表页操作点击“详情”按钮，进入标注详情页进行标注工作。支持针对Ground Truth进行补充或修改，完成后点击操作的“完成标注”按钮，当条数据即可保存并自动进入下一条标注数据。所有数据均标注完成后，即可点击提交标注。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId24.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-49\" class=\"manual-heading manual-heading-5\">2.1.4.2.3. AI自动标注</h5>\n<p class=\"manual-paragraph\"><strong><em>激活步骤</em></strong><strong><em>：</em></strong></p>\n<ul class=\"manual-list\"><li><strong><em>在标注详情页点击右上角【标注配置】</em></strong></li><li><strong><em>选择</em></strong><strong><em>服务</em></strong><strong><em>：如</em></strong><strong><em>Qwen3-Next-80B-A3B-Instruct</em></strong></li><li><strong><em>设置</em></strong><strong><em>推理参数</em></strong><strong><em>：</em></strong></li><li><strong><em>Max_tokens: 2048（最大生成长度）</em></strong></li><li><strong><em>Temperature: 0.7（控制随机性）</em></strong></li><li><strong><em>Top_p: 1.0（核采样）</em></strong></li><li><strong><em>presence_penalty: 1.0（存在性惩罚）</em></strong></li><li><strong><em>点击【确定】</em></strong></li><li><strong><em>点击【AI自动标注】按钮</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId25.png\" alt=\"\" style=\"width:324px\" /></p>\n<h3 id=\"manual-section-50\" class=\"manual-heading manual-heading-3\">2.1.5. 模型训练</h3>\n<h4 id=\"manual-section-51\" class=\"manual-heading manual-heading-4\">2.1.5.1. 在线Notebook</h4>\n<p class=\"manual-paragraph\"><strong><em>在线 Notebook 是为算法工程师量身打造的云端交互式开发环境，预置主流镜像环境，支持即开即用、资源配置、运行时长控制等操作。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId26.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-52\" class=\"manual-heading manual-heading-5\">2.1.5.1.1. 创建Notebook</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型训练】→ 【在线Notebook】→ 【创建Notebook】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>完成基本信息、资源配置、镜像选择，即可快速创建Notebook。显卡配置支持GPU和NPU类型，显卡数量最多可选择8张。支持最长运行时长配置，实现算力合理分配。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId27.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-53\" class=\"manual-heading manual-heading-5\">2.1.5.1.2. Notebook任务启动</h5>\n<p class=\"manual-paragraph\"><strong><em>点击启动按钮，提示“Notebook启动成功”，该Notebook任务进入准备中状态，准备完成后进入运行中状态，可进行后续研发工作。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId28.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId29.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-54\" class=\"manual-heading manual-heading-5\">2.1.5.1.3. 运行Notebook</h5>\n<p class=\"manual-paragraph\"><strong><em>点击对应Notebook任务“打开”按钮，进入云端交互式开发界面，继续后续研发工作。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId30.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId31.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-55\" class=\"manual-heading manual-heading-5\">2.1.5.1.4. 自定义镜像</h5>\n<p class=\"manual-paragraph\"><strong><em>针对每个Notebook任务，可手动或停止前保存环境成自定义镜像，后续重新启动或新任务可选择当前环境。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId32.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-56\" class=\"manual-heading manual-heading-4\">2.1.5.2. 大模型训练</h4>\n<p class=\"manual-paragraph\"><strong><em>在训练数据准备好后，模型开发者可以选择适合自己任务场景的训练模式并加以调参训练，从而实现理想的模型效果。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId33.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-57\" class=\"manual-heading manual-heading-5\">2.1.5.2.1. 创建训练任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型训练】→ 【大模型训练】→ 【创建训练任务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.5.2.1.1. </em></strong><strong><em>基本信息：补充任务名称和任务描述</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId34.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.5.2.1.2. </em></strong><strong><em>模型配置：选择训练类型及基础模型版本，当前支持文本生成类型</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId35.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.5.2.1.3. </em></strong><strong><em>训练配置：选择训练方法、微调类型及对应的参数。训练方法支持SFT，微调类型支持全参微调、Lora微调。每种类型的微调，可设置学习率、训练轮次等参数。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId36.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>（全参微调）</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId37.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>（Lora微调）</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.5.2.1.4. </em></strong><strong><em>数据配置：训练任务的选择数据及相关配置。验证数据集可以从训练数据集拆分或使用独立的验证数据集。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId38.png\" alt=\"\" style=\"width:613px\" /></p>\n<ul class=\"manual-list\"><li><strong><em>显卡资源配置：选择选择所用的的显卡数据，最大支持8张显卡。</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId39.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-58\" class=\"manual-heading manual-heading-5\">2.1.5.2.2. 新增训练任务版本</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：训练任务详情页 → 【新增版本】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId40.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-59\" class=\"manual-heading manual-heading-5\">2.1.5.2.3. 训练任务详情页：可查看训练基本信息、相关数据集、参数、指标、训练日志和训练产物。</h5>\n<p class=\"manual-paragraph\"><strong><em>状态查看路径</em></strong><strong><em>：大模型训练 → 任务列表 → 【详情】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId41.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-60\" class=\"manual-heading manual-heading-4\">2.1.5.3. 模型管理</h4>\n<p class=\"manual-paragraph\"><strong><em>用户可以进行统一管理已训练好的模型，以便于后续模型部署工作。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId42.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-61\" class=\"manual-heading manual-heading-5\">2.1.5.3.1. 创建模型：选择模型类型（支持文本生成）、训练方式（支持SFT）、训练任务、Checkpoint。</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型训练】→ 【模型管理】→ 【创建模型】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId43.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-62\" class=\"manual-heading manual-heading-5\">2.1.5.3.2. 新增模型版本</h5>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId44.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-63\" class=\"manual-heading manual-heading-3\">2.1.6. 模型评估</h3>\n<h4 id=\"manual-section-64\" class=\"manual-heading manual-heading-4\">2.1.6.1. 效果评估-自动评估</h4>\n<p class=\"manual-paragraph\"><strong><em>提供端到端的评估流程自动化，支持裁判员和基础指标评估方式，满足不同业务模型评估任务。任务可进行多个模型对比，支持任务终止和重新评估。支持克隆和删除。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId45.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-65\" class=\"manual-heading manual-heading-5\">2.1.6.1.1. 创建评估任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型评估】→ 【效果评估】→ 【自动评估】→ 【创建评估任务】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId46.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.1.1. </em></strong><strong><em>评估类型</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持单个评估或对比评估，若选择对比评估，可针对多个模型/服务进行评估。为确保评估的有效性，请确保选择的推理结果集来自同一份原始数据集。</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.1.2. </em></strong><strong><em>评估方法</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持裁判员和基础指标两种评估方法，可多选。若选择裁判员评估，需要选择裁判模型/服务，并设置相关的推理参数以及评估指标。</em></strong></p>\n<ul class=\"manual-list\"><li><strong><em>裁判员评估：使用裁判模型，根据设定的评分指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现；</em></strong></li><li><strong><em>基础指标评估：根据准确率、F1等一系列预设的深度学习指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。</em></strong></li></ul>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.1.3. </em></strong><strong><em>评估指标</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击“增加指标”即可从评估指标列表中筛选所需指标用于评估任务。选择指标后，需要针对相关的指标字段设置映射的数据集字段，确保评估字段一一对应以及评估效果。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId47.png\" alt=\"\" style=\"width:286px\" /></p>\n<h5 id=\"manual-section-66\" class=\"manual-heading manual-heading-5\">2.1.6.1.2. 评估任务详情</h5>\n<p class=\"manual-paragraph\"><strong><em>查看路径</em></strong><strong><em>：自动评估列表 → 【操作】→ 【查看评估报告】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.2.1. </em></strong><strong><em>评估报告</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>点击操作中的“查看评估报告”即可进入任务详情页查看报告结果。报告分为基本信息、报告结果两个模块，基本信息可快速定位任务相关联的内容。报告结果展示对应指标的雷达图与柱状图，为更好展示对比效果，得分以百分比形式展示，具体计算方式：得分/最大值。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId48.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.2.2. </em></strong><strong><em>评估详情</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>评估任务详情页点击“评估详情”，可查看具体评估数据结果，包括模型回答及响应的指标得分。数据结果支持下载。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId49.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>2.1.6.1.2.3. </em></strong><strong><em>任务日志</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>评估任务详情页点击“任务日志”，可查看具体评估日志，进行过程溯源与问题定位。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId50.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-67\" class=\"manual-heading manual-heading-4\">2.1.6.2. 效果评估-基准评估</h4>\n<p class=\"manual-paragraph\"><strong><em>内置 MMLU、C-Eval等基准数据集，提供自动化评测框架，对参评模型进行标准化能力评估。列表页针对评估的模型形成榜单，可便捷了解模型能力差异。</em></strong><strong><em>基准评估任务支持对比评估，可同时对多个模型/服务进行评估。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId51.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-68\" class=\"manual-heading manual-heading-5\">2.1.6.2.1. 创建评估任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【效果评估】→ 【基准评估】→ 【创建基准评估任务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>内置MMLU、C-Eval等一系列基准评估数据集，可选择模型或服务进行评估。</em></strong><strong><em>支持配置任务名称、描述、定时评估、待评估模型/服务、推理模型参数配置、显卡资源配置以及基准评估数据集。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId52.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-69\" class=\"manual-heading manual-heading-5\">2.1.6.2.2. 基准评估详情</h5>\n<p class=\"manual-paragraph\"><strong><em>评估报告：包含基本信息、评估结果（评分维度雷达图、数据明细、对比柱状图），支持</em></strong><strong><em>Word格式下载。</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>任务日志：可查看评估过程中的详细日志，进行过程溯源与问题定位。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId53.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-70\" class=\"manual-heading manual-heading-4\">2.1.6.3. 效果评估-人工评估</h4>\n<p class=\"manual-paragraph\"><strong><em>支持对文本生成、图像理解等任务进行专家评测。评估人员可从多个维度对模型回复进行主观评分，综合专业判断与实际经验，量化评估模型输出质量。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId54.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-71\" class=\"manual-heading manual-heading-5\">2.1.6.3.1. 创建人工评估任务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径：首页</em></strong><strong><em>→ 左侧导航【模型评估】→ 【效果评估】→ 【人工评估】→ 【创建评估任务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持配置任务名称、描述、评估类型（单个评估、对比评估）、评估类别（文本生成、图像理解）、评估数据来源（已有推理结果集、新建推理结果集）、数据采样率及评估指标。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId55.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-72\" class=\"manual-heading manual-heading-5\">2.1.6.3.2. 人工评估详情</h5>\n<p class=\"manual-paragraph\"><strong><em>评估报告：包含基本信息、评估结果（评分维度雷达图、数据明细、对比柱状图），支持下载。</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>评估详情：支持多格式下载（JSONL、JSON、CSV），便于进一步分析。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId56.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-73\" class=\"manual-heading manual-heading-4\">2.1.6.4. 评估指标</h4>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型评估】→ 【评估指标】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持用户创建和管理自定义评估指标，可快速用于自动评估中的裁判员评估和人工评估，实现指标的统一管理与调用。用户可基于Prompt模版设置评估指标，进行快速预览。平台内置常用评估指标（如准确率、BLEU、ROUGE等），作用于自动评估环节，量化模型基础能力表现。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId57.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-74\" class=\"manual-heading manual-heading-5\">2.1.6.4.1. 创建评估指标</h5>\n<p class=\"manual-paragraph\"><strong><em>点击评估指标列表页右上角“新建指标”按钮，进入指标创建页。右侧可进行指标名称、指标说明、指标评分量级（最高为10）、评分区间填写及指标关键字段选择，填写完毕后点击“模板预览”，即可看到提示词效果。系统已内置</em></strong><strong><em>答案相关性、忠实度、上下文精确度、上下文召回率、上下文相关性5个用于知识库检索评估指标，用户可根据实际需求选择或新增。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId58.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-75\" class=\"manual-heading manual-heading-3\">2.1.7. 模型服务</h3>\n<h4 id=\"manual-section-76\" class=\"manual-heading manual-heading-4\">2.1.7.1. 模型部署</h4>\n<h5 id=\"manual-section-77\" class=\"manual-heading manual-heading-5\">2.1.7.1.1. 部署模型服务</h5>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型服务】→ 【部署部署】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId59.png\" alt=\"\" style=\"width:613px\" /></p>\n<ul class=\"manual-list\"><li><strong><em>服务名称：服务名称用于外部请求时，使用该名称访问模型。</em></strong></li><li><strong><em>模型来源，单选,如果选择训练生成，从模型管理模块获取训练生产的模型，</em></strong><span style=\"color:#333333\"><strong><em>如果选择基础模型，从基础模型中获取模型。</em></strong></span></li><li><span style=\"color:#333333\"><strong><em>显卡类型及型号。显卡数可选范围为1-8张。</em></strong></span></li><li><span style=\"color:#333333\"><strong><em>部署实例数：</em></strong></span><span style=\"color:#df2a3f\"><strong><em>大于等于1</em></strong></span><span style=\"color:#333333\"><strong><em>。</em></strong></span></li><li><span style=\"color:#333333\"><strong><em>推理镜像类型</em></strong></span><span style=\"color:#333333\"><strong><em>：单选，筛选出该模型可用的推理框架镜像</em></strong></span></li><li><span style=\"color:#333333\"><strong><em>运行命令会根据所选的模型和推理框架自动生成。</em></strong></span></li><li><span style=\"color:#333333\"><strong><em>支持配置推理参数和环境变量。</em></strong></span></li></ul>\n<p class=\"manual-paragraph\"><span style=\"color:#df2a3f\"><strong><em>点击开始部署 则部署服务</em></strong></span></p>\n<h5 id=\"manual-section-78\" class=\"manual-heading manual-heading-5\">2.1.7.1.2. 服务详情</h5>\n<p class=\"manual-paragraph\"><strong><em>基本信息</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId60.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>在部署信息中，</em></strong></p>\n<ul class=\"manual-list\"><li><span style=\"color:#df2a3f\"><strong><em>服务名称不可修改，其他参数可以修改，并支持重新部署。</em></strong></span></li><li><span style=\"color:#df2a3f\"><strong><em>重新服务，不修改模型访问信息（模型地址 端口号 服务名称）</em></strong></span></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId61.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>点击重新部署</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId62.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>在实例管理中，支持实例的扩缩容和实例日志查看</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId63.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-79\" class=\"manual-heading manual-heading-5\">2.1.7.1.3. 服务运维</h5>\n<p class=\"manual-paragraph\"><strong><em>服务停止，服务停止后请求会中断。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId64.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>服务启动</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId65.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>服务删除 </em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>当不再使用该服务时，允许删除</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId66.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-paragraph\"><strong><em>访问信息</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>显示服务名称与地址，允许复制，请求时通过地址与名称对模型请求。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId67.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-80\" class=\"manual-heading manual-heading-4\">2.1.7.2. 在线推理服务</h4>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【模型服务】→ 【在线推理服务】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持接入第三方模型服务，可快速应用于推理结果集和模型评估等场景。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId68.png\" alt=\"\" style=\"width:613px\" /></p>\n<h5 id=\"manual-section-81\" class=\"manual-heading manual-heading-5\">2.1.7.2.1. 创建模型服务</h5>\n<p class=\"manual-paragraph\"><strong><em>点击在线推理服务列表页右上角“新建服务”按钮，进入模型服务创建页。补充基本信息、API Key、Base URL、模型名称以及模型类型即可创建。创建成功后，点击列表页-操作-连接测试，若显示测试通过，即可正常使用。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId69.png\" alt=\"\" style=\"width:613px\" /></p>\n<h2 id=\"manual-section-82\" class=\"manual-heading manual-heading-2\">2.2. 管理员模块</h2>\n<h3 id=\"manual-section-83\" class=\"manual-heading manual-heading-3\">2.2.1. 项目管理</h3>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：首页 → 左侧导航【管理员模块】→ 【项目管理】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>管理员可通过项目管理模块，增加、删除项目，以及编排项目成员。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId70.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-84\" class=\"manual-heading manual-heading-4\">2.2.1.1. 新增项目</h4>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId71.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-85\" class=\"manual-heading manual-heading-4\">2.2.1.2. 成员管理：管理每个项目涉及的人员，点击【添加成员】可为项目新增成员。</h4>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：项目管理 → 目标项目 → 【操作】→ 【成员管理】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId72.png\" alt=\"\" style=\"width:613px\" /></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId73.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-86\" class=\"manual-heading manual-heading-3\">2.2.2. 集群管理</h3>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：左侧导航【管理员模块】→ 【集群管理】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>管理员可统一管理Kubernetes集群，支持Kubernetes多形式导入。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId74.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-87\" class=\"manual-heading manual-heading-4\">2.2.2.1. 导入集群：支持文本或文件导入形式。导入完成后，进行按顺序连接测试、存储配置绑定、仓库配置绑定，即可完成集群导入工作。</h4>\n<ul class=\"manual-list\"><li><strong><em>导入文件从K8S集群中config文件获取，一般获取路径为K8S masater节点中/root/.kube/config，具体文件路径跟K8s安装有关。</em></strong></li></ul>\n<h4 id=\"manual-section-88\" class=\"manual-heading manual-heading-4\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId75.png\" alt=\"\" style=\"width:508px\" /></h4>\n<ul class=\"manual-list\"><li><strong><em>连接测试：测试对应集群是否连通。</em></strong></li><li><strong><em>存储配置绑定：选择存储进行绑定。</em></strong></li><li><strong><em>仓库配置绑定：选择镜像仓库进行绑定。</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId76.png\" alt=\"\" style=\"width:613px\" /></p>\n<h3 id=\"manual-section-89\" class=\"manual-heading manual-heading-3\">2.2.3. 存储管理</h3>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：左侧导航【管理员模块】→ 【存储管理】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>支持火山引擎TOS、MiniO、NFS等类型，当前最多创建一个存储配置。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId77.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-90\" class=\"manual-heading manual-heading-4\">2.2.3.1. 存储配置说明</h4>\n<ul class=\"manual-list\"><li><strong><em>下拉选择对应存储类型 会显示对应的存储类型所需要的基础配置信息</em></strong></li></ul>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId78.png\" alt=\"\" style=\"width:571px\" /></p>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>配置项</em></strong></td><td><strong><em>配置描述</em></strong></td></tr><tr><td><strong><em>配置名称</em></strong></td><td><strong><em>自定义即可</em></strong></td></tr><tr><td><strong><em>存储类型</em></strong></td><td><strong><em>支持火山TOS，MinIO协议，NFS，华为OBS</em></strong></td></tr><tr><td><strong><em>描述信息</em></strong></td><td><strong><em>自定义即可</em></strong></td></tr><tr><td><strong><em>终端节点</em></strong></td><td><strong><em>火山TOS，MinIO需要填写</em></strong></td></tr><tr><td><strong><em>地区</em></strong></td><td><strong><em>火山TOS，华为OBS需要填写</em></strong></td></tr><tr><td><strong><em>存储桶名称</em></strong></td><td><strong><em>对应类型所创建的桶名称，需要在存储类型上先创建对应桶</em></strong></td></tr><tr><td><strong><em>访问密钥AK</em></strong></td><td><strong><em>在对应存储类型管理端获取</em></strong></td></tr><tr><td><strong><em>密钥SK</em></strong></td><td><strong><em>在对应存储类型管理端获取</em></strong></td></tr></tbody></table></div>\n<h3 id=\"manual-section-91\" class=\"manual-heading manual-heading-3\">2.2.4. 镜像管理</h3>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：左侧导航【管理员模块】→ 【镜像管理】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>管理和配置镜像仓库与相应镜像。</em></strong></p>\n<h4 id=\"manual-section-92\" class=\"manual-heading manual-heading-4\">2.2.4.1. 镜像列表</h4>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId79.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-93\" class=\"manual-heading manual-heading-4\">2.2.4.2. 镜像仓库：当前最多支持创建一个镜像仓库，支持火山云和私有化Harbor</h4>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId80.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-94\" class=\"manual-heading manual-heading-4\">2.2.4.3. 仓库镜像配置</h4>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：镜像管理 → 镜像仓库配置 → 【新建】</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId81.png\" alt=\"\" style=\"width:613px\" /></p>\n<div class=\"manual-table-wrap\"><table class=\"manual-table\"><tbody><tr><td><strong><em>配置类型</em></strong></td><td><strong><em>火山云</em></strong></td><td><strong><em>Harbor</em></strong></td></tr><tr><td><strong><em>仓库名称</em></strong></td><td><strong><em>自定义即可</em></strong></td><td><strong><em>自定义即可</em></strong></td></tr><tr><td><strong><em>仓库类型</em></strong></td><td><strong><em>火山云</em></strong></td><td><strong><em>Harbor</em></strong></td></tr><tr><td><strong><em>仓库地址</em></strong></td><td><strong><em>需要网络能访问火山云仓库地址</em></strong></td><td><strong><em>harbor仓库地址</em></strong></td></tr><tr><td><strong><em>命名空间</em></strong></td><td><strong><em>命名空间</em></strong></td><td><strong><em>harbor中项目的概念</em></strong></td></tr><tr><td><strong><em>认证方式</em></strong></td><td><strong><em>分为 1.无需认证 2.用户名密码 3.访问令牌</em></strong><br /><strong><em>登录火山云所用用户和密码</em></strong></td><td><strong><em>分为 1.无需认证 2.用户名密码 3.访问令牌</em></strong><br /><strong><em>访问Harbor镜像仓库访问方式选择即可，并且输入对应认证信息</em></strong></td></tr><tr><td><strong><em>管理地址</em></strong></td><td><strong><em>仓库web前端地址（通常和仓库地址一致）</em></strong></td><td><strong><em>仓库web前端地址（通常和仓库地址一致）</em></strong></td></tr><tr><td><strong><em>访问密钥AK</em></strong></td><td><strong><em>访问火山云镜像仓库AK </em></strong></td><td><strong><em>访问Harbor镜像仓库用户名</em></strong></td></tr><tr><td><strong><em>密钥SK</em></strong></td><td><strong><em>访问火山云镜像仓库SK </em></strong></td><td><strong><em>访问Harbor镜像仓库密码</em></strong></td></tr><tr><td><strong><em>地区</em></strong></td><td><strong><em>镜像仓库所在地区 根据火山云申请镜像仓库地址填写</em></strong></td><td><strong><em>无</em></strong></td></tr><tr><td><strong><em>实例名称</em></strong></td><td><strong><em>火山云镜像仓库实例名称 </em></strong></td><td><strong><em>无</em></strong></td></tr></tbody></table></div>\n<h3 id=\"manual-section-95\" class=\"manual-heading manual-heading-3\">2.2.5. 基础模型管理</h3>\n<p class=\"manual-paragraph\"><strong><em>操作路径</em></strong><strong><em>：左侧导航【管理员模块】→ 【基础模型管理】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>训练基础模型统一接入与管理。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId82.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-96\" class=\"manual-heading manual-heading-4\">2.2.5.1. 新增模型</h4>\n<p class=\"manual-paragraph\"><strong><em>支持本地和ModelScope两种方式。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId83.png\" alt=\"\" style=\"width:428px\" /></p>\n<h4 id=\"manual-section-97\" class=\"manual-heading manual-heading-4\">2.2.5.2. 本地上传模型</h4>\n<p class=\"manual-paragraph\"><strong><em>1.安装juicefs工具</em></strong></p>\n<pre class=\"manual-code\"><code>wget -O juicefs-1.3.0-linux-amd64.tar.gz &quot;https://example.com/path/to/juicefs-1.3.0-linux-amd64.tar.gz&quot;\ntar -zxf &quot;juicefs-1.3.0-linux-amd64.tar.gz&quot;\nsudo install juicefs /usr/local/bin</code></pre>\n<p class=\"manual-paragraph\"><strong><em>2.获取存储初始化后metaurl 使用metaurl 地址挂载juicefs ：如下将juicefs存储挂载到Linux机器的/mnt/jfs目录上</em></strong></p>\n<pre class=\"manual-code\"><code>juicefs mount postgres://&lt;user&gt;:&lt;password&gt;@&lt;host&gt;:&lt;port&gt;/juicefs /mnt/jfs -d</code></pre>\n<p class=\"manual-paragraph\"><strong><em>3.确保服务器已安装git lfs已经安装</em></strong></p>\n<pre class=\"manual-code\"><code>git lfs install</code></pre>\n<p class=\"manual-paragraph\"><strong><em>4.创建qwen系列目录并下载权重文件</em></strong></p>\n<pre class=\"manual-code\"><code>mkdir /mnt/jfs/public/models/Qwen \ncd /mnt/jfs/public/models/Qwen &amp;&amp; git clone https://www.modelscope.cn/Qwen/Qwen2.5-0.5B-Instruct.git</code></pre>\n<h3 id=\"manual-section-98\" class=\"manual-heading manual-heading-3\">2.2.6. 系统配置</h3>\n<p class=\"manual-paragraph\"><strong><em>支持自定义数据管理（含训练/测试数据集）与在线推理服务的属性参数，适配不同业务场景需求。</em></strong></p>\n<h4 id=\"manual-section-99\" class=\"manual-heading manual-heading-4\">2.2.6.1. 属性列表</h4>\n<p class=\"manual-paragraph\"><strong><em>系统支持配置以下模块的属性：数据管理：训练数据管理、测试数据管理；在线推理服务。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId84.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-100\" class=\"manual-heading manual-heading-4\">2.2.6.2. 新增属性</h4>\n<p class=\"manual-paragraph\"><strong><em>数据管理属性配置：属性名称（设置属性的名称）、属性描述（描述该属性的用途）、输入方式（支持下拉选择）、选择模式（支持单选、多选）、属性值（设置可选的属性值列表）、是否必填（设置该属性是否为必填项）</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>在线推理服务属性配置：属性名称（设置属性的名称）、属性描述（描述该属性的用途）、输入方式（支持下拉选择、手动输入）、是否必填（设置该属性是否为必填项）</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId85.png\" alt=\"\" style=\"width:279px\" /></p>\n<h3 id=\"manual-section-101\" class=\"manual-heading manual-heading-3\">2.2.7. 平台管理员</h3>\n<p class=\"manual-paragraph\"><strong><em>租户管理员可配置平台管理员，平台管理员有权限查看与管理所有项目，为各项目分配项目管理员。</em></strong></p>\n<h4 id=\"manual-section-102\" class=\"manual-heading manual-heading-4\">2.2.7.1. 新增属性</h4>\n<p class=\"manual-paragraph\"><strong><em>操作路径：首页→ 左侧导航→ 【平台管理员】</em></strong></p>\n<p class=\"manual-paragraph\"><strong><em>展示所有平台管理员用户信息。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId86.png\" alt=\"\" style=\"width:613px\" /></p>\n<h4 id=\"manual-section-103\" class=\"manual-heading manual-heading-4\">2.2.7.2. 添加平台管理员</h4>\n<p class=\"manual-paragraph\"><strong><em>点击【添加平台管理员】按钮，选择已有用户或新增用户为平台管理员。平台管理员拥有以下权限：、查看所有项目、管理所有项目成员、为各项目分配项目管理员、管理系统基础配置。</em></strong></p>\n<p class=\"manual-image-paragraph\"><img class=\"manual-image\" src=\"/docs/deepexilab-manual-v1.2/document_image_rId87.png\" alt=\"\" style=\"width:427px\" /></p>",
  "headings": [
    {
      "id": "manual-section-1",
      "title": "DeepexiLab产品使用手册-V1.2",
      "level": 1
    },
    {
      "id": "manual-section-2",
      "title": "1. 产品概述",
      "level": 1
    },
    {
      "id": "manual-section-3",
      "title": "1.1. 产品介绍",
      "level": 2
    },
    {
      "id": "manual-section-4",
      "title": "1.2. 核心优势：",
      "level": 2
    },
    {
      "id": "manual-section-5",
      "title": "1.3. 快速开始（完成第一个模型微调）",
      "level": 2
    },
    {
      "id": "manual-section-6",
      "title": "1.4. 功能介绍",
      "level": 2
    },
    {
      "id": "manual-section-7",
      "title": "1.4.1. 用户模块",
      "level": 3
    },
    {
      "id": "manual-section-8",
      "title": "1.4.1.1. 数据管理",
      "level": 4
    },
    {
      "id": "manual-section-9",
      "title": "1.4.1.2. 数据处理",
      "level": 4
    },
    {
      "id": "manual-section-10",
      "title": "1.4.1.3. 模型训练",
      "level": 4
    },
    {
      "id": "manual-section-11",
      "title": "1.4.1.4. 模型评估",
      "level": 4
    },
    {
      "id": "manual-section-12",
      "title": "1.4.1.5. 模型服务",
      "level": 4
    },
    {
      "id": "manual-section-13",
      "title": "1.4.2. 管理员模块",
      "level": 3
    },
    {
      "id": "manual-section-14",
      "title": "1.4.2.1. 项目管理",
      "level": 4
    },
    {
      "id": "manual-section-15",
      "title": "1.4.2.2. 集群管理",
      "level": 4
    },
    {
      "id": "manual-section-16",
      "title": "1.4.2.3. 存储管理",
      "level": 4
    },
    {
      "id": "manual-section-17",
      "title": "1.4.2.4. 镜像管理",
      "level": 4
    },
    {
      "id": "manual-section-18",
      "title": "1.4.2.5. 基础模型管理",
      "level": 4
    },
    {
      "id": "manual-section-19",
      "title": "1.4.2.6. 系统配置",
      "level": 4
    },
    {
      "id": "manual-section-20",
      "title": "1.4.2.7. 平台管理员",
      "level": 4
    },
    {
      "id": "manual-section-21",
      "title": "1.5. 名词解释",
      "level": 2
    },
    {
      "id": "manual-section-22",
      "title": "1.5.1. 微调类型（文本生成）",
      "level": 3
    },
    {
      "id": "manual-section-23",
      "title": "1.5.2. 微调参数",
      "level": 3
    },
    {
      "id": "manual-section-24",
      "title": "1.5.3. 数据清洗",
      "level": 3
    },
    {
      "id": "manual-section-25",
      "title": "1.5.4. 自动评估",
      "level": 3
    },
    {
      "id": "manual-section-26",
      "title": "2. 操作指南",
      "level": 1
    },
    {
      "id": "manual-section-27",
      "title": "2.1. 用户模块",
      "level": 2
    },
    {
      "id": "manual-section-28",
      "title": "2.1.1. 账号登录",
      "level": 3
    },
    {
      "id": "manual-section-29",
      "title": "2.1.2. 首页",
      "level": 3
    },
    {
      "id": "manual-section-30",
      "title": "2.1.3. 数据服务-数据管理",
      "level": 3
    },
    {
      "id": "manual-section-31",
      "title": "2.1.3.1. 训练数据管理",
      "level": 4
    },
    {
      "id": "manual-section-32",
      "title": "2.1.3.1.1. 创建数据集",
      "level": 5
    },
    {
      "id": "manual-section-33",
      "title": "2.1.3.1.2. 查看数据集详情",
      "level": 5
    },
    {
      "id": "manual-section-34",
      "title": "2.1.3.1.3. 新增版本",
      "level": 5
    },
    {
      "id": "manual-section-35",
      "title": "2.1.3.2. 测试数据管理",
      "level": 4
    },
    {
      "id": "manual-section-36",
      "title": "2.1.3.2.1. 创建数据集",
      "level": 5
    },
    {
      "id": "manual-section-37",
      "title": "2.1.3.2.2. 查看数据集详情",
      "level": 5
    },
    {
      "id": "manual-section-38",
      "title": "2.1.3.2.3. 新增版本",
      "level": 5
    },
    {
      "id": "manual-section-39",
      "title": "2.1.3.3. 推理结果集",
      "level": 4
    },
    {
      "id": "manual-section-40",
      "title": "2.1.3.3.1. 创建数据集",
      "level": 5
    },
    {
      "id": "manual-section-41",
      "title": "2.1.3.3.2. 查看数据集详情",
      "level": 5
    },
    {
      "id": "manual-section-42",
      "title": "2.1.4. 数据服务-数据处理",
      "level": 3
    },
    {
      "id": "manual-section-43",
      "title": "2.1.4.1. 数据清洗",
      "level": 4
    },
    {
      "id": "manual-section-44",
      "title": "2.1.4.1.1. 创建清洗任务",
      "level": 5
    },
    {
      "id": "manual-section-45",
      "title": "2.1.4.1.2. 清洗任务查看",
      "level": 5
    },
    {
      "id": "manual-section-46",
      "title": "2.1.4.2. 数据标注",
      "level": 4
    },
    {
      "id": "manual-section-47",
      "title": "2.1.4.2.1. 创建在线标注任务",
      "level": 5
    },
    {
      "id": "manual-section-48",
      "title": "2.1.4.2.2. 标注任务详情",
      "level": 5
    },
    {
      "id": "manual-section-49",
      "title": "2.1.4.2.3. AI自动标注",
      "level": 5
    },
    {
      "id": "manual-section-50",
      "title": "2.1.5. 模型训练",
      "level": 3
    },
    {
      "id": "manual-section-51",
      "title": "2.1.5.1. 在线Notebook",
      "level": 4
    },
    {
      "id": "manual-section-52",
      "title": "2.1.5.1.1. 创建Notebook",
      "level": 5
    },
    {
      "id": "manual-section-53",
      "title": "2.1.5.1.2. Notebook任务启动",
      "level": 5
    },
    {
      "id": "manual-section-54",
      "title": "2.1.5.1.3. 运行Notebook",
      "level": 5
    },
    {
      "id": "manual-section-55",
      "title": "2.1.5.1.4. 自定义镜像",
      "level": 5
    },
    {
      "id": "manual-section-56",
      "title": "2.1.5.2. 大模型训练",
      "level": 4
    },
    {
      "id": "manual-section-57",
      "title": "2.1.5.2.1. 创建训练任务",
      "level": 5
    },
    {
      "id": "manual-section-58",
      "title": "2.1.5.2.2. 新增训练任务版本",
      "level": 5
    },
    {
      "id": "manual-section-59",
      "title": "2.1.5.2.3. 训练任务详情页：可查看训练基本信息、相关数据集、参数、指标、训练日志和训练产物。",
      "level": 5
    },
    {
      "id": "manual-section-60",
      "title": "2.1.5.3. 模型管理",
      "level": 4
    },
    {
      "id": "manual-section-61",
      "title": "2.1.5.3.1. 创建模型：选择模型类型（支持文本生成）、训练方式（支持SFT）、训练任务、Checkpoint。",
      "level": 5
    },
    {
      "id": "manual-section-62",
      "title": "2.1.5.3.2. 新增模型版本",
      "level": 5
    },
    {
      "id": "manual-section-63",
      "title": "2.1.6. 模型评估",
      "level": 3
    },
    {
      "id": "manual-section-64",
      "title": "2.1.6.1. 效果评估-自动评估",
      "level": 4
    },
    {
      "id": "manual-section-65",
      "title": "2.1.6.1.1. 创建评估任务",
      "level": 5
    },
    {
      "id": "manual-section-66",
      "title": "2.1.6.1.2. 评估任务详情",
      "level": 5
    },
    {
      "id": "manual-section-67",
      "title": "2.1.6.2. 效果评估-基准评估",
      "level": 4
    },
    {
      "id": "manual-section-68",
      "title": "2.1.6.2.1. 创建评估任务",
      "level": 5
    },
    {
      "id": "manual-section-69",
      "title": "2.1.6.2.2. 基准评估详情",
      "level": 5
    },
    {
      "id": "manual-section-70",
      "title": "2.1.6.3. 效果评估-人工评估",
      "level": 4
    },
    {
      "id": "manual-section-71",
      "title": "2.1.6.3.1. 创建人工评估任务",
      "level": 5
    },
    {
      "id": "manual-section-72",
      "title": "2.1.6.3.2. 人工评估详情",
      "level": 5
    },
    {
      "id": "manual-section-73",
      "title": "2.1.6.4. 评估指标",
      "level": 4
    },
    {
      "id": "manual-section-74",
      "title": "2.1.6.4.1. 创建评估指标",
      "level": 5
    },
    {
      "id": "manual-section-75",
      "title": "2.1.7. 模型服务",
      "level": 3
    },
    {
      "id": "manual-section-76",
      "title": "2.1.7.1. 模型部署",
      "level": 4
    },
    {
      "id": "manual-section-77",
      "title": "2.1.7.1.1. 部署模型服务",
      "level": 5
    },
    {
      "id": "manual-section-78",
      "title": "2.1.7.1.2. 服务详情",
      "level": 5
    },
    {
      "id": "manual-section-79",
      "title": "2.1.7.1.3. 服务运维",
      "level": 5
    },
    {
      "id": "manual-section-80",
      "title": "2.1.7.2. 在线推理服务",
      "level": 4
    },
    {
      "id": "manual-section-81",
      "title": "2.1.7.2.1. 创建模型服务",
      "level": 5
    },
    {
      "id": "manual-section-82",
      "title": "2.2. 管理员模块",
      "level": 2
    },
    {
      "id": "manual-section-83",
      "title": "2.2.1. 项目管理",
      "level": 3
    },
    {
      "id": "manual-section-84",
      "title": "2.2.1.1. 新增项目",
      "level": 4
    },
    {
      "id": "manual-section-85",
      "title": "2.2.1.2. 成员管理：管理每个项目涉及的人员，点击【添加成员】可为项目新增成员。",
      "level": 4
    },
    {
      "id": "manual-section-86",
      "title": "2.2.2. 集群管理",
      "level": 3
    },
    {
      "id": "manual-section-87",
      "title": "2.2.2.1. 导入集群：支持文本或文件导入形式。导入完成后，进行按顺序连接测试、存储配置绑定、仓库配置绑定，即可完成集群导入工作。",
      "level": 4
    },
    {
      "id": "manual-section-88",
      "title": "",
      "level": 4
    },
    {
      "id": "manual-section-89",
      "title": "2.2.3. 存储管理",
      "level": 3
    },
    {
      "id": "manual-section-90",
      "title": "2.2.3.1. 存储配置说明",
      "level": 4
    },
    {
      "id": "manual-section-91",
      "title": "2.2.4. 镜像管理",
      "level": 3
    },
    {
      "id": "manual-section-92",
      "title": "2.2.4.1. 镜像列表",
      "level": 4
    },
    {
      "id": "manual-section-93",
      "title": "2.2.4.2. 镜像仓库：当前最多支持创建一个镜像仓库，支持火山云和私有化Harbor",
      "level": 4
    },
    {
      "id": "manual-section-94",
      "title": "2.2.4.3. 仓库镜像配置",
      "level": 4
    },
    {
      "id": "manual-section-95",
      "title": "2.2.5. 基础模型管理",
      "level": 3
    },
    {
      "id": "manual-section-96",
      "title": "2.2.5.1. 新增模型",
      "level": 4
    },
    {
      "id": "manual-section-97",
      "title": "2.2.5.2. 本地上传模型",
      "level": 4
    },
    {
      "id": "manual-section-98",
      "title": "2.2.6. 系统配置",
      "level": 3
    },
    {
      "id": "manual-section-99",
      "title": "2.2.6.1. 属性列表",
      "level": 4
    },
    {
      "id": "manual-section-100",
      "title": "2.2.6.2. 新增属性",
      "level": 4
    },
    {
      "id": "manual-section-101",
      "title": "2.2.7. 平台管理员",
      "level": 3
    },
    {
      "id": "manual-section-102",
      "title": "2.2.7.1. 新增属性",
      "level": 4
    },
    {
      "id": "manual-section-103",
      "title": "2.2.7.2. 添加平台管理员",
      "level": 4
    }
  ],
  "chunks": [
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "DeepexiLab产品使用手册-V1.2",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-1",
      "content": "DeepexiLab产品使用手册-V1.2"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1. 产品概述",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-2",
      "content": "1. 产品概述"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.1. 产品介绍",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-3",
      "content": "1.1. 产品介绍 DeepexiLab是一个一站式模型训练平台，打通「数据管理-模型训练-效果评估」全链路，实现异构算力（GPU/NPU）无感调度。平台提供数据接入、分布式训练、模型评估与版本管理等完整能力，持续沉淀 AI 资产，全面提升训练效率与模型价值。Lab算力管理架构生屏蔽 GPU/NPU 异构差异，实现高效弹性调度算力，有效提升算力资源利用率。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.2. 核心优势：",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-4",
      "content": "1.2. 核心优势： 全链路闭环：覆盖从数据准备到模型服务的完整流程 异构算力调度：智能屏蔽GPU/NPU差异，资源利用率提升40%+ 企业级管理：项目隔离、权限管控、资源审计三位一体 低门槛开发：内置主流框架，支持零代码微调"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.3. 快速开始（完成第一个模型微调）",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-5",
      "content": "1.3. 快速开始（完成第一个模型微调） 场景：使用SFT对Qwen2.5-0.5B模型进行监督微调 步骤概览： 准备数据：上传JSONL格式的Prompt-Response数据 创建任务：选择基础模型与微调方式 启动训练：配置1-2张GPU，设置学习率0.0001 评估效果：使用自动评估对比微调前后效果 最佳实践：首次建议使用LoRA微调，显存占用减少70%，训练速度提升2-3倍"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4. 功能介绍",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-6",
      "content": "1.4. 功能介绍"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1. 用户模块",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-7",
      "content": "1.4.1. 用户模块"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1.1. 数据管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-8",
      "content": "1.4.1.1. 数据管理 训练数据管理 训练数据管理是模型开发流程的“原材料仓库”，支持对多格式训练数据的统一接入与版本控制。通过数据统一管理，保障训练输入的准确性与一致性，为高质量模型训练奠定坚实基础。 测试数据管理 测试数据管理是模型评估与验证的关键环节，负责对测试数据集进行统一管理与版本控制。它确保测试数据的独立性、覆盖性和代表性，支持模型在多样场景下的公正评估与持续优化。 推理结果集 推理结果集管理用于系统化存储、追踪与分析模型的预测输出，支持离线推理、在线推理和文件导入的推理方式，适用于模型选型、效果评估或模型复用场景。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1.2. 数据处理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-9",
      "content": "1.4.1.2. 数据处理 数据清洗 提供自动化的数据质量提升服务，支持缺失值处理、异常值检测、重复数据去除等清洗算子，确保数据一致性和准确性。 数据标注 提供在线标注能力，支持选择训练、验证、测试数据集，帮助提高数据标注效率。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1.3. 模型训练",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-10",
      "content": "1.4.1.3. 模型训练 在线Notebook 在线Notebook打造“开箱即用”的云端Python研发环境：基于Web的JupyterLab内核一键启动，自动完成依赖镜像加载与显卡资源弹性分配。内置主流深度学习框架，帮助提升研发与交付效率。 大模型训练 大模型训练模块旨在简化训练流程，提高模型训练的效率和效果。用户创建模型训练任务后，通过设置任务的基础信息，选择基础模型和训练方法，调整训练参数如学习率和批大小，管理训练和验证数据集，并分配GPU资源，即可启动训练任务。任务运行完成后，用户可查看训练详情。 模型管理 提供对训练产出模型的统一管理，通过版本控制帮助用户快速定位相关模型，支持查看模型的详细信息，提高后续模型训练效果比较、模型部署等操作效率。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1.4. 模型评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-11",
      "content": "1.4.1.4. 模型评估 效果评估 自动评估 自动评估对对参评模型基于评测数据生成的输出进行自动评分，提供⽂本类⽣成模型的裁判员评估和基础指标评估两种方式。支持单个模型或多个模型对比评估，评估完成后将生成对应评估报告，汇总相关指标得分及每条数据的评估详情和评估日志，用户可根据需要自行查看，分析下一阶段模型迭代方向。 基准评估 基准评估内置 MMLU、C-Eval等基准数据集，提供自动化评测框架，对参评模型进行标准化能力评估。 人工评估 支持对文本生成、图像理解等任务进行专家评测。评估人员可从多个维度对模型回复进行主观评分，综合专业判断与实际经验，量化评估模型输出质量。 评估指标 评估指标功能，支持用户创建和管理自定义评估指标，可快速用于自动评估中的裁判员评估，实现指标的统一管理与调用。内置常用评估指标（如准确率、BLEU、ROUGE 等），作用于自动评估环节，量化模型基础能力表现。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.1.5. 模型服务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-12",
      "content": "1.4.1.5. 模型服务 模型部署 支持将基础模型、训练完成的等模型部署为在线服务，可便捷用于评估、AI标注等场景。 在线推理服务 支持接入第三方模型服务，可快速应用于推理结果集和模型评估等场景。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2. 管理员模块",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-13",
      "content": "1.4.2. 管理员模块"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.1. 项目管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-14",
      "content": "1.4.2.1. 项目管理 项目管理为AI研发提供全生命周期协作框架，支持以项目维度统筹数据、模型、任务与成员权限。通过项目管控实现跨团队协作透明化，保障模型研发过程可控、可追溯、可交付。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.2. 集群管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-15",
      "content": "1.4.2.2. 集群管理 集群管理提供对训练资源的统一纳管与智能调度，支持显卡部署与弹性扩缩容。通过资源池划分、任务优先级调度与实时监控，最大化提升算力利用率，保障关键任务稳定运行，降低基础设施运维复杂度。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.3. 存储管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-16",
      "content": "1.4.2.3. 存储管理 存储管理为训练全流程提供高效、可靠的数据存储支撑，支持火山引擎 TOS、MinIO 和 NFS等多种存储后端。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.4. 镜像管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-17",
      "content": "1.4.2.4. 镜像管理 镜像列表 提供项目中所有镜像的集中视图与统一管理功能。支持镜像的分类展示与快速检索，便于用户高效查看，加速项目部署与迭代流程。 镜像仓库 提供企业级镜像的集中存储、分发与管理平台。支持镜像的安全存储，确保镜像资源的一致性、可用性与可追溯性，为持续集成与部署提供可靠基础。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.5. 基础模型管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-18",
      "content": "1.4.2.5. 基础模型管理 基础模型管理是企业二次训练模型的“能力中枢”，初始化提供基础模型清单，帮助用户快速选型并二次开发，降低大模型应用门槛，加速业务场景落地。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.6. 系统配置",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-19",
      "content": "1.4.2.6. 系统配置 属性配置 支持自定义数据管理（含训练/测试数据集）与在线推理服务的属性参数，适配不同业务场景需求。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.4.2.7. 平台管理员",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-20",
      "content": "1.4.2.7. 平台管理员 租户管理员可配置平台管理员，平台管理员有权限查看与管理所有项目，为各项目分配项目管理员。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.5. 名词解释",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-21",
      "content": "1.5. 名词解释"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.5.1. 微调类型（文本生成）",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-22",
      "content": "1.5.1. 微调类型（文本生成） 训练类型 说明 全参微调 在每一轮迭代中同步更新预训练模型的全部参数，以追求理论上限的精度，但需占用大量显存与计算资源。 Lora微调 冻结原始权重，仅在自注意力模块旁插入低秩可训练矩阵 ，显著降低显存、通信与部署成本。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.5.2. 微调参数",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-23",
      "content": "1.5.2. 微调参数 参数类型 参数 说明 基础参数 学习率 学习率（Learning Rate），控制模型学习新知识的速度。过高会导致训练不稳定，过低会使训练速度过慢。 训练轮次 训练轮次（num_epochs），控制训练过程中遍历过数据集合的次数。建议设置在1-15之间，小数据集可用更少轮次以避免过拟合。 训练Batch 控制每个设备上进行训练时的批次大小，影响训练速度和内存占用。 梯度累积步数 控制梯度累积的步数，影响训练速度和内存占用。 预热比例 预热比例（Warmup Ratio），训练开始时学习率逐渐增加到设定值的过程占总训练步数的比例。 学习率调度器类型 是否使用bf16精度 是否使用bf16精度，使用bf16精度可以提高训练速度，但会略微降低训练精度。 高级配置 最大梯度范数 梯度裁剪有助于稳定训练过程，防止梯度爆炸问题。常用值为1.0。 RoPE缩放方法 RoPE缩放方法用于扩展模型的上下文窗口大小，YaRN是一种高效的上下文扩展技术。 随机种子 设置固定的随机种子可以确保训练过程的可重复性，便于实验比较和调试。 权重衰减 权重衰减是一种正则化技术，有助于防止模型过拟合。设置为0表示不使用权重衰减。 梯度检查点 通过梯度检查点技术减少训练过程中的内存占用，适用于显存受限的情况。 数据处理配置 预处理各种进程数 预处理各种进程数（Preprocessing Num Workers），控制预处理各种进程数。 最大token长度 训练样本的最大token长度限制（Cutoff Len），训练样本的最大token长度限制。 Lora配置 LoRA秩 LoRA秩（LoRA Rank），LoRA的秩决定了可训练参数的数量。秩越低，参数越少，训练速度越快，但可能影响模型的表达能力。建议选择8或16。 LoRA 目标模块 可以是 'all' 或具体的模块名称，LoRA的目标模块决定了可训练参数的数量。目标模块越少，参数越少，训练速度越快，但可能影响模型的表达能力。 LoRA alpha LoRA alpha 参数，通常设置为 lora_rank 的2倍，影响模型的表达能力。 LoRA dropout 率 LoRA dropout 率，LoRA的dropout率决定了可训练参数的数量。dropout率越低，参数越少，训练速度越快，但可能影响模型的表达能力。 评估配置 评估策略 控制模型评估的频率和时机，按步数评估会在训练到指定步数时进行评估,评估策略与评估间隔步数保持一致。 评估间隔步数 当评估策略选择\"按步数评估\"时，每训练指定步数后进行一次模型评估,评估间隔步数与评估策略保持一致。 评估batch 控制每个设备上进行评估时的批次大小，影响评估速度和内存占用。 最佳模型指标 选择用于判断训练过程中最佳模型的评估指标，通常使用损失值。 指标越大越好 控制评估指标的优化方向，例如准确率越大越好，而损失值越小越好。 训练结束加载最佳模型 开启后，训练结束时会自动加载评估表现最佳的模型权重。 保存配置 模型保存策略 控制模型保存的频率和时机，按步数保存会在训练到指定步数时进行模型保存,保存策略与保存步数保持一致。 模型保存步数 当保存策略选择\"按步数保存\"时，每训练指定步数后进行一次模型保存,保存步数与保存策略保持一致。 模型保存总数限制 模型保存总数限制。 监控配置 日志 日志记录频率。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.5.3. 数据清洗",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-24",
      "content": "1.5.3. 数据清洗 清洗能力 说明 数据格式清洗 空白字符清洗 移除多余的空行、行首/行尾空格、制表符，并将多种换行符统一为\\n 乱码清洗 清洗多种乱码，包括编码异常、键盘乱打、低质量重复文本等 HTML标签清洗 移除HTML标签，保留纯文本内容 多余换行符清洗 将连续多个换行符合并为单个换行符 LLM生成数据清洗 长度异常文本过滤器 移除长度小于指定间值或大于指定间值（按token数计算）的内容 重复生成内容移除器 检测并移除LLM重复生成的内容片段 截断句移除器 移除不完整的截断句子，保证文本完整性 语种过滤器 基于语言识别过滤非目标语种的内容，过滤掉不属于lang_filter_allowed_languages的语言 数据去重 精确匹配去重器 基于精确哈希值的文档去重，适用于完全相同内容的检测基于内容的哈希值（如MD5,SHA256）进行精确匹配，删除完全一样的数据项 MinHash去重器 利用MinHash和局部敏感哈希（LSH）技术，高效地找出Jaccard相似度高的文本对，适合在海量数据中进行近乎重复的文档检测。使用MinHash LSH在文档级别去重样本 SimHash去重器 将文本转换为一个紧凌的SimHash指纹（如64位），通过计算指纹间的汉明距离来判断文本相似度。为每个样本计算SimHash值，并根据指定的汉明距离阀值移除重复项。注：若执行失败，需要安装simhash-pybind库（uv pip install simhash-pybind) 敏感数据清洗 联系方式脱敏 基于正则表达式，识别并处理手机号、Email地址和座机号 身份与证件脱敏 基于正则表达式和校验规则，识别并处理身份证号、护照号等 网络与地址脱敏 识别并处理IP地址、URL链接、MAC地址及物理地址 金融与车辆脱敏 识别并处理银行卡号、信用卡号、车牌号、VIN码等 社交账号脱敏 识别并处理微信号、QQ号、微博账号等社交平台账号 自定义关键词脱敏 根据用户提供的关键词列表进行脱敏处理"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "1.5.4. 自动评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-25",
      "content": "1.5.4. 自动评估 评估方法 说明 裁判员评估 使用裁判模型，根据设定的评分指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。 基础指标评估 根据准确率、F1等一系列预设的深度学习指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2. 操作指南",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-26",
      "content": "2. 操作指南"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1. 用户模块",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-27",
      "content": "2.1. 用户模块"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.1. 账号登录",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-28",
      "content": "2.1.1. 账号登录 在浏览器输入链接访问系统，输入用户名密码，点击登录按钮，信息无误即可登录成功。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.2. 首页",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-29",
      "content": "2.1.2. 首页 本页为您使用本平台提供快速指引，您可先阅读页面提供的简要介绍，快速了解平台功能，然后点击对应的功能，前往具体操作界面。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3. 数据服务-数据管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-30",
      "content": "2.1.3. 数据服务-数据管理"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.1. 训练数据管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-31",
      "content": "2.1.3.1. 训练数据管理 平台可统一纳管用于模型训练的数据集，并支持对数据集进行多版本迭代、增量导入和删除等操作。同步支持训练数据及和验证数据集单独管理，以满足模型开发人员多样的训练数据需求。支持JSON, JSONL，CSV格式。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.1.1. 创建数据集",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-32",
      "content": "2.1.3.1.1. 创建数据集 操作路径：首页 → 左侧导航栏【数据服务】→ 【数据管理】→ 【训练数据管理】→ 【创建数据集】 在指定数据集名称、描述、数据用途、数据格式、数据来源等基本信息后，您可发起数据上传并点击提交，完成数据集创建。当前支持： 文本生成-监督学习SFT数据用途：Prompt-Response、Role-based数据格式 图像理解-监督学习SFT数据用途：Role-based数据格式"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.1.2. 查看数据集详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-33",
      "content": "2.1.3.1.2. 查看数据集详情 操作路径：训练数据管理列表 → 目标数据集 → 【操作】列 → 【查看详情】 点击数据集列表页-操作-查看详情，即可查看对应数据集的详情，如下图所示。支持新增版本、跳转训练页面、下载、删除。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.1.3. 新增版本",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-34",
      "content": "2.1.3.1.3. 新增版本 操作路径：数据集详情页 → 【新增版本】按钮 点击新增版本进入到数据版本新增页面，可选择是否继续历史版本。若开启，则可选择所需继承的版本；若关闭，可单独本地上传数据文件。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.2. 测试数据管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-35",
      "content": "2.1.3.2. 测试数据管理 平台可统一纳管用于模型评估的测试数据集，并支持对数据集进行多版本迭代、增量导入和删除等操作，支持JSON, JSONL，CSV格式。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.2.1. 创建数据集",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-36",
      "content": "2.1.3.2.1. 创建数据集 操作路径：首页 → 左侧导航【数据服务】→ 【数据管理】→【测试数据管理】→ 【创建数据集】 在指定数据集名称、描述、数据用途、数据格式、数据来源等基本信息后，您可发起数据上传并点击提交，完成数据集创建。当前支持： 文本生成-监督学习SFT数据用途：Prompt-Response、Role-based数据格式 图像理解-监督学习SFT数据用途：Role-based数据格式7"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.2.2. 查看数据集详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-37",
      "content": "2.1.3.2.2. 查看数据集详情 点击数据集列表页-操作-查看详情，即可查看对应数据集的详情，如下图所示。支持新增版本、跳转训练页面、下载、删除。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.2.3. 新增版本",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-38",
      "content": "2.1.3.2.3. 新增版本 点击新增版本进入到数据版本新增页面，可选择是否继续历史版本。若开启，则可选择所需继承的版本；若关闭，可单独本地上传数据文件。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.3. 推理结果集",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-39",
      "content": "2.1.3.3. 推理结果集 集中存储与检索模型推理结果的数据集，支持离线推理、在线推理和文件导入的推理方式，可快速用于模型效果评估。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.3.1. 创建数据集",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-40",
      "content": "2.1.3.3.1. 创建数据集 操作路径：首页 → 左侧导航【数据服务】→ 【推理结果集】→ 【创建推理结果数据集】 填完数据集名称、描述、数据用途、推理方式、待推理数据、显卡类型及型号、显卡数量等基本信息后，点击确定即可完成数据集创建。推理方式支持离线推理、在线推理、导入推理结果集三种方式。待推理数据支持选择训练、验证和测试数据集。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.3.3.2. 查看数据集详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-41",
      "content": "2.1.3.3.2. 查看数据集详情 操作路径：推理结果集列表 → 【操作】→ 【查看】 点击数据集列表页-操作-查看，即可查看对应推理结果集的详情，如下图所示。支持下载、删除、去评估，以及任务日志查询。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4. 数据服务-数据处理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-42",
      "content": "2.1.4. 数据服务-数据处理"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.1. 数据清洗",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-43",
      "content": "2.1.4.1. 数据清洗 提供自动化的数据质量提升服务，支持缺失值处理、异常值检测、重复数据去除等清洗算子，确保数据一致性和准确性。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.1.1. 创建清洗任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-44",
      "content": "2.1.4.1.1. 创建清洗任务 操作路径：首页 → 左侧导航【数据服务】→ 【数据处理】→ 【数据清洗】→ 【创建清洗任务】 点击列表页“创建清洗任务”按钮，进入创建页，选择需要清洗的数据集版本，系统默认清洗后数据集增加最新版本。可进行定时配置。清洗能力和顺序可自由调整，系统带有清洗模板，可直接使用，亦可将当前配置的清洗流程保存为模板，以便下次使用。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.1.2. 清洗任务查看",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-45",
      "content": "2.1.4.1.2. 清洗任务查看 操作路径：数据清洗列表 → 目标清洗任务 → 【详情】 列表页操作点击“详情”，进入清洗任务详情，可查看清洗详情，包括基本信息、清洗结果的预览，以及清洗日志。清洗后的数据集以及清洗日志均可下载进行详细查看。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.2. 数据标注",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-46",
      "content": "2.1.4.2. 数据标注 提供在线标注能力，支持文本生成和图像理解类型，支持选择训练、验证、测试数据集，帮助提高数据标注效率。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.2.1. 创建在线标注任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-47",
      "content": "2.1.4.2.1. 创建在线标注任务 操作路径：首页 → 左侧导航【数据服务】→ 【数据处理】→ 【数据标注】→ 【创建标注任务】 列表页点击“创建标注任务”按钮，即可新建标注任务。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.2.2. 标注任务详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-48",
      "content": "2.1.4.2.2. 标注任务详情 列表页操作点击“详情”按钮，进入标注详情页进行标注工作。支持针对Ground Truth进行补充或修改，完成后点击操作的“完成标注”按钮，当条数据即可保存并自动进入下一条标注数据。所有数据均标注完成后，即可点击提交标注。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.4.2.3. AI自动标注",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-49",
      "content": "2.1.4.2.3. AI自动标注 激活步骤： 在标注详情页点击右上角【标注配置】 选择服务：如Qwen3-Next-80B-A3B-Instruct 设置推理参数： Max_tokens: 2048（最大生成长度） Temperature: 0.7（控制随机性） Top_p: 1.0（核采样） presence_penalty: 1.0（存在性惩罚） 点击【确定】 点击【AI自动标注】按钮"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5. 模型训练",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-50",
      "content": "2.1.5. 模型训练"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.1. 在线Notebook",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-51",
      "content": "2.1.5.1. 在线Notebook 在线 Notebook 是为算法工程师量身打造的云端交互式开发环境，预置主流镜像环境，支持即开即用、资源配置、运行时长控制等操作。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.1.1. 创建Notebook",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-52",
      "content": "2.1.5.1.1. 创建Notebook 操作路径：首页 → 左侧导航【模型训练】→ 【在线Notebook】→ 【创建Notebook】 完成基本信息、资源配置、镜像选择，即可快速创建Notebook。显卡配置支持GPU和NPU类型，显卡数量最多可选择8张。支持最长运行时长配置，实现算力合理分配。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.1.2. Notebook任务启动",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-53",
      "content": "2.1.5.1.2. Notebook任务启动 点击启动按钮，提示“Notebook启动成功”，该Notebook任务进入准备中状态，准备完成后进入运行中状态，可进行后续研发工作。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.1.3. 运行Notebook",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-54",
      "content": "2.1.5.1.3. 运行Notebook 点击对应Notebook任务“打开”按钮，进入云端交互式开发界面，继续后续研发工作。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.1.4. 自定义镜像",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-55",
      "content": "2.1.5.1.4. 自定义镜像 针对每个Notebook任务，可手动或停止前保存环境成自定义镜像，后续重新启动或新任务可选择当前环境。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.2. 大模型训练",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-56",
      "content": "2.1.5.2. 大模型训练 在训练数据准备好后，模型开发者可以选择适合自己任务场景的训练模式并加以调参训练，从而实现理想的模型效果。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.2.1. 创建训练任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-57",
      "content": "2.1.5.2.1. 创建训练任务 操作路径：首页 → 左侧导航【模型训练】→ 【大模型训练】→ 【创建训练任务】 2.1.5.2.1.1. 基本信息：补充任务名称和任务描述 2.1.5.2.1.2. 模型配置：选择训练类型及基础模型版本，当前支持文本生成类型 2.1.5.2.1.3. 训练配置：选择训练方法、微调类型及对应的参数。训练方法支持SFT，微调类型支持全参微调、Lora微调。每种类型的微调，可设置学习率、训练轮次等参数。 （全参微调） （Lora微调） 2.1.5.2.1.4. 数据配置：训练任务的选择数据及相关配置。验证数据集可以从训练数据集拆分或使用独立的验证数据集。 显卡资源配置：选择选择所用的的显卡数据，最大支持8张显卡。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.2.2. 新增训练任务版本",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-58",
      "content": "2.1.5.2.2. 新增训练任务版本 操作路径：训练任务详情页 → 【新增版本】"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.2.3. 训练任务详情页：可查看训练基本信息、相关数据集、参数、指标、训练日志和训练产物。",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-59",
      "content": "2.1.5.2.3. 训练任务详情页：可查看训练基本信息、相关数据集、参数、指标、训练日志和训练产物。 状态查看路径：大模型训练 → 任务列表 → 【详情】"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.3. 模型管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-60",
      "content": "2.1.5.3. 模型管理 用户可以进行统一管理已训练好的模型，以便于后续模型部署工作。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.3.1. 创建模型：选择模型类型（支持文本生成）、训练方式（支持SFT）、训练任务、Checkpoint。",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-61",
      "content": "2.1.5.3.1. 创建模型：选择模型类型（支持文本生成）、训练方式（支持SFT）、训练任务、Checkpoint。 操作路径：首页 → 左侧导航【模型训练】→ 【模型管理】→ 【创建模型】"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.5.3.2. 新增模型版本",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-62",
      "content": "2.1.5.3.2. 新增模型版本"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6. 模型评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-63",
      "content": "2.1.6. 模型评估"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.1. 效果评估-自动评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-64",
      "content": "2.1.6.1. 效果评估-自动评估 提供端到端的评估流程自动化，支持裁判员和基础指标评估方式，满足不同业务模型评估任务。任务可进行多个模型对比，支持任务终止和重新评估。支持克隆和删除。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.1.1. 创建评估任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-65",
      "content": "2.1.6.1.1. 创建评估任务 操作路径：首页 → 左侧导航【模型评估】→ 【效果评估】→ 【自动评估】→ 【创建评估任务】 2.1.6.1.1.1. 评估类型 支持单个评估或对比评估，若选择对比评估，可针对多个模型/服务进行评估。为确保评估的有效性，请确保选择的推理结果集来自同一份原始数据集。 2.1.6.1.1.2. 评估方法 支持裁判员和基础指标两种评估方法，可多选。若选择裁判员评估，需要选择裁判模型/服务，并设置相关的推理参数以及评估指标。 裁判员评估：使用裁判模型，根据设定的评分指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现； 基础指标评估：根据准确率、F1等一系列预设的深度学习指标，对参评模型基于评测数据生成的输出进行评分，评估模型在任务上的表现。 2.1.6.1.1.3. 评估指标 点击“增加指标”即可从评估指标列表中筛选所需指标用于评估任务。选择指标后，需要针对相关的指标字段设置映射的数据集字段，确保评估字段一一对应以及评估效果。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.1.2. 评估任务详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-66",
      "content": "2.1.6.1.2. 评估任务详情 查看路径：自动评估列表 → 【操作】→ 【查看评估报告】 2.1.6.1.2.1. 评估报告 点击操作中的“查看评估报告”即可进入任务详情页查看报告结果。报告分为基本信息、报告结果两个模块，基本信息可快速定位任务相关联的内容。报告结果展示对应指标的雷达图与柱状图，为更好展示对比效果，得分以百分比形式展示，具体计算方式：得分/最大值。 2.1.6.1.2.2. 评估详情 评估任务详情页点击“评估详情”，可查看具体评估数据结果，包括模型回答及响应的指标得分。数据结果支持下载。 2.1.6.1.2.3. 任务日志 评估任务详情页点击“任务日志”，可查看具体评估日志，进行过程溯源与问题定位。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.2. 效果评估-基准评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-67",
      "content": "2.1.6.2. 效果评估-基准评估 内置 MMLU、C-Eval等基准数据集，提供自动化评测框架，对参评模型进行标准化能力评估。列表页针对评估的模型形成榜单，可便捷了解模型能力差异。基准评估任务支持对比评估，可同时对多个模型/服务进行评估。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.2.1. 创建评估任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-68",
      "content": "2.1.6.2.1. 创建评估任务 操作路径：首页 → 左侧导航【效果评估】→ 【基准评估】→ 【创建基准评估任务】 内置MMLU、C-Eval等一系列基准评估数据集，可选择模型或服务进行评估。支持配置任务名称、描述、定时评估、待评估模型/服务、推理模型参数配置、显卡资源配置以及基准评估数据集。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.2.2. 基准评估详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-69",
      "content": "2.1.6.2.2. 基准评估详情 评估报告：包含基本信息、评估结果（评分维度雷达图、数据明细、对比柱状图），支持Word格式下载。 任务日志：可查看评估过程中的详细日志，进行过程溯源与问题定位。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.3. 效果评估-人工评估",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-70",
      "content": "2.1.6.3. 效果评估-人工评估 支持对文本生成、图像理解等任务进行专家评测。评估人员可从多个维度对模型回复进行主观评分，综合专业判断与实际经验，量化评估模型输出质量。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.3.1. 创建人工评估任务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-71",
      "content": "2.1.6.3.1. 创建人工评估任务 操作路径：首页→ 左侧导航【模型评估】→ 【效果评估】→ 【人工评估】→ 【创建评估任务】 支持配置任务名称、描述、评估类型（单个评估、对比评估）、评估类别（文本生成、图像理解）、评估数据来源（已有推理结果集、新建推理结果集）、数据采样率及评估指标。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.3.2. 人工评估详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-72",
      "content": "2.1.6.3.2. 人工评估详情 评估报告：包含基本信息、评估结果（评分维度雷达图、数据明细、对比柱状图），支持下载。 评估详情：支持多格式下载（JSONL、JSON、CSV），便于进一步分析。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.4. 评估指标",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-73",
      "content": "2.1.6.4. 评估指标 操作路径：首页 → 左侧导航【模型评估】→ 【评估指标】 支持用户创建和管理自定义评估指标，可快速用于自动评估中的裁判员评估和人工评估，实现指标的统一管理与调用。用户可基于Prompt模版设置评估指标，进行快速预览。平台内置常用评估指标（如准确率、BLEU、ROUGE等），作用于自动评估环节，量化模型基础能力表现。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.6.4.1. 创建评估指标",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-74",
      "content": "2.1.6.4.1. 创建评估指标 点击评估指标列表页右上角“新建指标”按钮，进入指标创建页。右侧可进行指标名称、指标说明、指标评分量级（最高为10）、评分区间填写及指标关键字段选择，填写完毕后点击“模板预览”，即可看到提示词效果。系统已内置答案相关性、忠实度、上下文精确度、上下文召回率、上下文相关性5个用于知识库检索评估指标，用户可根据实际需求选择或新增。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7. 模型服务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-75",
      "content": "2.1.7. 模型服务"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.1. 模型部署",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-76",
      "content": "2.1.7.1. 模型部署"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.1.1. 部署模型服务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-77",
      "content": "2.1.7.1.1. 部署模型服务 操作路径：首页 → 左侧导航【模型服务】→ 【部署部署】 服务名称：服务名称用于外部请求时，使用该名称访问模型。 模型来源，单选,如果选择训练生成，从模型管理模块获取训练生产的模型，如果选择基础模型，从基础模型中获取模型。 显卡类型及型号。显卡数可选范围为1-8张。 部署实例数：大于等于1。 推理镜像类型：单选，筛选出该模型可用的推理框架镜像 运行命令会根据所选的模型和推理框架自动生成。 支持配置推理参数和环境变量。 点击开始部署 则部署服务"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.1.2. 服务详情",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-78",
      "content": "2.1.7.1.2. 服务详情 基本信息 在部署信息中， 服务名称不可修改，其他参数可以修改，并支持重新部署。 重新服务，不修改模型访问信息（模型地址 端口号 服务名称） 点击重新部署 在实例管理中，支持实例的扩缩容和实例日志查看"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.1.3. 服务运维",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-79",
      "content": "2.1.7.1.3. 服务运维 服务停止，服务停止后请求会中断。 服务启动 服务删除 当不再使用该服务时，允许删除 访问信息 显示服务名称与地址，允许复制，请求时通过地址与名称对模型请求。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.2. 在线推理服务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-80",
      "content": "2.1.7.2. 在线推理服务 操作路径：首页 → 左侧导航【模型服务】→ 【在线推理服务】 支持接入第三方模型服务，可快速应用于推理结果集和模型评估等场景。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.1.7.2.1. 创建模型服务",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-81",
      "content": "2.1.7.2.1. 创建模型服务 点击在线推理服务列表页右上角“新建服务”按钮，进入模型服务创建页。补充基本信息、API Key、Base URL、模型名称以及模型类型即可创建。创建成功后，点击列表页-操作-连接测试，若显示测试通过，即可正常使用。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2. 管理员模块",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-82",
      "content": "2.2. 管理员模块"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.1. 项目管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-83",
      "content": "2.2.1. 项目管理 操作路径：首页 → 左侧导航【管理员模块】→ 【项目管理】 管理员可通过项目管理模块，增加、删除项目，以及编排项目成员。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.1.1. 新增项目",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-84",
      "content": "2.2.1.1. 新增项目"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.1.2. 成员管理：管理每个项目涉及的人员，点击【添加成员】可为项目新增成员。",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-85",
      "content": "2.2.1.2. 成员管理：管理每个项目涉及的人员，点击【添加成员】可为项目新增成员。 操作路径：项目管理 → 目标项目 → 【操作】→ 【成员管理】"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.2. 集群管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-86",
      "content": "2.2.2. 集群管理 操作路径：左侧导航【管理员模块】→ 【集群管理】 管理员可统一管理Kubernetes集群，支持Kubernetes多形式导入。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.2.1. 导入集群：支持文本或文件导入形式。导入完成后，进行按顺序连接测试、存储配置绑定、仓库配置绑定，即可完成集群导入工作。",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-87",
      "content": "2.2.2.1. 导入集群：支持文本或文件导入形式。导入完成后，进行按顺序连接测试、存储配置绑定、仓库配置绑定，即可完成集群导入工作。 导入文件从K8S集群中config文件获取，一般获取路径为K8S masater节点中/root/.kube/config，具体文件路径跟K8s安装有关。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-88",
      "content": "连接测试：测试对应集群是否连通。 存储配置绑定：选择存储进行绑定。 仓库配置绑定：选择镜像仓库进行绑定。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.3. 存储管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-89",
      "content": "2.2.3. 存储管理 操作路径：左侧导航【管理员模块】→ 【存储管理】 支持火山引擎TOS、MiniO、NFS等类型，当前最多创建一个存储配置。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.3.1. 存储配置说明",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-90",
      "content": "2.2.3.1. 存储配置说明 下拉选择对应存储类型 会显示对应的存储类型所需要的基础配置信息 配置项 配置描述 配置名称 自定义即可 存储类型 支持火山TOS，MinIO协议，NFS，华为OBS 描述信息 自定义即可 终端节点 火山TOS，MinIO需要填写 地区 火山TOS，华为OBS需要填写 存储桶名称 对应类型所创建的桶名称，需要在存储类型上先创建对应桶 访问密钥AK 在对应存储类型管理端获取 密钥SK 在对应存储类型管理端获取"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.4. 镜像管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-91",
      "content": "2.2.4. 镜像管理 操作路径：左侧导航【管理员模块】→ 【镜像管理】 管理和配置镜像仓库与相应镜像。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.4.1. 镜像列表",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-92",
      "content": "2.2.4.1. 镜像列表"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.4.2. 镜像仓库：当前最多支持创建一个镜像仓库，支持火山云和私有化Harbor",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-93",
      "content": "2.2.4.2. 镜像仓库：当前最多支持创建一个镜像仓库，支持火山云和私有化Harbor"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.4.3. 仓库镜像配置",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-94",
      "content": "2.2.4.3. 仓库镜像配置 操作路径：镜像管理 → 镜像仓库配置 → 【新建】 配置类型 火山云 Harbor 仓库名称 自定义即可 自定义即可 仓库类型 火山云 Harbor 仓库地址 需要网络能访问火山云仓库地址 harbor仓库地址 命名空间 命名空间 harbor中项目的概念 认证方式 分为 1.无需认证 2.用户名密码 3.访问令牌 登录火山云所用用户和密码 分为 1.无需认证 2.用户名密码 3.访问令牌 访问Harbor镜像仓库访问方式选择即可，并且输入对应认证信息 管理地址 仓库web前端地址（通常和仓库地址一致） 仓库web前端地址（通常和仓库地址一致） 访问密钥AK 访问火山云镜像仓库AK 访问Harbor镜像仓库用户名 密钥SK 访问火山云镜像仓库SK 访问Harbor镜像仓库密码 地区 镜像仓库所在地区 根据火山云申请镜像仓库地址填写 无 实例名称 火山云镜像仓库实例名称 无"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.5. 基础模型管理",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-95",
      "content": "2.2.5. 基础模型管理 操作路径：左侧导航【管理员模块】→ 【基础模型管理】 训练基础模型统一接入与管理。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.5.1. 新增模型",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-96",
      "content": "2.2.5.1. 新增模型 支持本地和ModelScope两种方式。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.5.2. 本地上传模型",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-97",
      "content": "2.2.5.2. 本地上传模型 1.安装juicefs工具 wget -O juicefs-1.3.0-linux-amd64.tar.gz \"https://example.com/path/to/juicefs-1.3.0-linux-amd64.tar.gz\" tar -zxf \"juicefs-1.3.0-linux-amd64.tar.gz\" sudo install juicefs /usr/local/bin 2.获取存储初始化后metaurl 使用metaurl 地址挂载juicefs ：如下将juicefs存储挂载到Linux机器的/mnt/jfs目录上 juicefs mount postgres://&lt;user&gt;:&lt;password&gt;@&lt;host&gt;:&lt;port&gt;/juicefs /mnt/jfs -d 3.确保服务器已安装git lfs已经安装 git lfs install 4.创建qwen系列目录并下载权重文件 mkdir /mnt/jfs/public/models/Qwen cd /mnt/jfs/public/models/Qwen && git clone https://www.modelscope.cn/Qwen/Qwen2.5-0.5B-Instruct.git"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.6. 系统配置",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-98",
      "content": "2.2.6. 系统配置 支持自定义数据管理（含训练/测试数据集）与在线推理服务的属性参数，适配不同业务场景需求。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.6.1. 属性列表",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-99",
      "content": "2.2.6.1. 属性列表 系统支持配置以下模块的属性：数据管理：训练数据管理、测试数据管理；在线推理服务。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.6.2. 新增属性",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-100",
      "content": "2.2.6.2. 新增属性 数据管理属性配置：属性名称（设置属性的名称）、属性描述（描述该属性的用途）、输入方式（支持下拉选择）、选择模式（支持单选、多选）、属性值（设置可选的属性值列表）、是否必填（设置该属性是否为必填项） 在线推理服务属性配置：属性名称（设置属性的名称）、属性描述（描述该属性的用途）、输入方式（支持下拉选择、手动输入）、是否必填（设置该属性是否为必填项）"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.7. 平台管理员",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-101",
      "content": "2.2.7. 平台管理员 租户管理员可配置平台管理员，平台管理员有权限查看与管理所有项目，为各项目分配项目管理员。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.7.1. 新增属性",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-102",
      "content": "2.2.7.1. 新增属性 操作路径：首页→ 左侧导航→ 【平台管理员】 展示所有平台管理员用户信息。"
    },
    {
      "docId": "deepexilab-product-manual-v1-2",
      "title": "DeepexiLab产品使用手册-V1.2",
      "sectionTitle": "2.2.7.2. 添加平台管理员",
      "routePath": "/docs/product-manual",
      "anchor": "manual-section-103",
      "content": "2.2.7.2. 添加平台管理员 点击【添加平台管理员】按钮，选择已有用户或新增用户为平台管理员。平台管理员拥有以下权限：、查看所有项目、管理所有项目成员、为各项目分配项目管理员、管理系统基础配置。"
    }
  ]
} satisfies ProductManualDocument
