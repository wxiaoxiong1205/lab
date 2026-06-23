import { AlignmentType, Document, ExternalHyperlink, HeadingLevel, ImageRun, InternalHyperlink, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import { saveAs } from 'file-saver'
import type React from 'react'

/**
 * 从 SVG 元素导出图片（Base64）
 * @param svgElement SVG元素
 * @param width 图片宽度（像素）
 * @returns Promise<string> Base64图片数据
 */
async function svgToImage(svgElement: SVGElement, width: number): Promise<string | null> {
  try {
    // 克隆 SVG 元素，避免修改原始元素
    const clonedSvg = svgElement.cloneNode(true) as SVGElement

    // 获取原始尺寸
    const originalWidth = svgElement.getBoundingClientRect().width || parseInt(svgElement.getAttribute('width') || '0') || width
    const originalHeight = svgElement.getBoundingClientRect().height || parseInt(svgElement.getAttribute('height') || '0') || width * 0.6

    // 计算目标高度（保持宽高比）
    const height = Math.round((originalHeight / originalWidth) * width)

    // 设置 SVG 的尺寸属性
    clonedSvg.setAttribute('width', width.toString())
    clonedSvg.setAttribute('height', height.toString())
    clonedSvg.setAttribute('viewBox', `0 0 ${originalWidth} ${originalHeight}`)

    // 获取 SVG 的 XML 字符串
    const serializer = new XMLSerializer()
    const svgString = serializer.serializeToString(clonedSvg)

    // 创建 Data URL
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)

    // 将 SVG 转换为 Canvas，然后转换为图片
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')

          if (ctx) {
            // 设置白色背景
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, width, height)

            // 绘制 SVG
            ctx.drawImage(img, 0, 0, width, height)

            const dataUrl = canvas.toDataURL('image/png')
            URL.revokeObjectURL(url)
            resolve(dataUrl)
          }
          else {
            URL.revokeObjectURL(url)
            reject(new Error('无法创建 Canvas 上下文'))
          }
        }
        catch (error) {
          URL.revokeObjectURL(url)
          reject(error)
        }
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('SVG 图片加载失败'))
      }
      img.src = url
    })
  }
  catch (error) {
    console.error('SVG 转图片失败:', error)
    return null
  }
}

/**
 * 将图表元素转换为图片（Base64）
 * 优先使用 SVG 导出（recharts 图表），如果失败则回退到 html2canvas
 * @param element 图表DOM元素
 * @param width 图片宽度（像素）
 * @returns Promise<string> Base64图片数据
 */
