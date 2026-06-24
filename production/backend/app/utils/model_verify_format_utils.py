import json
import re
from dataclasses import dataclass, asdict
from typing import List, Optional, Callable, Dict
from collections import defaultdict


# ============================================================
# 数据结构
# ============================================================

@dataclass
class ModelScanResult:

    is_model: bool

    model_family: Optional[str] = None
    framework: Optional[str] = None

    architecture: Optional[str] = None
    model_type: Optional[str] = None

    weight_format: Optional[str] = None
    weight_files: List[str] = None

    shard_count: int = 0

    model_size_bytes: int = 0

    has_config: bool = False
    has_tokenizer: bool = False
    has_generation_config: bool = False

    is_lora: bool = False
    quantization: Optional[str] = None

    support_vllm: bool = False
    support_tgi: bool = False
    support_sglang: bool = False
    support_llamacpp: bool = False

    model_tags: List[str] = None

    extra: Dict = None


# ============================================================
# 主扫描器
# ============================================================

class ModelRepositoryScanner:

    def __init__(
        self,
        files: List[str],
        file_sizes: Dict[str, int] = None,
        read_file_func: Optional[Callable[[str], str]] = None
    ):

        self.files = files
        self.file_set = set(files)
        self.file_sizes = file_sizes or {}
        self.read_file = read_file_func

    # ============================================================
    # 主入口
    # ============================================================

    def scan(self) -> ModelScanResult:

        # HuggingFace
        hf = self._detect_transformers()
        if hf:
            return hf

        # Diffusers
        diff = self._detect_diffusers()
        if diff:
            return diff

        # GGUF
        gguf = self._detect_gguf()
        if gguf:
            return gguf

        # ONNX
        onnx = self._detect_onnx()
        if onnx:
            return onnx

        # PyTorch
        pt = self._detect_pytorch()
        if pt:
            return pt

        # TensorFlow
        tf = self._detect_tensorflow()
        if tf:
            return tf

        return ModelScanResult(is_model=False)

    # ============================================================
    # 通用检测
    # ============================================================

    def _detect_tokenizer(self):

        files = [
            "tokenizer.json",
            "tokenizer.model",
            "tokenizer_config.json",
            "vocab.json"
        ]

        return any(f in self.file_set for f in files)

    def _detect_generation_config(self):
        return "generation_config.json" in self.file_set

    def _model_size(self):

        size = 0
        for f in self.files:
            size += self.file_sizes.get(f, 0)

        return size

    # ============================================================
    # 权重文件检测
    # ============================================================

    def _detect_weights(self):

        weights = []

        for f in self.files:
            lower_name = f.lower()

            if lower_name.endswith(".safetensors") and ".index.json" not in lower_name:
                weights.append(f)

            if lower_name.endswith(".bin") and not lower_name.endswith(".index.json"):
                weights.append(f)

            if lower_name.endswith(".pt"):
                weights.append(f)

        return weights

    def _detect_weight_index_files(self):

        return [
            f for f in self.files
            if f.endswith(".safetensors.index.json") or f.endswith(".bin.index.json")
        ]

    def _validate_weight_files(self):

        weights = self._detect_weights()
        if not weights:
            return None, 0

        index_files = self._detect_weight_index_files()

        if index_files:
            if not self.read_file:
                return None, 0

            referenced_weight_files = set()

            for index_file in index_files:
                try:
                    index_data = json.loads(self.read_file(index_file))
                except Exception:
                    return None, 0

                weight_map = index_data.get("weight_map")
                if not isinstance(weight_map, dict) or not weight_map:
                    return None, 0

                referenced_weight_files.update(weight_map.values())

            if not referenced_weight_files:
                return None, 0

            if not referenced_weight_files.issubset(self.file_set):
                return None, 0

            shard_count = len(referenced_weight_files)
            validated_weights = [f for f in weights if f in referenced_weight_files]

            if len(validated_weights) != shard_count:
                return None, 0

            return sorted(validated_weights), shard_count

        shard_groups = defaultdict(dict)
        shard_pattern = re.compile(r"^(?P<prefix>.+?)-(?P<shard>\d{5})-of-(?P<total>\d{5})(?P<suffix>\.[^.]+)$")

        for weight in weights:
            match = shard_pattern.match(weight)
            if not match:
                continue

            prefix = match.group("prefix")
            suffix = match.group("suffix")
            total = int(match.group("total"))
            shard = int(match.group("shard"))
            shard_groups[(prefix, suffix, total)][shard] = weight

        if shard_groups:
            for (_, _, total), shards in shard_groups.items():
                expected = set(range(1, total + 1))
                if set(shards.keys()) == expected:
                    validated_weights = [shards[i] for i in range(1, total + 1)]
                    return validated_weights, total

            return None, 0

        return sorted(weights), 1

    # ============================================================
    # 量化检测
    # ============================================================

    def _detect_quant(self):

        for f in self.files:

            if "int8" in f:
                return "int8"

            if "int4" in f:
                return "int4"

            if "gptq" in f.lower():
                return "gptq"

            if "awq" in f.lower():
                return "awq"

        return None

    # ============================================================
    # HuggingFace / Transformers
    # ============================================================

    def _detect_transformers(self):

        if "config.json" not in self.file_set:
            return None

        weights, shard_count = self._validate_weight_files()
        if not weights:
            return None

        has_tokenizer = self._detect_tokenizer()
        if not has_tokenizer:
            return None

        architecture = None
        model_type = None

        if self.read_file:

            try:
                config = json.loads(self.read_file("config.json"))

                model_type = config.get("model_type")

                arch = config.get("architectures")
                if arch:
                    architecture = arch[0]

            except Exception:
                pass

        family = self._detect_model_family(architecture, model_type)

        return ModelScanResult(
            is_model=True,
            model_family=family,
            framework="transformers",
            architecture=architecture,
            model_type=model_type,
            weight_format=self._weight_format(weights),
            weight_files=weights,
            shard_count=shard_count,
            model_size_bytes=self._model_size(),
            has_config=True,
            has_tokenizer=has_tokenizer,
            has_generation_config=self._detect_generation_config(),
            quantization=self._detect_quant(),
            model_tags=[]
        )

    # ============================================================
    # 模型类型
    # ============================================================

    def _detect_model_family(self, arch, model_type):

        if not arch:
            return "llm"

        arch = arch.lower()

        if "bert" in arch:
            return "embedding"

        if "sentence" in arch:
            return "embedding"

        if "crossencoder" in arch:
            return "rerank"

        return "llm"

    # ============================================================
    # LoRA
    # ============================================================

    def _detect_lora(self):

        # LoRA adapter models cannot run independently and require merging with a base model.
        # Since this scanner only considers directly runnable models, we ignore pure LoRA adapters.
        return None

    # ============================================================
    # Diffusers
    # ============================================================

    def _detect_diffusers(self):

        if "model_index.json" not in self.file_set:
            return None

        return ModelScanResult(
            is_model=True,
            model_family="diffusion",
            framework="diffusers",
            model_size_bytes=self._model_size()
        )

    # ============================================================
    # GGUF
    # ============================================================

    def _detect_gguf(self):

        gguf = [f for f in self.files if f.endswith(".gguf")]

        if not gguf:
            return None

        return ModelScanResult(
            is_model=True,
            model_family="llm",
            framework="llama.cpp",
            weight_format="gguf",
            weight_files=gguf,
            model_size_bytes=self._model_size()
        )

    # ============================================================
    # ONNX
    # ============================================================

    def _detect_onnx(self):

        onnx = [f for f in self.files if f.endswith(".onnx")]

        if not onnx:
            return None

        return ModelScanResult(
            is_model=True,
            model_family="onnx",
            framework="onnxruntime",
            weight_files=onnx,
            weight_format="onnx",
            model_size_bytes=self._model_size()
        )

    # ============================================================
    # PyTorch
    # ============================================================

    def _detect_pytorch(self):

        # Only treat files that look like actual model weights as PyTorch models.
        # Training checkpoints often contain optimizer.pt / scheduler.pt / rng_state.pth
        # which are NOT runnable models.
        weight_patterns = [
            "pytorch_model",
            "model",
            "consolidated",
        ]

        pt = []
        for f in self.files:
            if f.endswith(".pt") or f.endswith(".pth"):
                name = f.lower()
                if any(p in name for p in weight_patterns):
                    pt.append(f)

        # If we only have training-state files (optimizer / scheduler / rng), ignore them
        ignore_keywords = ["optimizer", "scheduler", "rng_state", "trainer_state"]
        pt = [f for f in pt if not any(k in f.lower() for k in ignore_keywords)]

        if not pt:
            return None

        return ModelScanResult(
            is_model=True,
            model_family="pytorch",
            framework="pytorch",
            weight_files=pt,
            weight_format="pt",
            model_size_bytes=self._model_size()
        )

    # ============================================================
    # TensorFlow
    # ============================================================

    def _detect_tensorflow(self):

        if "saved_model.pb" not in self.file_set:
            return None

        return ModelScanResult(
            is_model=True,
            model_family="tensorflow",
            framework="tensorflow",
            weight_format="pb",
            model_size_bytes=self._model_size()
        )

    # ============================================================
    # 权重格式
    # ============================================================

    def _weight_format(self, weights):

        for w in weights:

            if w.endswith(".safetensors"):
                return "safetensors"

            if w.endswith(".bin"):
                return "bin"

        return None

    # ============================================================
    # 推理引擎支持
    # ============================================================

    def _detect_engine_support(self, result: ModelScanResult):
        return

    # ============================================================
    # 输出 JSON
    # ============================================================

    def scan_dict(self):

        result = self.scan()

        return asdict(result)
