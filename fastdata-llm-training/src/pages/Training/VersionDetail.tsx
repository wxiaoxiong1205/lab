import React, { useState } from 'react'
import {
  Card,
  Descriptions,
  Table,
  Tag,
  Typography,
  Tabs,
  Button,
  Space,
  Row,
  Col,
  Modal,
  message,
} from 'antd'
import {
  ArrowLeftOutlined,
  ReloadOutlined,
  DatabaseOutlined,
  ThunderboltOutlined,
  SettingOutlined,
  BarChartOutlined,
  FileTextOutlined,
  FolderOutlined,
  StopOutlined,
  RedoOutlined,
  EditOutlined,
  DeleteOutlined,
} from '@ant-design/icons'
import { useParams, useNavigate } from 'react-router-dom'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { mockTasks } from '../../data/mockData'
import {
  TRAINING_METHOD_LABELS,
  TRAINING_RUN_STATUS_TAG,
  type MetricPoint,
} from '../../types/training'
import {
  getVersionActionFlags,
  TERMINATE_BLOCKED_MESSAGE,
} from './trainingVersionActions'

const { Title, Text } = Typography

/** 与参考页一致：表格中指标值使用主题蓝 */
const METRIC_VALUE_BLUE = '#1677ff'

function formatMetricTableValue(v: number): string {
  const a = Math.abs(v)
  if (Number.isNaN(v)) return '--'
  if (a === 0) return '0.0000'
  if (a >= 10000 || a < 0.0001) return v.toExponential(4)
  return v.toFixed(4)
}

/** 训练曲线展示顺序（与参考页一致：loss / eval_loss / epoch / learning_rate 等） */
const METRIC_CURVE_ORDER = [
  'loss',
  'eval_loss',
  'epoch',
  'learning_rate',
  'grad_norm',
  'train_loss',
  'eval_runtime',
  'eval_samples_per_second',
  'eval_steps_per_second',
] as const