export async function chartToImage(element: HTMLElement | null, width: number = 500): Promise<string | null> {
  if (!element) return null

  // 优先尝试从 SVG 导出（recharts 图表）
  const svgElement = element.querySelector('svg')
  if (svgElement) {
    try {
      const svgImage = await svgToImage(svgElement, width)
      if (svgImage) {
        return svgImage
      }
    }
    catch (error) {
      console.warn('SVG 导出失败，回退到 html2canvas:', error)
    }
  }

  // 回退到 html2canvas 方法
  try {
    // 动态导入 html2canvas
    const html2canvasModule = await import('html2canvas')
    // html2canvas 的默认导出可能是函数或模块对象
    const html2canvas = html2canvasModule.default || html2canvasModule

    // 类型断言，确保 html2canvas 是函数
    if (typeof html2canvas !== 'function') {
      throw new TypeError('html2canvas 未正确加载')
    }

    // 获取元素的完整尺寸（包括滚动区域）
    const scrollWidth = element.scrollWidth || element.offsetWidth
    const scrollHeight = element.scrollHeight || element.offsetHeight

    // 确保元素滚动到左上角，以便完整捕获内容
    const originalScrollTop = element.scrollTop
    const originalScrollLeft = element.scrollLeft
    element.scrollTop = 0
    element.scrollLeft = 0

    try {
      // 根据目标宽度动态计算scale，使用更高的scale来保证清晰度
      // 对于小尺寸图片，使用更高的scale值
      const baseScale = width <= 300 ? 6 : width <= 500 ? 4 : 3

      // 先捕获完整内容，使用高scale保证清晰度
      const fullCanvas = await (html2canvas as any)(element, {
        scale: baseScale,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollX: 0,
        scrollY: 0,
        windowWidth: scrollWidth,
        windowHeight: scrollHeight,
        allowTaint: false,
        logging: false,
      })

      // 如果实际宽度小于等于目标宽度，直接返回
      if (fullCanvas.width <= width) {
        return fullCanvas.toDataURL('image/png')
      }

      // 否则，按比例缩放
      const scale = width / fullCanvas.width
      const targetHeight = Math.round(fullCanvas.height * scale)

      // 使用分步缩放策略提高质量：先缩放到中间尺寸，再缩放到目标尺寸
      // 这样可以减少一次性大幅缩放带来的质量损失
      if (scale < 0.5) {
        // 如果缩放比例小于0.5，使用两步缩放
        const intermediateWidth = Math.round(fullCanvas.width * 0.7)
        const intermediateHeight = Math.round(fullCanvas.height * 0.7)

        // 第一步：缩放到中间尺寸
        const intermediateCanvas = document.createElement('canvas')
        intermediateCanvas.width = intermediateWidth
        intermediateCanvas.height = intermediateHeight
        const intermediateCtx = intermediateCanvas.getContext('2d')

        if (intermediateCtx) {
          intermediateCtx.imageSmoothingEnabled = true
          intermediateCtx.imageSmoothingQuality = 'high'
          intermediateCtx.drawImage(fullCanvas, 0, 0, intermediateWidth, intermediateHeight)

          // 第二步：缩放到最终尺寸
          const scaledCanvas = document.createElement('canvas')
          scaledCanvas.width = width
          scaledCanvas.height = targetHeight
          const finalCtx = scaledCanvas.getContext('2d')

          if (finalCtx) {
            finalCtx.imageSmoothingEnabled = true
            finalCtx.imageSmoothingQuality = 'high'
            finalCtx.drawImage(intermediateCanvas, 0, 0, width, targetHeight)
            return scaledCanvas.toDataURL('image/png')
          }
        }
      }

      // 单步缩放
      const scaledCanvas = document.createElement('canvas')
      scaledCanvas.width = width
      scaledCanvas.height = targetHeight
      const ctx = scaledCanvas.getContext('2d')

      if (ctx) {
        // 使用高质量缩放
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(fullCanvas, 0, 0, width, targetHeight)
        return scaledCanvas.toDataURL('image/png')
      }

      return fullCanvas.toDataURL('image/png')
    }
    finally {
      // 恢复原始滚动位置
      element.scrollTop = originalScrollTop
      element.scrollLeft = originalScrollLeft
    }
  }
  catch (error: any) {
    console.error('图表转图片失败:', error)
    if (error?.message?.includes('Failed to fetch') || error?.code === 'MODULE_NOT_FOUND' || error?.message?.includes('Cannot find module')) {
      throw new Error('html2canvas 未安装，请运行: pnpm add html2canvas')
    }
    return null
  }
}

// 计算方式映射
const CALCULATION_METHOD_MAP: { [key: string]: string } = {
  平均: 'average',
  最大: 'max',
  最小: 'min',
}

/**
 * 从报告数据生成图表数据
 */
