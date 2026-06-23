"""
用户实现骨架：在此文件中继承 ModelHandle 并实现 pre_handle / post_handle。

与 image_segmentation_instance 的区别：
- post_handle 输出 PredictionResult.mask（原图尺寸 binary numpy mask），
  而非 polygon points。
- 平台骨架（custom_predict.py）负责将 mask 转为 polygon_with_holes.regions 格式。
"""
from model_handle import ModelHandle, ModelInput, PredictionResult
from typing import List


class MyModelHandle(ModelHandle):
    """
    实例分割（孔洞）模型处理器实现示例。
    请根据实际模型结构修改 pre_handle 和 post_handle。
    """

    def pre_handle(self, image_path: str) -> ModelInput:
        """
        将图片路径转换为模型输入。

        示例使用 YOLO-seg 风格：等比例缩放 + padding，转为 RGB float tensor。
        """
        raise NotImplementedError("请在 pre_handle 中实现图片预处理逻辑")

    def post_handle(self, model_output, model_input: ModelInput) -> List[PredictionResult]:
        """
        将模型原始输出解码为实例分割结果列表。

        每个 PredictionResult 的 mask 字段必须是原图尺寸的 uint8 binary numpy 数组（H×W）。
        """
        raise NotImplementedError("请在 post_handle 中实现模型输出解码逻辑")
