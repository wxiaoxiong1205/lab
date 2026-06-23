import type { FormInstance } from 'antd/es/form'
import type { NamePath } from 'antd/es/form/interface'

type MessageApi = {
  warning: (content: string) => unknown
}

type FieldError = {
  name: NamePath
  errors?: string[]
}

type ValidateError = {
  errorFields?: FieldError[]
}

function getFirstError(error: unknown): FieldError | undefined {
  const errorFields = (error as ValidateError | undefined)?.errorFields

  return Array.isArray(errorFields) ? errorFields[0] : undefined
}

function getNamePathKey(name: NamePath): string {
  return Array.isArray(name) ? name.map(String).join('.') : String(name)
}

function getFieldId(name: NamePath): string {
  return Array.isArray(name) ? name.map(String).join('_') : String(name)
}

function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value)
  }

  return value.replace(/["\\]/g, '\\$&')
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect()

  return rect.width > 0 && rect.height > 0
}

function focusFirstControl(target: Element) {
  const control = target.querySelector<HTMLElement>(
    'input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), .ant-select-selector, button:not([disabled])',
  )

  try {
    control?.focus?.({ preventScroll: true })
  } catch {
    control?.focus?.()
  }
}

function withInstantDocumentScroll(action: () => void) {
  const htmlScrollBehavior = document.documentElement.style.scrollBehavior
  const bodyScrollBehavior = document.body.style.scrollBehavior

  document.documentElement.style.scrollBehavior = 'auto'
  document.body.style.scrollBehavior = 'auto'

  try {
    action()
  } finally {
    document.documentElement.style.scrollBehavior = htmlScrollBehavior
    document.body.style.scrollBehavior = bodyScrollBehavior
  }
}

function scrollElementToCenter(target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  const targetDocumentTop = rect.top + window.scrollY - window.innerHeight / 2 + rect.height / 2

  withInstantDocumentScroll(() => {
    window.scrollTo({ top: Math.max(targetDocumentTop, 0), behavior: 'auto' })
  })

  let parent = target.parentElement

  while (parent) {
    if (parent === document.body || parent === document.documentElement) {
      break
    }

    if (parent.scrollHeight > parent.clientHeight + 4) {
      const latestRect = target.getBoundingClientRect()
      const parentRect = parent.getBoundingClientRect()
      const targetTopInParent = latestRect.top - parentRect.top + parent.scrollTop
      const nextScrollTop = targetTopInParent - parent.clientHeight / 2 + latestRect.height / 2

      parent.scrollTo({ top: Math.max(nextScrollTop, 0), behavior: 'auto' })
    }

    parent = parent.parentElement
  }
}

function findFieldTarget(fieldName: NamePath): HTMLElement | null {
  const anchorKey = cssEscape(getNamePathKey(fieldName))
  const fieldId = cssEscape(getFieldId(fieldName))
  const candidates = [
    `[data-form-error-anchor="${anchorKey}"]`,
    `#${fieldId}`,
    `label[for="${fieldId}"]`,
  ]

  for (const selector of candidates) {
    const element = document.querySelector<HTMLElement>(selector)
    const target = element?.closest<HTMLElement>('.ant-form-item') ?? element

    if (target && isVisible(target)) {
      return target
    }
  }

  return null
}

function scrollFirstRenderedErrorIntoView(fieldName?: NamePath) {
  const fieldTarget = fieldName ? findFieldTarget(fieldName) : null
  const errorItem = fieldTarget
    ?? Array.from(document.querySelectorAll<HTMLElement>('.ant-form-item-has-error'))
    .find(isVisible)

  if (!errorItem) {
    return
  }

  withInstantDocumentScroll(() => {
    errorItem.scrollIntoView({ behavior: 'auto', block: 'center', inline: 'nearest' })
    scrollElementToCenter(errorItem)
  })
  errorItem.classList.add('lab-form-error-focus')
  window.setTimeout(() => errorItem.classList.remove('lab-form-error-focus'), 1200)
  focusFirstControl(errorItem)
}

function scheduleErrorScroll(form: FormInstance, fieldName: NamePath) {
  const scroll = () => {
    try {
      form.scrollToField(fieldName, { behavior: 'auto', block: 'center' })
      ;(form as FormInstance & { focusField?: (name: NamePath) => void }).focusField?.(fieldName)
    } catch {
      // Some custom controls do not expose a native field id; fall back to the rendered error item.
    }

    scrollFirstRenderedErrorIntoView(fieldName)
  }

  window.setTimeout(scroll)
  window.setTimeout(scroll, 180)
  window.setTimeout(scroll, 420)
  window.setTimeout(scroll, 800)
}

export function scrollToFirstFormError(form: FormInstance, error: unknown, messageApi?: MessageApi): boolean {
  const firstError = getFirstError(error)

  if (!firstError) {
    return false
  }

  scheduleErrorScroll(form, firstError.name)

  const firstMessage = firstError.errors?.find(Boolean)
  messageApi?.warning(firstMessage ? `请完善必填项：${firstMessage}` : '请完善必填项后再提交')

  return true
}

export async function validateFieldsAndScroll<T = unknown>(
  form: FormInstance,
  messageApi?: MessageApi,
): Promise<T | null> {
  try {
    return await form.validateFields() as T
  } catch (error) {
    scrollToFirstFormError(form, error, messageApi)
    return null
  }
}
