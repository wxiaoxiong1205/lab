export type EvaluationType = 'auto' | 'benchmark' | 'manual'

export interface EvaluationResultData {
  key: string
  sequence: number
  prompt: string
  system?: string
  model_name?: string
  response: string
  modelResponse: string
  negativePrompt?: string
  metadata?: Record<string, unknown>
  generatedImages?: string[]
  referenceImages?: string[]
  reason: string
  scores: { [key: string]: number | null }
  metricReasons: { [key: string]: string }
  metricScores: { [key: string]: number }
  metricScoreMaxs: { [key: string]: number }
  item_index?: number
  images?: string[]
  baseUrl?: string
  rawFields?: Record<string, string>
}