function generateChartDataFromReport(reportData: any, calculationMethod: string, evaluationMethod?: string) {
  if (!reportData || !reportData.model_reports || reportData.model_reports.length === 0) {
    return {
      radarData: [],
      barData: [],
      multiRadarData: [],
      modelConfigs: [],
      modelNames: [],
      isComparison: false,
      maxValue: 100,
    }
  }

  // 根据评估方法过滤报告
  const filteredReports = evaluationMethod
    ? reportData.model_reports.filter(
        (report: any) => !report.evaluation_method || report.evaluation_method === evaluationMethod,
      )
    : reportData.model_reports

  if (filteredReports.length === 0) {
    return {
      radarData: [],
      barData: [],
      multiRadarData: [],
      modelConfigs: [],
      modelNames: [],
      isComparison: false,
      maxValue: 100,
    }
  }

  const apiMethod = CALCULATION_METHOD_MAP[calculationMethod] || 'average'

  // 计算所有 metric_summary 中的最大值
  let maxValue = 0
  filteredReports.forEach((report: any) => {
    const aggregativeMetric = report.aggregative_metrics?.find(
      (metric: any) => metric.calculation_method === apiMethod,
    )
    if (aggregativeMetric?.metric_summary) {
      const values = Object.values(aggregativeMetric.metric_summary)
        .map((item: any) => {
          return typeof item.percentage_score === 'number' && !isNaN(item.percentage_score)
            ? item.percentage_score
            : null
        })
        .filter((v): v is number => v !== null)
      if (values.length > 0) {
        const reportMax = Math.max(...values)
        maxValue = Math.max(maxValue, reportMax)
      }
    }
  })
  const domainMax = maxValue > 0 ? Math.max(10, Math.ceil(maxValue / 10) * 10) : 100

  const isComparison = reportData.evaluation_type === 'comparison' && filteredReports.length > 1

  if (isComparison) {
    // 收集所有指标名称
    const allMetricNames = new Set<string>()
    filteredReports.forEach((report: any) => {
      const aggregativeMetric = report.aggregative_metrics.find(
        (metric: any) => metric.calculation_method === apiMethod,
      )
      if (aggregativeMetric?.metric_summary) {
        Object.keys(aggregativeMetric.metric_summary).forEach((key) => allMetricNames.add(key))
      }
    })

    // 生成多模型对比数据格式
    const multiRadarData = Array.from(allMetricNames).map((metricName) => {
      const dataPoint: { subject: string, [key: string]: string | number } = {
        subject: metricName,
      }

      filteredReports.forEach((report: any, index: number) => {
        const aggregativeMetric = report.aggregative_metrics.find(
          (metric: any) => metric.calculation_method === apiMethod,
        )
        const metricData = aggregativeMetric?.metric_summary?.[metricName]
        const value = metricData?.percentage_score ?? 0
        const modelKey = `model${index + 1}`
        dataPoint[modelKey] = value
      })

      return dataPoint
    })

    // 生成模型配置
    const colors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2']
    const tagColors = ['blue', 'green', 'orange', 'red', 'purple', 'cyan']
    const modelConfigs = filteredReports.map((report: any, index: number) => ({
      key: `model${index + 1}`,
      name: report.model_name,
      color: colors[index % colors.length],
      tagColor: tagColors[index % tagColors.length],
    }))

    const barData = multiRadarData

    return {
      radarData: [],
      barData,
      multiRadarData,
      modelConfigs,
      modelNames: filteredReports.map((r: any) => r.model_name),
      isComparison: true,
      maxValue: domainMax,
    }
  }
  else {
    // 单个评估或只有一个模型的情况
    const currentReport = filteredReports[0]

    if (!currentReport.aggregative_metrics || currentReport.aggregative_metrics.length === 0) {
      return {
        radarData: [],
        barData: [],
        multiRadarData: [],
        modelConfigs: [],
        modelNames: [currentReport.model_name],
        isComparison: false,
        maxValue: domainMax,
      }
    }

    const aggregativeMetric = currentReport.aggregative_metrics.find(
      (metric: any) => metric.calculation_method === apiMethod,
    )

    if (!aggregativeMetric || !aggregativeMetric.metric_summary) {
      return {
        radarData: [],
        barData: [],
        multiRadarData: [],
        modelConfigs: [],
        modelNames: [currentReport.model_name],
        isComparison: false,
        maxValue: domainMax,
      }
    }

    // 将指标汇总转换为图表数据格式
    const metricSummary = aggregativeMetric.metric_summary
    const chartData = Object.entries(metricSummary).map(([key, item]: [string, any]) => {
      return {
        name: key,
        value: item.percentage_score ?? 0,
      }
    })

    return {
      radarData: chartData,
      barData: chartData,
      multiRadarData: [],
      modelConfigs: [],
      modelNames: [currentReport.model_name],
      isComparison: false,
      maxValue: domainMax,
    }
  }
}

