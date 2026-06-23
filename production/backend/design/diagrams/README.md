# 时序图说明

本目录包含「创建模型」「模型部署」两张时序图，便于在文档外单独查看或导出为图片。

| 文件 | 说明 |
|------|------|
| **sequence-diagrams.html** | 在浏览器中打开即可查看**大图、高对比度**时序图，便于评审；可右键图表另存为图片或打印为 PDF。 |
| **create-model-sequence.mmd** | 创建模型流程的 Mermaid 源码。 |
| **deploy-sequence.mmd** | 模型部署流程的 Mermaid 源码。 |

## 导出为 PNG/SVG 图片

- **方式一**：打开 [Mermaid Live Editor](https://mermaid.live)，将 `.mmd` 文件内容粘贴进去，点击「Download PNG」或「Download SVG」，得到图片后放入本目录（如 `create-model-sequence.png`），即可在设计文档中通过 `![](diagrams/create-model-sequence.png)` 引用。
- **方式二**（需 Node.js）：在项目根目录或本目录执行  
  `npx -y @mermaid-js/mermaid-cli mmdc -i create-model-sequence.mmd -o create-model-sequence.png -b transparent -s 2 -w 1200`  
  以及  
  `npx -y @mermaid-js/mermaid-cli mmdc -i deploy-sequence.mmd -o deploy-sequence.png -b transparent -s 2 -w 1200`  
  生成 PNG 后，设计文档中即可引用 `diagrams/create-model-sequence.png`、`diagrams/deploy-sequence.png` 作为更显眼的图片时序图。
