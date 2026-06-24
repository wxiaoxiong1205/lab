const options = [
  {
    label: '--max-model-len',
    value: '--max-model-len',
  },
  {
    label: '--npu-memory-utilization',
    value: '--npu-memory-utilization',
  },
  {
    label: '--max-num-seqs',
    value: '--max-num-seqs',
    options: [],
  },
  {
    label: '--max-batch-size',
    value: '--max-batch-size',
  },
]

const resultList = options.map((option) => {
  return {
    label: option.label,
    value: option.value,
    opts: option.options?.map((opt) => {
      return {
        label: opt,
        value: opt,
      }
    }),
  }
})

export default resultList
