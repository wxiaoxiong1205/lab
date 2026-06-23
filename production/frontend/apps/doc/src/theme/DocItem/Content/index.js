import React, { useEffect } from 'react'
import { useLocation } from '@docusaurus/router'
import clsx from 'clsx'
import { ThemeClassNames } from '@docusaurus/theme-common'
import MDXContent from '@theme/MDXContent'

const HEADING_SELECTOR = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'

function buildSectionNumbers(headings) {
  const levels = headings.map((heading) => Number(heading.tagName.slice(1)))
  const baseLevel = Math.min(...levels)
  const counters = []
  const numbers = new Map()

  headings.forEach((heading) => {
    const level = Number(heading.tagName.slice(1))
    const depth = Math.max(1, level - baseLevel + 1)

    while (counters.length < depth - 1) counters.push(1)
    if (counters.length < depth) counters.push(0)
    counters.length = depth
    counters[depth - 1] += 1

    numbers.set(heading.id, counters.join('.'))
  })

  return numbers
}

function applySectionNumbers() {
  const content = document.querySelector('.theme-doc-markdown')
  if (!content) return

  const headings = Array.from(content.querySelectorAll(HEADING_SELECTOR))
  document
    .querySelectorAll('.numbered-heading, .numbered-toc-link')
    .forEach((element) => {
      element.classList.remove('numbered-heading', 'numbered-toc-link')
      element.removeAttribute('data-section-number')
    })

  if (headings.length === 0) return

  const numbers = buildSectionNumbers(headings)

  headings.forEach((heading) => {
    const sectionNumber = numbers.get(heading.id)
    if (!sectionNumber) return
    heading.classList.add('numbered-heading')
    heading.setAttribute('data-section-number', sectionNumber)
  })

  document
    .querySelectorAll('.table-of-contents__link[href^="#"]')
    .forEach((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1))
      const sectionNumber = numbers.get(id)
      if (!sectionNumber) return
      link.classList.add('numbered-toc-link')
      link.setAttribute('data-section-number', sectionNumber)
      link.setAttribute('title', link.textContent.trim())
    })
}

function applySidebarLinkTitles() {
  document
    .querySelectorAll('.theme-doc-sidebar-container .menu__link')
    .forEach((link) => {
      const title = link.textContent.trim()
      if (title) link.setAttribute('title', title)
    })
}

export default function ContentWrapper({ children }) {
  const location = useLocation()

  useEffect(() => {
    applySectionNumbers()
    applySidebarLinkTitles()
  }, [location.pathname, location.hash])

  return (
    <div className={clsx(ThemeClassNames.docs.docMarkdown, 'markdown')}>
      <MDXContent>{children}</MDXContent>
    </div>
  )
}
