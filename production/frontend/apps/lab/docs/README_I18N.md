# Internationalization (i18n) Implementation

This document describes the internationalization (i18n) implementation in the application.

## Supported Languages

The application supports the following languages:

- Simplified Chinese (zh-CN) - Default language
- English (en)
- Simplified Chinese (zh-CN)
- Traditional Chinese (zh-TW)

## Implementation Details

### Technology Stack

- **i18next**: Core internationalization framework
- **react-i18next**: React bindings for i18next
- **i18next-browser-languagedetector**: Browser language detection plugin

### Directory Structure

```
src/
├── locales/
│   ├── en/
│   │   └── translation.json
│   ├── zh-CN/
│   │   └── translation.json
│   └── zh-TW/
│       └── translation.json
├── i18n.ts
├── utils/
│   └── languageUtils.ts
└── hooks/
    └── useI18n.ts
```

### Configuration

The i18n configuration is defined in `src/i18n.ts`. It initializes i18next with the following settings:

- Resources for all supported languages
- Default language (Simplified Chinese)
- Language detection from localStorage and browser settings
- Storage of language preference in localStorage

### Language Switching

The language switcher component (`LanguageSwitcher.tsx`) allows users to switch between the supported languages. When a language is selected:

1. The language is changed using i18next
2. The language preference is stored in localStorage
3. The UI is updated to reflect the new language

### Usage

#### Using the Translation Hook

```tsx
import useI18n from '../hooks/useI18n';

function MyComponent() {
  const { t } = useI18n();
  
  return <h1>{t('app.title')}</h1>;
}
```

#### Changing Language

```tsx
import useI18n from '../hooks/useI18n';

function LanguageControl() {
  const { changeLanguage } = useI18n();
  
  return (
    <button onClick={() => changeLanguage('zh-CN')}>
      Switch to Simplified Chinese
    </button>
  );
}
```

#### Getting Current Language

```tsx
import useI18n from '../hooks/useI18n';

function LanguageInfo() {
  const { getCurrentLanguage } = useI18n();
  
  return <p>Current language: {getCurrentLanguage()}</p>;
}
```

## Adding New Translations

To add new translations:

1. Add the translation key and value to all language files in `src/locales/*/translation.json`
2. Use the translation key in your components with the `t` function

Example:

```json
// src/locales/en/translation.json
{
  "newFeature": {
    "title": "New Feature"
  }
}

// src/locales/zh-CN/translation.json
{
  "newFeature": {
    "title": "新功能"
  }
}

// src/locales/zh-TW/translation.json
{
  "newFeature": {
    "title": "新功能"
  }
}
```

```tsx
// In your component
const { t } = useI18n();
return <h2>{t('newFeature.title')}</h2>;
```

## Adding New Languages

To add a new language:

1. Create a new directory in `src/locales/` with the language code
2. Add a `translation.json` file with all translations
3. Update the `i18n.ts` file to include the new language
4. Update the `languageUtils.ts` file to include the new language in the supported languages list
5. Add the new language option to the `LanguageSwitcher` component 