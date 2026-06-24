# Home Page Feature

This document describes the new Home Page feature added to the LLM Testing Platform.

## Overview

The Home Page provides a comprehensive introduction to the platform's functionality, guiding users through the workflow and key features. It serves as a central hub and starting point for users to understand the system's capabilities and navigate to specific functional areas.

## Features

1. **Quick Start Guide**: A step-by-step guide showing the main workflow of the platform with direct navigation links to each section.
2. **Workflow Visualization**: A visual representation of the workflow from data creation to model testing.
3. **Use Case Scenarios**: Cards highlighting different use cases for the platform.
4. **Getting Started Tips**: Practical tips for new users to effectively use the platform.

## Implementation Details

The Home Page is implemented as a standard React component with the following files:

- `src/pages/HomePage.tsx`: The main component file
- `public/workflow-diagram.png`: Workflow visualization diagram
- Translation resources in:
  - `src/locales/en/translation.json`
  - `src/locales/zh-CN/translation.json`
  - `src/locales/zh-TW/translation.json`

## Customization

### Modifying the Workflow Diagram

The workflow diagram is stored as an SVG file in `public/workflow-diagram.png`. You can edit this file directly to update the workflow visualization.

### Updating Content

To modify the text content of the Home Page:

1. Update the translation files in the appropriate language file:
   - English: `src/locales/en/translation.json`
   - Simplified Chinese: `src/locales/zh-CN/translation.json`
   - Traditional Chinese: `src/locales/zh-TW/translation.json`

2. Look for the `home` section in each file and modify the text values as needed.

### Adding More Use Cases or Steps

To add additional use cases or workflow steps:

1. Update the component logic in `src/pages/HomePage.tsx`
2. Add corresponding translations to all language files

## Usage

The Home Page is now the default landing page when selecting a project. When a user selects a project from the dropdown in the sidebar, they will be automatically directed to the Home Page.

Users can also navigate to the Home Page by clicking on the "Home" item in the sidebar menu.

## Navigation

From the Home Page, users can:

1. Click on any of the workflow step buttons to navigate directly to that section of the application
2. Use the sidebar menu for navigation to specific features
3. Explore use case scenarios for inspiration on how to utilize the platform

## Design Decisions

- The Home Page is designed to be responsive, working well on both desktop and mobile devices
- The step-by-step guide uses the Ant Design Steps component for clear visualization of the workflow
- Use case cards help users understand different scenarios where the platform can be valuable
- Direct navigation links make it easy to move from the introduction to actual work

## Future Enhancements

Potential future enhancements for the Home Page could include:

1. Interactive tutorials or walkthroughs
2. Recent activity or project statistics dashboard
3. Personalized recommendations based on user behavior
4. Video demonstrations of key features
5. Integration with an announcement system for platform updates 