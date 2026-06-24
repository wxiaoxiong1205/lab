import React, { useState } from 'react'
import clsx from 'clsx'
import { ThemeClassNames } from '@docusaurus/theme-common'
import { isActiveSidebarItem } from '@docusaurus/theme-common/internal'
import Link from '@docusaurus/Link'
import isInternalUrl from '@docusaurus/isInternalUrl'
import IconExternalLink from '@theme/Icon/ExternalLink'
import markdownDocuments from '@site/src/config/doc-markdown.generated.json'
import styles from './styles.module.css'

function downloadMarkdown(docId) {
  const documentData = markdownDocuments[docId]
  if (!documentData) return

  const blob = new Blob([documentData.markdown], {
    type: 'text/markdown;charset=utf-8'
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = documentData.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export default function DocSidebarItemLink({
  item,
  onItemClick,
  activePath,
  level,
  ...props
}) {
  const { href, label, className, autoAddBaseUrl, docId } = item
  const [open, setOpen] = useState(false)
  const isActive = isActiveSidebarItem(item, activePath)
  const isInternalLink = isInternalUrl(href)
  const canExport = Boolean(docId && markdownDocuments[docId])

  return (
    <li
      className={clsx(
        ThemeClassNames.docs.docSidebarItemLink,
        ThemeClassNames.docs.docSidebarItemLinkLevel(level),
        'menu__list-item',
        styles.sidebarItem,
        className
      )}
      key={label}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        className={clsx(
          'menu__link',
          !isInternalLink && styles.menuExternalLink,
          {
            'menu__link--active': isActive
          }
        )}
        autoAddBaseUrl={autoAddBaseUrl}
        aria-current={isActive ? 'page' : undefined}
        to={href}
        {...(isInternalLink && {
          onClick: onItemClick ? () => onItemClick(item) : undefined
        })}
        {...props}
      >
        {label}
        {!isInternalLink && <IconExternalLink />}
      </Link>

      {canExport && (
        <div
          className={styles.action}
          onMouseEnter={() => setOpen(true)}
        >
          <button
            type="button"
            className={styles.actionButton}
            aria-label={`${label} 操作`}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setOpen((value) => !value)
            }}
          >
            ⋮
          </button>
          {open && (
            <div className={styles.actionMenu}>
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  downloadMarkdown(docId)
                  setOpen(false)
                }}
              >
                导出为 md
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