function MetricMiniChart({ name, data }: { name: string; data: MetricPoint[] }) {
  if (!data?.length) return null
  const yFmt = (v: number) => {
    const a = Math.abs(v)
    if (a > 0 && a < 0.00001) return v.toExponential(1)
    if (a >= 1000) return v.toExponential(1)
    return v.toFixed(a < 1 ? 6 : 2)
  }
  return (
    <div
      style={{
        border: '1px solid #f0f0f0',
        borderRadius: 8,
        padding: '10px 8px 4px',
        background: '#fff',
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', display: 'block', marginBottom: 6 }}>
        {name}
      </Text>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis
            dataKey="step"
            type="number"
            tick={{ fontSize: 11, fill: '#64748b' }}
            stroke="#e2e8f0"
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={52}
            stroke="#e2e8f0"
            tickFormatter={yFmt}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value) => {
              const n = typeof value === 'number' ? value : Number(value)
              return [Number.isFinite(n) ? formatMetricTableValue(n) : '--', name]
            }}
            labelFormatter={s => `Step: ${s}`}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={METRIC_VALUE_BLUE}
            strokeWidth={2}
            dot={{ r: 3, fill: METRIC_VALUE_BLUE }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const VersionDetail: React.FC = () => {
  const { id, versionId } = useParams<{ id: string; versionId: string }>()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('dataset')
  const [activeParamTab, setActiveParamTab] = useState('basic')

  const task = mockTasks.find(t => t.id === id)
  const version = task?.versions.find(v => v.id === versionId)

  const handleBack = () => navigate(`/training/detail/${id}`)

  if (!task) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <Card style={{ textAlign: 'center', padding: '60px 0', borderRadius: 16 }}>
          <Title level={4} style={{ color: '#64748b' }}>任务不存在</Title>
          <Button type="primary" onClick={() => navigate('/training')} style={{ marginTop: 16, borderRadius: 8 }}>
            返回列表
          </Button>
        </Card>
      </div>
    )
  }

  if (!version) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <Card style={{ textAlign: 'center', padding: '60px 0', borderRadius: 16 }}>
          <Title level={4} style={{ color: '#64748b' }}>版本不存在</Title>
          <Button type="primary" onClick={handleBack} style={{ marginTop: 16, borderRadius: 8 }}>
            返回任务详情
          </Button>
        </Card>
      </div>
    )
  }

  const statusCfg = TRAINING_RUN_STATUS_TAG[version.status]
  const actionFlags = getVersionActionFlags(version.status)

  const handleTerminate = () => {
    Modal.confirm({
      title: '确认终止该版本训练？',
      okText: '确认',
      cancelText: '取消',
      onOk: () => message.success('已提交终止'),
    })
  }

  const handleResubmit = () => {
    navigate(`/training/create?taskId=${id}&resubmitFrom=${versionId}`)
  }

  const handleEdit = () => {
    navigate(`/training/create?taskId=${id}&editVersion=${versionId}`)
  }

  const handleDelete = () => {
    Modal.confirm({
      title: '确认删除该版本？',
      okType: 'danger',
      okText: '删除',
      onOk: () => {
        message.success('删除成功')
        handleBack()
      },
    })
  }

  // ── 参数配置子Tab内容 ──────────────────────────────────────────────────

  const cfg = version.config
  const basicRows = [
    { name: 'learning_rate',           label: '学习率',            value: cfg?.learningRate },
    { name: 'num_train_epochs',        label: '训练轮次',          value: cfg?.numEpochs },
    { name: 'per_device_train_batch_size', label: 'Batch大小',     value: cfg?.perDeviceBatchSize },
    { name: 'gradient_accumulation_steps', label: '梯度累积步数',  value: cfg?.gradientAccumulationSteps },
    { name: 'warmup_ratio',            label: '预热比例',          value: cfg?.warmupRatio },
    { name: 'lr_scheduler_type',        label: '学习率调度器',       value: cfg?.lrSchedulerType },
    { name: 'bf16',                     label: 'bf16精度',          value: cfg?.useBf16 ? 'true' : 'false' },
  ].filter(r => r.value !== undefined)

  const advancedRows = [
    { name: 'gradient_checkpointing', label: '梯度检查点',  value: cfg?.gradientCheckpointing ? 'true' : 'false' },
    { name: 'max_grad_norm',          label: '最大梯度范数', value: cfg?.maxGradNorm },
    { name: 'rope_scaling',           label: 'RoPE缩放',     value: cfg?.ropeScalingMethod },
    { name: 'seed',                   label: '随机种子',      value: cfg?.randomSeed },
    { name: 'weight_decay',           label: '权重衰减',      value: cfg?.weightDecay },
  ].filter(r => r.value !== undefined)

  const dataProcRows = [
    { name: 'cutoff_len',                 label: '截断长度',         value: cfg?.cutoffLength },
    { name: 'preprocessing_num_workers',   label: '预处理线程数',     value: cfg?.preprocessingNumWorkers },
  ].filter(r => r.value !== undefined)

  const loraRows = [
    { name: 'lora_alpha',   label: 'lora_alpha',   value: cfg?.loraAlpha },
    { name: 'lora_dropout', label: 'lora_dropout', value: cfg?.loraDropout },
    { name: 'lora_rank',    label: 'lora_rank',    value: cfg?.loraRank },
    { name: 'lora_target',  label: 'lora_target',  value: cfg?.loraTarget },
  ].filter(r => r.value !== undefined)

  const saveRows = [
    { name: 'save_steps',        label: '保存步数',       value: cfg?.saveSteps },
    { name: 'save_strategy',     label: '保存策略',       value: cfg?.saveStrategy },
    { name: 'save_total_limit',  label: '最大保存数量',    value: cfg?.saveTotalLimit },
  ].filter(r => r.value !== undefined)

  const evalRows = [
    { name: 'eval_steps',              label: '评估间隔步数',   value: cfg?.evalSteps },
    { name: 'eval_strategy',           label: '评估策略',        value: cfg?.evalStrategy },
    { name: 'greater_is_better',        label: '越大越好',        value: cfg?.metricGreaterIsBetter ? 'true' : 'false' },
    { name: 'load_best_model_at_end',   label: '加载最佳模型',   value: cfg?.loadBestModelAtEnd ? '是' : '否' },
    { name: 'metric_for_best_model',    label: '最佳模型指标',   value: cfg?.bestModelMetric },
    { name: 'per_device_eval_batch_size', label: '评估Batch大小', value: cfg?.perDeviceEvalBatchSize },
  ].filter(r => r.value !== undefined)

  const monitorRows = [
    { name: 'logging_steps', label: '日志记录步数', value: cfg?.loggingSteps },
  ].filter(r => r.value !== undefined)

  // ── Tab Items ──────────────────────────────────────────────────────────

  // 数据集 Tab
  const datasetContent = version.dataset ? (
    <div>
      <Title level={5} style={{ margin: '0 0 16px', color: '#0f172a' }}>训练数据集</Title>
      <Table
        dataSource={[version.dataset.train]}
        rowKey="id"
        pagination={false}
        size="small"
        style={{ marginBottom: 24 }}
        columns={[
          { title: '数据集名称', dataIndex: 'name', key: 'name' },
          { title: '版本',        dataIndex: 'version', key: 'version' },
          { title: '样本数量',    dataIndex: 'sampleCount', key: 'sampleCount', render: (v: number) => v ?? '--' },
          { title: '字符数',      dataIndex: 'charCount',   key: 'charCount',   render: (v: number) => v ?? '--' },
          { title: '权重',        dataIndex: 'weight',       key: 'weight',       render: (v: number) => v ? `${v}%` : '--' },
          { title: '采样率',      dataIndex: 'sampleRate',   key: 'sampleRate',   render: (v: number) => v ?? '--' },
        ]}
      />
      {version.dataset.validationSplit && (
        <>
          <Title level={5} style={{ margin: '0 0 8px', color: '#0f172a' }}>验证数据集</Title>
          <Card
            size="small"
            style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}
          >
            <Space orientation="vertical" size={4}>
              <Text type="secondary" style={{ fontSize: 13 }}>
                已从训练数据集中按比例随机抽取样本作为验证集
              </Text>
              <Text style={{ color: '#475569', fontSize: 13 }}>
                抽取比例：
                <Text strong style={{ color: '#2563eb' }}> {version.dataset.validationSplit.ratio}%</Text>
              </Text>
              <Text style={{ color: '#475569', fontSize: 13 }}>
                验证集样本总数：
                <Text strong style={{ color: '#0f172a' }}> {version.dataset.validationSplit.sampleCount} 条</Text>
              </Text>
            </Space>
          </Card>
        </>
      )}
    </div>
  ) : (
    <Text type="secondary">暂无数据集信息</Text>
  )

  // 显卡资源配置 Tab
  const gpuContent = version.gpuConfig ? (
    <Descriptions bordered column={2} size="small" style={{ borderRadius: 12, overflow: 'hidden' }}>
      <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '10px 16px', display: 'block' }}>显卡类型</span>}>
        {version.gpuConfig.gpuType ?? 'GPU'}
      </Descriptions.Item>
      <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '10px 16px', display: 'block' }}>显卡型号</span>}>
        {version.gpuConfig.gpuModel ?? '--'}
      </Descriptions.Item>
      <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '10px 16px', display: 'block' }}>显卡内存</span>}>
        {version.gpuConfig.gpuMemory ?? '--'}
      </Descriptions.Item>
      <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '10px 16px', display: 'block' }}>显卡张数</span>}>
        {version.gpuConfig.gpuCount ?? '--'} 张
      </Descriptions.Item>
    </Descriptions>
  ) : (
    <Text type="secondary">暂无显卡资源配置信息</Text>
  )

  // 参数配置 Tab (含子Tab)
  const paramTabItems = [
    {
      key: 'basic',
      label: '基础参数',
      children: (
        <Table
          dataSource={basicRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'advanced',
      label: '高级配置',
      children: (
        <Table
          dataSource={advancedRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'dataproc',
      label: '数据处理配置',
      children: (
        <Table
          dataSource={dataProcRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'lora',
      label: 'LoRA配置',
      children: (
        <Table
          dataSource={loraRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'save',
      label: '保存配置',
      children: (
        <Table
          dataSource={saveRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'evalcfg',
      label: '评估配置',
      children: (
        <Table
          dataSource={evalRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
    {
      key: 'monitor',
      label: '监控配置',
      children: (
        <Table
          dataSource={monitorRows}
          rowKey="name"
          pagination={false}
          size="small"
          style={{ borderRadius: 12, overflow: 'hidden' }}
          columns={[
            { title: '参数名称', dataIndex: 'name',  key: 'name', render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
            { title: '参数值',   dataIndex: 'value', key: 'value', render: (v: string | number) => <Text>{v}</Text> },
          ]}
        />
      ),
    },
  ]

  // 指标 Tab：左侧「基本信息汇总 / 当前指标」表格，右侧「训练曲线」网格（参考 Deepexilab 截图）
  const curveKeys =
    version.metrics?.curves &&
    METRIC_CURVE_ORDER.filter(k => version.metrics!.curves![k]?.length)

  const metricsContent = version.metrics?.current ? (
    <Row gutter={[24, 24]} align="stretch">
      <Col xs={24} lg={10} xl={9}>
        <Card
          title={<Text strong style={{ fontSize: 15 }}>基本信息汇总</Text>}
          size="small"
          styles={{ body: { paddingTop: 0 } }}
          style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
        >
          <Tabs
            defaultActiveKey="current"
            size="small"
            items={[
              {
                key: 'current',
                label: '当前指标',
                children: (
                  <Table
                    dataSource={Object.entries(version.metrics!.current!).map(([key, value]) => ({
                      name: key,
                      value: typeof value === 'number' ? formatMetricTableValue(value) : String(value),
                    }))}
                    rowKey="name"
                    pagination={false}
                    size="small"
                    style={{ borderRadius: 8, overflow: 'hidden' }}
                    columns={[
                      {
                        title: '指标名称',
                        dataIndex: 'name',
                        key: 'name',
                        width: '46%',
                        render: (t: string) => (
                          <Text code style={{ fontSize: 12, color: '#0f172a' }}>
                            {t}
                          </Text>
                        ),
                      },
                      {
                        title: '指标值',
                        dataIndex: 'value',
                        key: 'value',
                        render: (t: string) => (
                          <Text style={{ color: METRIC_VALUE_BLUE, fontWeight: 500, fontFamily: 'monospace', fontSize: 13 }}>
                            {t}
                          </Text>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Col>
      <Col xs={24} lg={14} xl={15}>
        <Card
          title={<Text strong style={{ fontSize: 15 }}>训练曲线</Text>}
          size="small"
          style={{ borderRadius: 12, border: '1px solid #e2e8f0', height: '100%' }}
        >
          {curveKeys && curveKeys.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: 16,
              }}
            >
              {curveKeys.map(key => (
                <MetricMiniChart key={key} name={key} data={version.metrics!.curves![key]!} />
              ))}
            </div>
          ) : (
            <Text type="secondary">暂无训练过程曲线数据</Text>
          )}
        </Card>
      </Col>
    </Row>
  ) : (
    <Text type="secondary">暂无指标数据</Text>
  )

  // ── 训练日志 Tab（始终展示，内容根据状态区分）──────────────────────────────────────
  const isRunning = version.status === 'running'
  const isCompleted = version.status === 'completed'
  const isFailedOrTerminated = version.status === 'failed' || version.status === 'terminated'
  const hasLogs = isRunning || isCompleted || isFailedOrTerminated

  const logContent = hasLogs ? (
    <div>
      <Space style={{ marginBottom: 16 }}>
        {isRunning ? (
          <Tag color="blue">🔄 运行中</Tag>
        ) : (
          <Tag color="green">✓ 已结束</Tag>
        )}
        <Text type="secondary" style={{ fontSize: 13 }}>
          总日志数: {isRunning ? '加载中...' : '818'}
        </Text>
      </Space>
      <Card
        size="small"
        style={{ background: '#0f172a', borderRadius: 8, maxHeight: 400, overflow: 'auto' }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        {[
          '[2026-04-02 17:41:31,573] [INFO] Setting ds_accelerator to cuda',
          '[INFO] Process rank: 0, world size: 1, device: cuda:0, compute dtype: torch.bfloat16',
          '[INFO] Loading dataset custom_dataset.json...',
          '[INFO] Fine-tuning method: LoRA',
          '[INFO] trainable params: 18,464,768 || all params: 2,227,450,368 || trainable%: 0.829',
          '[INFO] Running training...',
          '[INFO] ***** Running training *****',
          '[INFO] Num examples = 45, Num Epochs = 3',
          '[INFO] Total train batch size = 2, Total optimization steps = 6',
          '[INFO] Saving model checkpoint to /data/models/finetuned_models/',
          '[INFO] Training completed.',
          'Training completed. Do not forget to share your model.',
        ].map((line, i) => (
          <div key={i} style={{ color: '#a5f3fc', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.7 }}>
            {line}
          </div>
        ))}
      </Card>
    </div>
  ) : (
    <Card
      size="small"
      style={{ border: '1px dashed #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: '48px 0' }}
      styles={{ body: { textAlign: 'center' } }}
    >
      <FileTextOutlined style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 12 }} />
      <Title level={5} style={{ color: '#94a3b8', margin: '0 0 6px' }}>暂无训练日志</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {version.status === 'scheduled_pending'
          ? '训练已排定，等待定时启动'
          : version.status === 'starting'
          ? '训练正在启动中，请稍候'
          : '训练尚未开始，暂无日志'}
      </Text>
    </Card>
  )

  // ── 训练产物 Tab（始终展示，内容根据状态区分）──────────────────────────────────────
  const hasOutput = isCompleted || isFailedOrTerminated

  const outputContent = hasOutput ? (
    <div>
      <Title level={5} style={{ margin: '0 0 16px', color: '#0f172a' }}>模型输出路径</Title>
      <Card
        size="small"
        style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 24 }}
        bodyStyle={{ padding: '12px 16px' }}
      >
        <Text copyable style={{ fontFamily: 'monospace', fontSize: 12, color: '#475569' }}>
          {version.outputPath ?? '/data/models/finetuned_models/'}
        </Text>
      </Card>
      <Title level={5} style={{ margin: '0 0 16px', color: '#0f172a' }}>检查点</Title>
      <Table
        dataSource={[
          { step: 'checkpoint-6', loss: 2.4947, time: '--' },
        ]}
        rowKey="step"
        pagination={false}
        size="small"
        style={{ borderRadius: 12, overflow: 'hidden' }}
        columns={[
          { title: 'Step',    dataIndex: 'step',  key: 'step',  render: (t: string) => <Text code style={{ fontSize: 12 }}>{t}</Text> },
          { title: 'Loss',    dataIndex: 'loss',  key: 'loss',  render: (v: number) => <Text>{v.toFixed(4)}</Text> },
          { title: '保存时间', dataIndex: 'time', key: 'time' },
        ]}
      />
    </div>
  ) : (
    <Card
      size="small"
      style={{ border: '1px dashed #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: '48px 0' }}
      styles={{ body: { textAlign: 'center' } }}
    >
      <FolderOutlined style={{ fontSize: 32, color: '#cbd5e1', marginBottom: 12 }} />
      <Title level={5} style={{ color: '#94a3b8', margin: '0 0 6px' }}>暂无训练产物</Title>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {isRunning
          ? '训练进行中，产物将在完成后展示'
          : '训练尚未开始，暂无产物'}
      </Text>
    </Card>
  )

  // 主 Tab items（根据状态动态过滤）
  const tabItems = [
    {
      key: 'dataset',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <DatabaseOutlined />
          数据集
        </span>
      ),
      children: datasetContent,
    },
    {
      key: 'gpu',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ThunderboltOutlined />
          显卡资源配置
        </span>
      ),
      children: gpuContent,
    },
    {
      key: 'params',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SettingOutlined />
          参数配置
        </span>
      ),
      children: (
        <Tabs
          activeKey={activeParamTab}
          onChange={setActiveParamTab}
          items={paramTabItems}
          style={{ marginTop: 8 }}
        />
      ),
    },
    {
      key: 'metrics',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <BarChartOutlined />
          指标
        </span>
      ),
      children: metricsContent,
    },
    {
      key: 'logs',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileTextOutlined />
          训练日志
        </span>
      ),
      children: logContent,
    },
    {
      key: 'output',
      label: (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FolderOutlined />
          训练产物
        </span>
      ),
      children: outputContent,
    },
  ]

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: '28px 32px', minHeight: '100%' }}>
      {/* 返回 + 标题栏 */}
      <div style={{ marginBottom: 28, opacity: 0, animation: 'fadeInUp 0.5s ease forwards' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={handleBack}
          style={{ borderRadius: 8, marginBottom: 16, height: 36, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          返回
        </Button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div
            style={{
              width: 44,
              height: 44,
              background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(79,70,229,0.35)',
            }}
          >
            <DatabaseOutlined style={{ color: '#fff', fontSize: 20 }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Title level={3} style={{ margin: 0, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
                {task.name}
              </Title>
              <Tag
                style={{
                  background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  padding: '2px 10px',
                }}
              >
                {version.version}
              </Tag>
              <Tag
                style={{
                  background: statusCfg.bg,
                  border: `1px solid ${statusCfg.border}`,
                  color: statusCfg.color,
                  borderRadius: 6,
                  fontWeight: 600,
                  fontSize: 12,
                }}
              >
                {statusCfg.label}
              </Tag>
            </div>
            <Text style={{ color: '#64748b', fontSize: 13 }}>{version.description}</Text>
          </div>
          <Space style={{ marginLeft: 'auto' }} wrap>
            <Button icon={<ReloadOutlined />} style={{ borderRadius: 8, height: 36, display: 'flex', alignItems: 'center', gap: 4 }}>
              刷新
            </Button>
            {actionFlags.canTerminate && (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleTerminate}
                style={{ borderRadius: 8, height: 36 }}
              >
                终止
              </Button>
            )}
            {actionFlags.showTerminateBlocked && (
              <Button
                danger
                icon={<StopOutlined />}
                onClick={() => message.warning(TERMINATE_BLOCKED_MESSAGE)}
                style={{ borderRadius: 8, height: 36 }}
              >
                终止
              </Button>
            )}
            {actionFlags.canResubmit && (
              <Button
                type="primary"
                icon={<RedoOutlined />}
                onClick={handleResubmit}
                style={{ borderRadius: 8, height: 36 }}
              >
                重新提交
              </Button>
            )}
            {actionFlags.canEdit && (
              <Button icon={<EditOutlined />} onClick={handleEdit} style={{ borderRadius: 8, height: 36 }}>
                编辑
              </Button>
            )}
            {actionFlags.canDelete && (
              <Button danger icon={<DeleteOutlined />} onClick={handleDelete} style={{ borderRadius: 8, height: 36 }}>
                删除
              </Button>
            )}
          </Space>
        </div>
      </div>

      {/* 任务基本信息卡片 */}
      <Card
        style={{ marginBottom: 24, borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: 0 } }}
      >
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 18, background: 'linear-gradient(180deg, #2563eb 0%, #3b82f6 100%)', borderRadius: 2 }} />
          <Text strong style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>任务基本信息</Text>
        </div>
        <Descriptions
          bordered
          column={4}
          size="small"
          style={{ border: 'none', borderRadius: 0 }}
        >
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>版本号</span>}>
            <Tag
              style={{
                background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                border: 'none',
                color: '#fff',
                borderRadius: 6,
                fontWeight: 600,
              }}
            >
              {version.version}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>运行状态</span>}>
            <Tag
              style={{
                background: statusCfg.bg,
                border: `1px solid ${statusCfg.border}`,
                color: statusCfg.color,
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 12,
              }}
            >
              {statusCfg.label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>开始时间</span>}>
            <Text style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>{version.startTime ?? '--'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>结束时间</span>}>
            <Text style={{ color: '#475569', fontFamily: 'monospace', fontSize: 13 }}>{version.endTime ?? '--'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>训练方法</span>}>
            <Text style={{ color: '#0f172a', fontWeight: 500, fontSize: 13 }}>
              {TRAINING_METHOD_LABELS[version.trainingMethod]}
            </Text>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>微调类型</span>}>
            <span style={{
              fontSize: 12,
              color: version.fineTuneType === 'lora' ? '#7c3aed' : '#2563eb',
              background: version.fineTuneType === 'lora' ? 'rgba(124,58,237,0.08)' : 'rgba(37,99,235,0.08)',
              padding: '4px 10px',
              borderRadius: 4,
              fontWeight: 500,
            }}>
              {version.fineTuneType === 'lora' ? 'Lora微调' : '全参微调'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>模型来源</span>}>
            <Space orientation="vertical" size={6} style={{ width: '100%' }}>
              <Tag
                style={{
                  margin: 0,
                  borderRadius: 4,
                  fontWeight: 600,
                  fontSize: 12,
                  border: 'none',
                  background: version.modelSource === 'trained' ? 'rgba(245,158,11,0.12)' : 'rgba(37,99,235,0.1)',
                  color: version.modelSource === 'trained' ? '#b45309' : '#2563eb',
                }}
              >
                {version.modelSource === 'trained' ? '我的模型' : '基础模型'}
              </Tag>
              <Tag
                style={{
                  margin: 0,
                  background: 'rgba(79, 70, 229, 0.08)',
                  border: '1px solid rgba(79, 70, 229, 0.15)',
                  color: '#4f46e5',
                  borderRadius: 6,
                  fontWeight: 500,
                  fontSize: 12,
                }}
              >
                {version.baseModel}
              </Tag>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>任务描述</span>}>
            <Text style={{ color: '#475569' }}>{version.taskDescription || '--'}</Text>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600, background: '#f8fafc', padding: '12px 16px', display: 'block' }}>运行时长</span>}>
            <Text style={{ color: '#475569', fontFamily: 'monospace' }}>{version.runtime ?? '--'}</Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Tab导航 + 内容 */}
      <Card
        style={{ borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
        styles={{ body: { padding: '24px' } }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
        />
      </Card>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(15px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}

export default VersionDetail
