export default function FilterItem({ selected, title, options, onSelect, mutiple, isMainTitle = true }: {
  title: string
  options: { label: string, value: string }[]
  selected: string | undefined
  mutiple?: boolean
  isMainTitle?: boolean
  onSelect: (v: string | string[] | undefined) => void
}) {
  const selectedArray = mutiple ? (selected?.split(',') ?? []) : [selected]

  return (
    <div className="mb-6">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        {isMainTitle ? title : <span className="text-gray-500 text-sm">{title}</span>}
      </label>
      <div className="flex flex-wrap gap-2" key={title}>
        {options.map((item) => (
          <span
            key={String(item.value)}
            className={`
              px-3 py-2 text-[12px] rounded-md cursor-pointer transition-all
              border whitespace-nowrap text-center
              ${selectedArray.includes(item.value)
            ? 'border-blue-500 bg-blue-50 text-blue-600 font-medium'
            : 'border-gray-300 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
          }
            `}
            onClick={() => onSelect(item.value)}
          >
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
