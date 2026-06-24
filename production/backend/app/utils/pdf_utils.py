import os
import sys
import subprocess
from io import BytesIO
from typing import Optional

import pandas as pd
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.styles import getSampleStyleSheet

from app.core.logging import logger


def df_to_pdf(df: pd.DataFrame) -> BytesIO:
    """将 DataFrame 转为 PDF，修复超格问题"""

    font = register_system_font()

    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=landscape(A4),
                            leftMargin=0.5 * inch, rightMargin=0.5 * inch,
                            topMargin=0.5 * inch, bottomMargin=0.5 * inch)
    elements = []

    # 获取样式表
    styles = getSampleStyleSheet()
    normal_style = styles['Normal']
    normal_style.fontName = font if font else 'Helvetica'
    normal_style.fontSize = 8
    normal_style.wordWrap = 'CJK'
    normal_style.leading = 10  # 设置行高

    def calculate_column_widths(df, available_width):
        """智能计算列宽，基于内容长度和重要性"""
        num_cols = len(df.columns)

        # 处理空 DataFrame 的情况
        if num_cols == 0:
            return []

        # 基础配置
        min_col_width = 0.6 * inch  # 进一步减小最小宽度
        max_col_width = 2.0 * inch  # 减小最大宽度

        # 根据列内容估算所需宽度
        col_weights = []
        for col in df.columns:
            # 计算列名长度权重
            header_len = len(str(col))

            # 计算该列内容的最大长度（取样前10行）
            sample_data = df[col].head(10).astype(str)
            max_content_len = max(sample_data.str.len().max(), header_len) if not sample_data.empty else header_len

            # 设置不同列的权重系数（根据您的审计表格特点调整）
            if col in ['时间', 'IP地址', '操作类型', '审计状态']:
                # 固定宽度列
                weight = 1.0
            elif col in ['账号', '用户名']:
                weight = 1.2
            elif col in ['表名', '功能名称']:
                weight = 1.5
            elif col in ['审计原因']:
                weight = 2.5  # 原因列需要更多空间
            else:
                weight = 1.8

            col_weights.append(min(max_content_len * weight, 50))  # 设置上限

        # 归一化权重
        total_weight = sum(col_weights)
        if total_weight == 0:
            return [available_width / num_cols] * num_cols

        # 按权重分配宽度
        col_widths = []
        for weight in col_weights:
            width = (weight / total_weight) * available_width
            width = min(max(width, min_col_width), max_col_width)
            col_widths.append(width)

        # 调整总宽度
        total_width = sum(col_widths)
        if total_width > available_width:
            # 等比例缩放
            scale_factor = available_width / total_width
            col_widths = [w * scale_factor for w in col_widths]

        return col_widths

    # 计算可用宽度
    page_width = landscape(A4)[0]
    available_width = page_width - doc.leftMargin - doc.rightMargin

    # 计算列宽
    col_widths = calculate_column_widths(df, available_width)

    # 转换 DataFrame 为列表，长文本使用 Paragraph 支持换行
    # 改进的单元格格式化函数
    def format_cell(value, col_index):
        """格式化单元格，根据列类型采用不同的处理策略"""
        if pd.isna(value) or value is None or value == "":
            return ""

        text = str(value)

        # 根据列类型决定是否强制换行
        col_name = df.columns[col_index]

        if col_name in ['审计原因']:
            # 长文本列强制使用Paragraph换行
            return Paragraph(text, normal_style)
        elif len(text) > 20:  # 其他列超过20字符也换行
            return Paragraph(text, normal_style)
        else:
            return text

    # 构建表格数据
    header = [Paragraph(str(col), normal_style) for col in df.columns.tolist()]
    data = [header]

    for row in df.itertuples(index=False):
        row_data = []
        for col_index, cell in enumerate(row):
            row_data.append(format_cell(cell, col_index))
        data.append(row_data)

    # 创建表格
    table = Table(data, colWidths=col_widths, repeatRows=1, hAlign='LEFT')

    # 改进的表格样式
    style = TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('ALIGN', (0, 1), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), font if font else 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTNAME', (0, 1), (-1, -1), font if font else 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 7),  # 进一步减小字体大小
        ('BOTTOMPADDING', (0, 0), (-1, 0), 6),
        ('TOPPADDING', (0, 1), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 3),
        ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.grey),  # 更细的网格线
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F5F5F5')]),  # 斑马纹
    ])

    # 添加自动换行处理
    style.add('WORDWRAP', (0, 0), (-1, -1), True)

    table.setStyle(style)
    elements.append(table)

    try:
        doc.build(elements)
        output.seek(0)
        return output
    except Exception as e:
        logger.error(f"PDF生成失败: {e}")
        # 备用方案：简化表格
        return create_simple_pdf(df, font, doc)

