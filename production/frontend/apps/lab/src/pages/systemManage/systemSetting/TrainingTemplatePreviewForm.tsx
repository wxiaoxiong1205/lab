import { DynamicFieldForm } from '@/components/common/DynamicFieldForm'
import type { AdvancedTemplateFieldGroup } from '@/services/advancedTemplateService'

export function normalizeTrainingTemplateYamlInput(input: string) {
  const trimmed = input.trim()
  const unwrapped = /^(['"])[\s\S]*\1$/.test(trimmed)
    ? trimmed.slice(1, -1)
    : input

  if (!unwrapped.includes('\\n') && !unwrapped.includes('\\"'))
    return unwrapped

  return unwrapped
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

export function TrainingTemplatePreviewForm({
  fieldGroups,
}: {
  fieldGroups?: AdvancedTemplateFieldGroup[] | null
}) {
  return <DynamicFieldForm fieldGroups={fieldGroups} />
}
