from io import BytesIO

import pandas as pd


def df_to_excel(df: pd.DataFrame) -> BytesIO:
    """将 DataFrame 转为 Excel，返回内存中的文件流"""
    output = BytesIO()  # 内存缓冲区
    # 使用 openpyxl 引擎，支持 xlsx 格式
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="数据")  # index=False 不保存索引
    output.seek(0)  # 指针移到开头，准备读取
    return output
