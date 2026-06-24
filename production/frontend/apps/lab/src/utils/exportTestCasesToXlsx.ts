import type { TestRun } from '../types'

/**
 * 导出测试用例为 Excel 文件（含摘要、指标、用例三表）
 * @param testRun 测试运行数据
 * @param statusFilter 状态过滤（all/success/failure）
 */
export async function exportTestCasesToXlsx(testRun: TestRun, statusFilter: string = 'all'): Promise<boolean> {
  try {
    // 直接在前端生成Excel文件，不需要后端API
    const XLSX = await import('xlsx')

    // 根据状态过滤测试用例
    let testCases = [...testRun.test_cases || []]
    if (statusFilter === 'success') {
      testCases = testCases.filter((testCase) => testCase.success === true)
    }
    else if (statusFilter === 'failure') {
      testCases = testCases.filter((testCase) => testCase.success === false)
    }

    // 转换测试用例数据为Excel友好格式
    const data = testCases.map((testCase) => {
      // 获取预期输出，检查所有可能的字段名
      const expectedOutput
        = testCase.expected_output
          || testCase.expectedOutput
          || testCase.ground_truth
          || ''

      // 提取评分数据
      const metricsData = testCase.metrics_data || testCase.metricsData || []
      // 尝试找到评分数据，假设评分字段为'score'或包含'score'的字段
      for (const metric of metricsData) {
        if (metric.name === 'score' || metric.key === 'score') {
          break
        }
        else if (metric.name?.toLowerCase().includes('score') || metric.key?.toLowerCase().includes('score')) {
          break
        }
      }

      // 创建基础数据对象
      const baseData: Record<string, string | number | undefined> = {
        ID: testCase.id,
        名称: testCase.name,
        状态: testCase.success ? '成功' : '失败',
        持续时间: typeof testCase.run_duration === 'number' ? `${testCase.run_duration.toFixed(2)}s` : '0s',
        类型: testCase.is_conversational ? '对话式' : '标准',
        输入: testCase.input,
        预期输出: expectedOutput,
        实际输出: testCase.actual_output || testCase.actualOutput || '',
        排序: testCase.order,
      }

      // 添加所有指标的分数和阈值到对象中
      metricsData.forEach((metric, index) => {
        const metricName = metric.name || `指标${index + 1}`
        const metricScore = typeof metric.score === 'number'
          ? metric.score.toFixed(2)
          : (typeof metric.value === 'number'
              ? metric.value.toFixed(2)
              : String(metric.score || metric.value || ''))

        const threshold = typeof metric.threshold === 'number'
          ? metric.threshold.toFixed(2) : String(metric.threshold || '')

        baseData[`${metricName}-分数`] = metricScore
        baseData[`${metricName}-阈值`] = threshold
      })

      return baseData
    })

    // 添加测试运行摘要信息
    const summaryData = [
      {
        ID: '',
        名称: '测试运行摘要',
        状态: '',
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '运行ID',
        状态: testRun.run_id,
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '模型',
        状态: testRun.model || '-',
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '数据集',
        状态: testRun.dataset || '-',
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '总测试用例数',
        状态: testRun.total_test_cases.toString(),
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '成功测试用例数',
        状态: testRun.successful_test_cases.toString(),
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '成功率',
        状态: `${((testRun.successful_test_cases / testRun.total_test_cases) * 100).toFixed(1)}%`,
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
      {
        ID: '',
        名称: '创建时间',
        状态: new Date(testRun.created_at).toLocaleString(),
        持续时间: '',
        类型: '',
        输入: '',
        预期输出: '',
        实际输出: '',
        排序: '',
      },
    ]

    // 创建工作簿和工作表
    const wb = XLSX.utils.book_new()

    // 摘要工作表
    const summaryWs = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, summaryWs, '测试运行摘要')

    // 创建指标摘要数据
    const allMetrics = new Map()
    const totalMetricCounts = new Map()
    const thresholds = new Map()

    // 收集所有指标数据及其平均值和阈值
    testCases.forEach((testCase) => {
      const metrics = testCase.metrics_data || testCase.metricsData || []
      metrics.forEach((metric) => {
        const name = metric.name || ''
        if (!name) return

        const score = typeof metric.score === 'number'
          ? metric.score
          : (typeof metric.value === 'number' ? metric.value : null)

        // 保存阈值
        if (metric.threshold !== undefined && !thresholds.has(name)) {
          thresholds.set(name, metric.threshold)
        }

        if (score !== null) {
          if (!allMetrics.has(name)) {
            allMetrics.set(name, score)
            totalMetricCounts.set(name, 1)
          }
          else {
            allMetrics.set(name, allMetrics.get(name) + score)
            totalMetricCounts.set(name, totalMetricCounts.get(name) + 1)
          }
        }
      })
    })

    // 计算平均值并创建指标摘要数据
    const metricsData = Array.from(allMetrics.keys()).map((metricName) => {
      const totalScore = allMetrics.get(metricName)
      const count = totalMetricCounts.get(metricName)
      const avgScore = count > 0 ? (totalScore / count).toFixed(2) : '0'
      const threshold = thresholds.has(metricName)
        ? (typeof thresholds.get(metricName) === 'number'
            ? thresholds.get(metricName).toFixed(2)
            : String(thresholds.get(metricName)))
        : ''

      return {
        指标名称: metricName,
        平均分数: avgScore,
        阈值: threshold,
        测试用例数: count,
      }
    })

    // 如果有指标数据，添加指标摘要工作表
    if (metricsData.length > 0) {
      const metricsWs = XLSX.utils.json_to_sheet(metricsData)
      XLSX.utils.book_append_sheet(wb, metricsWs, '指标摘要')
    }

    // 测试用例工作表
    const testCasesWs = XLSX.utils.json_to_sheet(data)
    XLSX.utils.book_append_sheet(wb, testCasesWs, '测试用例')

    // 导出Excel文件
    XLSX.writeFile(wb, `测试评估_${testRun.run_id}_${new Date().toISOString().replace(/:/g, '-')}.xlsx`)

    return true
  }
  catch (error) {
    console.error('Excel导出错误:', error)

    // 检查是否是xlsx模块导入错误
    if (error instanceof Error && error.message.includes('xlsx')) {
      throw new Error('导出Excel失败：请确保已安装xlsx库（npm install xlsx --legacy-peer-deps）')
    }

    // 其他错误
    throw new Error(`导出Excel失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}