def create_simple_pdf(df: pd.DataFrame, font: str, doc: SimpleDocTemplate) -> BytesIO:
    """备用方案：生成简化的PDF"""
    output = BytesIO()

    # 简化处理：只保留必要列或截断长文本
    simplified_df = df.copy()
    for col in simplified_df.columns:
        if simplified_df[col].dtype == 'object':
            simplified_df[col] = simplified_df[col].astype(str).str.slice(0, 50)  # 截断长文本

    # 使用更保守的列宽设置
    num_cols = len(simplified_df.columns)
    available_width = landscape(A4)[0] - doc.leftMargin - doc.rightMargin
    col_width = min(available_width / num_cols, 1.2 * inch)
    col_widths = [col_width] * num_cols

    # 构建简单表格
    data = [simplified_df.columns.tolist()] + simplified_df.values.tolist()
    table = Table(data, colWidths=col_widths, repeatRows=1)

    simple_style = TableStyle([
        ('FONTNAME', (0, 0), (-1, -1), font if font else 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 6),
        ('GRID', (0, 0), (-1, -1), 0.25, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ])
    table.setStyle(simple_style)

    simple_doc = SimpleDocTemplate(output, pagesize=landscape(A4))
    simple_doc.build([table])
    output.seek(0)
    return output



def get_system_chinese_font() -> Optional[str]:
    """
    根据操作系统获取可用的中文字体路径
    返回：字体文件路径（如 "C:/Windows/Fonts/simsun.ttc"），未找到则返回 None
    """
    # 1. 识别操作系统
    platform = sys.platform
    font_candidates = []  # 候选字体（按优先级排序）

    # 2. 根据系统添加候选字体路径
    if platform.startswith("win32"):
        # Windows 系统：默认字体目录 + 常见中文字体
        font_dir = r"C:\Windows\Fonts"
        # 优先尝试：宋体、微软雅黑、黑体（带 .ttc 或 .ttf 后缀）
        font_candidates = [
            os.path.join(font_dir, "simsun.ttc"),  # 宋体（最常用）
            os.path.join(font_dir, "msyh.ttc"),  # 微软雅黑
            os.path.join(font_dir, "simhei.ttf"),  # 黑体
            os.path.join(font_dir, "simkai.ttf"),  # 楷体
        ]

    elif platform.startswith("darwin"):
        # macOS 系统：默认字体目录 + 系统中文字体
        font_dirs = [
            "/Library/Fonts",  # 系统级字体
            "~/Library/Fonts"  # 用户级字体（需展开 ~）
        ]
        # 优先尝试：苹方、宋体、黑体
        for dir in font_dirs:
            expanded_dir = os.path.expanduser(dir)  # 处理 ~
            font_candidates.extend([
                os.path.join(expanded_dir, "PingFang SC Regular.ttf"),  # 苹方（系统默认）
                os.path.join(expanded_dir, "STSong.ttf"),  # 宋体
                os.path.join(expanded_dir, "STHeiti Medium.ttc"),  # 黑体
            ])

    elif platform.startswith("linux"):
        # Linux 系统：常见字体目录 + 开源中文字体（尽量覆盖不同发行版路径）
        font_dirs = [
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            "~/.local/share/fonts",
            "~/.fonts",
            "/usr/share/fonts/opentype/noto",
            "/usr/share/fonts/noto",
            "/usr/share/fonts/truetype/wqy",
            "/usr/share/fonts/truetype/noto",
            "/usr/share/fonts/truetype",
            "/usr/share/fonts/opentype/adobe-source-han-sans",
            "/usr/share/fonts/opentype/adobe-source-han-serif",
            "/usr/share/fonts/OTF"
        ]
        # 常见中文字体文件名（按优先级，优先 TrueType 轮廓，避开 Noto CJK OTC/OTF）
        linux_cn_font_files = [
            "wqy-microhei.ttc",           # 文泉驿微米黑（推荐）
            "wqy-zenhei.ttc",             # 文泉驿正黑
            "DroidSansFallbackFull.ttf",  # Droid Fallback（部分发行版）
            "DroidSansFallback.ttf",
            "NotoSansSC-Regular.ttf",     # 若存在 TTF 版优先
            "NotoSerifSC-Regular.ttf",
            # 以下为可能存在但不推荐优先的 CFF/OTC 文件，放在末尾以避免被首先命中
            "NotoSansSC-Regular.otf",
            "NotoSerifSC-Regular.otf",
            "NotoSansCJKsc-Regular.otf",
            "NotoSansCJK-Regular.ttc",
            "SourceHanSansSC-Regular.otf",
            "SourceHanSerifSC-Regular.otf"
        ]
        for dir in font_dirs:
            expanded_dir = os.path.expanduser(dir)
            for filename in linux_cn_font_files:
                font_candidates.append(os.path.join(expanded_dir, filename))

    # 3. 检查候选字体是否存在（返回第一个找到的字体）
    for font_path in font_candidates:
        if os.path.exists(font_path):
            return font_path

    # 4. 未找到任何中文字体
    return None


def register_system_font() -> Optional[str]:
    """注册系统中文字体，返回字体名称（用于 reportlab）"""
    font_path = get_system_chinese_font()
    # 如果找不到任何候选，直接尝试 CID 兜底
    if not font_path:
        try:
            cid_name = 'STSong-Light'
            if cid_name not in pdfmetrics.getRegisteredFontNames():
                pdfmetrics.registerFont(UnicodeCIDFont(cid_name))
            logger.info("已启用 CID 兜底字体 STSong-Light")
            return cid_name
        except Exception as e:
            logger.warning(f"CID 兜底字体注册失败：{e}")
            logger.warning("警告：未找到可用的中文字体，PDF 可能出现乱码")
            return None

    # 提取字体名称（用于注册，如 "simsun"、"wqy-microhei"）
    font_name = os.path.splitext(os.path.basename(font_path))[0]
    # 避免重复注册
    if font_name not in pdfmetrics.getRegisteredFontNames():
        try:
            pdfmetrics.registerFont(TTFont(font_name, font_path))
            logger.info(f"成功注册系统字体：{font_name}（路径：{font_path}）")
        except Exception as e:
            logger.error(f"字体注册失败：{e}")
            # 如果 TrueType 注册失败，启用 CID 兜底
            try:
                cid_name = 'STSong-Light'
                if cid_name not in pdfmetrics.getRegisteredFontNames():
                    pdfmetrics.registerFont(UnicodeCIDFont(cid_name))
                logger.info("已启用 CID 兜底字体 STSong-Light")
                return cid_name
            except Exception as e2:
                logger.warning(f"CID 兜底字体注册失败：{e2}")
                return None
    return font_name