/**
 * 导出评估报告为Word文档
 * @param options 导出选项
 */
export async function exportEvaluationReportToWord(options: {
  taskDetail: any
  reportData: any
  radarData: any[]
  barData: any[]
  multiRadarData: any[]
  modelConfigs: any[]
  modelNames: string[]
  isComparison: boolean
  maxValue: number
  calculationMethod: string
  evaluationType: string
  radarChartRef?: React.RefObject<HTMLDivElement>
  barChartRef?: React.RefObject<HTMLDivElement>
  refereeReportData?: any
  basicMetricReportData?: any
  refereeRadarImage?: string | null
  refereeBarImage?: string | null
  basicMetricRadarImage?: string | null
  basicMetricBarImage?: string | null
}) {
  const {
    taskDetail,
    reportData,
    radarData,
    barData,
    multiRadarData,
    modelConfigs,
    modelNames,
    isComparison,
    maxValue,
    calculationMethod,
    evaluationType,
    radarChartRef,
    barChartRef,
    refereeReportData,
    basicMetricReportData,
    refereeRadarImage: providedRefereeRadarImage,
    refereeBarImage: providedRefereeBarImage,
    basicMetricRadarImage: providedBasicMetricRadarImage,
    basicMetricBarImage: providedBasicMetricBarImage,
  } = options

  // 判断是否需要平铺展示两组数据
  const hasBothReports = refereeReportData && basicMetricReportData
    && taskDetail?.evaluation_method === 'all' && evaluationType === 'auto'

  try {
    const children: (Paragraph | Table)[] = []

    // 如果存在两组数据，分别为每组生成图表数据
    let refereeChartData: any = null
    let basicMetricChartData: any = null

    if (hasBothReports) {
      refereeChartData = generateChartDataFromReport(refereeReportData, calculationMethod, 'referee')
      basicMetricChartData = generateChartDataFromReport(basicMetricReportData, calculationMethod, 'basic_metric')
    }

    // 转换图表为图片
    let radarImage: string | null = null
    let barImage: string | null = null
    let refereeRadarImage: string | null = null
    let refereeBarImage: string | null = null
    let basicMetricRadarImage: string | null = null
    let basicMetricBarImage: string | null = null

    if (hasBothReports) {
      // 使用传入的图表图片，如果没有则尝试从DOM生成
      refereeRadarImage = providedRefereeRadarImage || (radarChartRef?.current ? await chartToImage(radarChartRef.current, 450) : null)
      refereeBarImage = providedRefereeBarImage || (barChartRef?.current ? await chartToImage(barChartRef.current, 600) : null)
      basicMetricRadarImage = providedBasicMetricRadarImage || (radarChartRef?.current ? await chartToImage(radarChartRef.current, 450) : null)
      basicMetricBarImage = providedBasicMetricBarImage || (barChartRef?.current ? await chartToImage(barChartRef.current, 600) : null)
    }
    else {
      // 单组数据的情况
      if (radarChartRef?.current) {
        radarImage = await chartToImage(radarChartRef.current, 450)
      }
      if (barChartRef?.current) {
        barImage = await chartToImage(barChartRef.current, 600)
      }
    }

    // 标题
    children.push(
      new Paragraph({
        text: '评估报告',
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    )

    // 基本信息
    children.push(
      new Paragraph({
        text: '基本信息',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 200 },
      }),
    )

    // 基本信息表格
    const basicInfoRows: TableRow[] = []

    const addInfoRow = (label: string, value: string) => {
      basicInfoRows.push(
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ text: label, alignment: AlignmentType.LEFT })],
              width: { size: 30, type: WidthType.PERCENTAGE },
            }),
            new TableCell({
              children: [new Paragraph({ text: value || '-', alignment: AlignmentType.LEFT })],
              width: { size: 70, type: WidthType.PERCENTAGE },
            }),
          ],
        }),
      )
    }

    addInfoRow('任务名称', taskDetail?.name || '-')

    const modelNamesStr = taskDetail?.dataset_model_relations
      ?.map((r: any) => Object.prototype.hasOwnProperty.call(r, 'evaluated_model_name') ? r.evaluated_model_name : null)
      .filter((n: any): n is string => n !== null && n !== undefined && n !== '')
      .join('，') || '-'
    addInfoRow('待评估模型/服务', modelNamesStr)

    const datasetNamesStr = taskDetail?.dataset_model_relations
      ?.map((r: any) => {
        const obj = r as any & { inference_result_dataset_name?: string }
        return obj.inference_result_dataset_name
      })
      .filter((n: any): n is string => typeof n === 'string' && n !== '')
      .join('，') || '-'
    addInfoRow('推理结果集', datasetNamesStr)

    const formatEvaluationType = (type?: string) => {
      if (type === 'single') return '单个评估'
      if (type === 'comparison') return '对比评估'
      return '-'
    }

    const formatEvaluationMethod = (method?: string) => {
      if (!method) return '-'
      const methodMap: { [key: string]: string } = {
        referee: '裁判员评估',
        basic_metric: '基础指标评估',
        all: '全部',
      }
      return methodMap[method] || method
    }

    addInfoRow('评估类型', formatEvaluationType(taskDetail?.evaluation_type))
    addInfoRow(
      '评估类别',
      ['text-generation', 'business'].includes(taskDetail?.dataset_type || '') ? '文本生成' : '图像理解',
    )
    addInfoRow('评估方法', formatEvaluationMethod(taskDetail?.evaluation_method))

    if (taskDetail?.evaluation_method === 'referee' || taskDetail?.evaluation_method === 'all') {
      const refereeInfo = taskDetail?.referee_model_id
        ? `${taskDetail.referee_model_name || ''}/${taskDetail.referee_type === 'model' ? '离线' : '在线'}`
        : '-'
      addInfoRow('裁判员模型/服务', refereeInfo)
    }

    addInfoRow('创建人', taskDetail?.created_by || '-')
    addInfoRow(
      '创建时间',
      taskDetail?.created_at
        ? new Date(taskDetail.created_at).toLocaleString('zh-CN')
        : '-',
    )
    addInfoRow('描述', taskDetail?.description || '-')

    if (evaluationType === 'manual' && taskDetail?.sampling_rate != null) {
      addInfoRow('采样率', `${taskDetail.sampling_rate}%`)
    }

    children.push(
      new Table({
        rows: basicInfoRows,
        width: { size: 100, type: WidthType.PERCENTAGE },
      }),
    )

    // Prompt
    if (taskDetail?.evaluation_prompt_config?.prompt_template) {
      children.push(
        new Paragraph({
          text: 'Prompt',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 400, after: 200 },
        }),
      )

      children.push(
        new Paragraph({
          text: taskDetail.evaluation_prompt_config.prompt_template,
          spacing: { after: 400 },
        }),
      )
    }

    // 报告结果
    if (hasBothReports) {
      // 平铺展示两组数据

      // 第一组：裁判员评估
      if (refereeChartData && (refereeChartData.isComparison ? refereeChartData.multiRadarData.length > 0 : refereeChartData.radarData.length > 0)) {
        children.push(
          new Paragraph({
            text: '报告结果 - 裁判员评估',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        children.push(
          new Paragraph({
            text: `计算方式：${calculationMethod}`,
            spacing: { after: 200 },
          }),
        )

        // 雷达图
        if (refereeRadarImage) {
          children.push(
            new Paragraph({
              text: '评分维度雷达图',
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 200 },
            }),
          )

          const imageData = refereeRadarImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 450,
                    height: 300,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }

        // 数据明细表格
        children.push(
          new Paragraph({
            text: '评分数据明细（得分以百分比形式展示，具体计算方式：得分/最大值）',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 200 },
          }),
        )

        const refereeDataTableRows: TableRow[] = []

        if (refereeChartData.isComparison) {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              ...refereeChartData.modelConfigs.map((config: any) =>
                new TableCell({
                  children: [new Paragraph({ text: config.name })],
                  width: { size: 75 / refereeChartData.modelConfigs.length, type: WidthType.PERCENTAGE },
                }),
              ),
            ],
          })
          refereeDataTableRows.push(headerRow)

          refereeChartData.multiRadarData.forEach((item: any) => {
            refereeDataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.subject })],
                  }),
                  ...refereeChartData.modelConfigs.map((config: any) => {
                    const value = item[config.key]
                    return new TableCell({
                      children: [
                        new Paragraph({
                          text: value !== undefined && value !== null ? value.toFixed(2) : '-',
                        }),
                      ],
                    })
                  }),
                ],
              }),
            )
          })
        }
        else {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ text: refereeChartData.modelNames[0] || '' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
            ],
          })
          refereeDataTableRows.push(headerRow)

          refereeChartData.radarData.forEach((item: any) => {
            refereeDataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.name })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: item.value !== undefined && item.value !== null ? item.value.toFixed(2) : '-',
                      }),
                    ],
                  }),
                ],
              }),
            )
          })
        }

        children.push(
          new Table({
            rows: refereeDataTableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        )
      }

      // 评分对比柱状图 - 裁判员评估
      if (refereeChartData && refereeChartData.barData.length > 0) {
        children.push(
          new Paragraph({
            text: '评分对比柱状图 - 裁判员评估',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        if (refereeChartData.modelNames.length > 0) {
          children.push(
            new Paragraph({
              text: `模型：${refereeChartData.modelNames.join('、')}`,
              spacing: { after: 200 },
            }),
          )
        }

        if (refereeBarImage) {
          const imageData = refereeBarImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 600,
                    height: 400,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }
      }

      // 第二组：基础指标评估
      if (basicMetricChartData && (basicMetricChartData.isComparison ? basicMetricChartData.multiRadarData.length > 0 : basicMetricChartData.radarData.length > 0)) {
        children.push(
          new Paragraph({
            text: '报告结果 - 基础指标评估',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        children.push(
          new Paragraph({
            text: `计算方式：${calculationMethod}`,
            spacing: { after: 200 },
          }),
        )

        // 雷达图
        if (basicMetricRadarImage) {
          children.push(
            new Paragraph({
              text: '评分维度雷达图',
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 200 },
            }),
          )

          const imageData = basicMetricRadarImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 450,
                    height: 300,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }

        // 数据明细表格
        children.push(
          new Paragraph({
            text: '评分数据明细（得分以百分比形式展示，具体计算方式：得分/最大值）',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 200 },
          }),
        )

        const basicMetricDataTableRows: TableRow[] = []

        if (basicMetricChartData.isComparison) {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              ...basicMetricChartData.modelConfigs.map((config: any) =>
                new TableCell({
                  children: [new Paragraph({ text: config.name })],
                  width: { size: 75 / basicMetricChartData.modelConfigs.length, type: WidthType.PERCENTAGE },
                }),
              ),
            ],
          })
          basicMetricDataTableRows.push(headerRow)

          basicMetricChartData.multiRadarData.forEach((item: any) => {
            basicMetricDataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.subject })],
                  }),
                  ...basicMetricChartData.modelConfigs.map((config: any) => {
                    const value = item[config.key]
                    return new TableCell({
                      children: [
                        new Paragraph({
                          text: value !== undefined && value !== null ? value.toFixed(2) : '-',
                        }),
                      ],
                    })
                  }),
                ],
              }),
            )
          })
        }
        else {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ text: basicMetricChartData.modelNames[0] || '' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
            ],
          })
          basicMetricDataTableRows.push(headerRow)

          basicMetricChartData.radarData.forEach((item: any) => {
            basicMetricDataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.name })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: item.value !== undefined && item.value !== null ? item.value.toFixed(2) : '-',
                      }),
                    ],
                  }),
                ],
              }),
            )
          })
        }

        children.push(
          new Table({
            rows: basicMetricDataTableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        )
      }

      // 评分对比柱状图 - 基础指标评估
      if (basicMetricChartData && basicMetricChartData.barData.length > 0) {
        children.push(
          new Paragraph({
            text: '评分对比柱状图 - 基础指标评估',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        if (basicMetricChartData.modelNames.length > 0) {
          children.push(
            new Paragraph({
              text: `模型：${basicMetricChartData.modelNames.join('、')}`,
              spacing: { after: 200 },
            }),
          )
        }

        if (basicMetricBarImage) {
          const imageData = basicMetricBarImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 600,
                    height: 400,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }
      }
    }
    else {
      // 单组数据的情况（原有逻辑）
      if ((isComparison ? multiRadarData.length > 0 : radarData.length > 0)) {
        children.push(
          new Paragraph({
            text: '报告结果',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        children.push(
          new Paragraph({
            text: `计算方式：${calculationMethod}`,
            spacing: { after: 200 },
          }),
        )

        // 雷达图
        if (radarImage) {
          children.push(
            new Paragraph({
              text: '评分维度雷达图',
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200, after: 200 },
            }),
          )

          const imageData = radarImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 450,
                    height: 300,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }

        // 数据明细表格
        children.push(
          new Paragraph({
            text: '评分数据明细（得分以百分比形式展示，具体计算方式：得分/最大值）',
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 200 },
          }),
        )

        const dataTableRows: TableRow[] = []

        if (isComparison) {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 25, type: WidthType.PERCENTAGE },
              }),
              ...modelConfigs.map((config) =>
                new TableCell({
                  children: [new Paragraph({ text: config.name })],
                  width: { size: 75 / modelConfigs.length, type: WidthType.PERCENTAGE },
                }),
              ),
            ],
          })
          dataTableRows.push(headerRow)

          multiRadarData.forEach((item) => {
            dataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.subject })],
                  }),
                  ...modelConfigs.map((config) => {
                    const value = item[config.key]
                    return new TableCell({
                      children: [
                        new Paragraph({
                          text: value !== undefined && value !== null ? value.toFixed(2) : '-',
                        }),
                      ],
                    })
                  }),
                ],
              }),
            )
          })
        }
        else {
          const headerRow = new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ text: '评估指标' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
              new TableCell({
                children: [new Paragraph({ text: modelNames[0] || '' })],
                width: { size: 50, type: WidthType.PERCENTAGE },
              }),
            ],
          })
          dataTableRows.push(headerRow)

          radarData.forEach((item) => {
            dataTableRows.push(
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph({ text: item.name })],
                  }),
                  new TableCell({
                    children: [
                      new Paragraph({
                        text: item.value !== undefined && item.value !== null ? item.value.toFixed(2) : '-',
                      }),
                    ],
                  }),
                ],
              }),
            )
          })
        }

        children.push(
          new Table({
            rows: dataTableRows,
            width: { size: 100, type: WidthType.PERCENTAGE },
          }),
        )
      }

      // 评分对比柱状图
      if (barData.length > 0) {
        children.push(
          new Paragraph({
            text: '评分对比柱状图',
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400, after: 200 },
          }),
        )

        if (modelNames.length > 0) {
          children.push(
            new Paragraph({
              text: `模型：${modelNames.join('、')}`,
              spacing: { after: 200 },
            }),
          )
        }

        if (barImage) {
          const imageData = barImage.split(',')[1]
          const imageBuffer = Uint8Array.from(atob(imageData), (c) => c.charCodeAt(0))

          children.push(
            new Paragraph({
              children: [
                new ImageRun({
                  data: imageBuffer,
                  transformation: {
                    width: 600,
                    height: 400,
                  },
                  type: 'png',
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),
          )
        }
      }
    }

    // 创建文档
    const doc = new Document({
      sections: [
        {
          children,
        },
      ],
    })

    // 生成并下载
    const blob = await Packer.toBlob(doc)
    const fileName = `评估报告_${taskDetail?.name || '报告'}_${new Date().toISOString().split('T')[0]}.docx`
    saveAs(blob, fileName)
  }
  catch (error) {
    console.error('导出Word失败:', error)
    throw error
  }
}
