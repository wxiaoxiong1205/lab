"""
基准评估任务完成后的结果处理：从 JFS 读取 OpenCompass 输出，解析并写入 BenchmarkResult，更新 benchmark_leaderboard，更新任务 result_path。
"""
import asyncio
import os
import csv
import io
from datetime import datetime
from typing import Optional, Dict, Tuple, List

from sqlalchemy import select

from app.common.status import TaskStatus
from app.core.logging import logger
from app.utils.storage_enum import StoragePath
from app.utils.timezone_utils import get_current_shanghai_time
from app.models.benchmark_task_manager import (
    BenchmarkTask,
    BenchmarkTaskModelRelation,
    BenchmarkTaskDatasetRelation,
    BenchmarkResult,
    BenchmarkLeaderboard,
)


async def process_benchmark_task_results(
    task_id: int,
    jfs,
    task_mapper,
    result_mapper,
    model_relation_mapper,
    dataset_relation_mapper,
    leaderboard_mapper,
) -> None:
    """
    任务完成后：从 JFS 读取 OpenCompass 结果目录，解析分数并写入 BenchmarkResult，按 (project_id, model_id) 更新 benchmark_leaderboard，更新 task.result_path。
    若无法解析则按 model_relation × dataset_relation 写入一条 score=0 的记录，保证报告可展示。
    """
    session = await task_mapper.get_session()
    try:
        task = await task_mapper.query_one(
            select(BenchmarkTask).where(BenchmarkTask.id == task_id)
        )
        if not task:
            logger.warning(f"基准评估任务不存在: task_id={task_id}")
            return

        namespace = f"{os.getenv('KUBERNETES_NAMESPACE_PREFIX', 'deepexilab')}-{task.project_id}"
        results_base = (
            StoragePath.BENCHMARK_TASK_ROOT.format_storage_path(
                namespace=namespace, task_id=task_id
            ).rstrip("/")
            + "/results/"
        )

        # 列出 results 下子目录（OpenCompass 按时间戳建目录，如 20260204_091742）
        try:
            subdirs = list(jfs.listdir(results_base))
        except Exception as e:
            logger.warning(f"无法列出基准评估结果目录 {results_base}: {e}")
            subdirs = []

        latest_subdir = None
        if subdirs:
            latest_subdir = sorted(subdirs)[-1]
        result_path = (results_base + latest_subdir) if latest_subdir else results_base
        logger.info(
            f"基准评估结果路径: task_id={task_id}, results_base={results_base}, "
            f"subdirs={subdirs}, latest_subdir={latest_subdir}"
        )

        # 解析分数：OpenCompass 输出到 {exp_dir}/summary/summary_{timestamp}.csv
        # 若 listdir 未看到 summary（JFS 缓存/时序），则按约定路径直接尝试打开 summary_{timestamp}.csv/.txt
        # 重试 3 次、间隔 5s，给 JFS 同步留足时间
        scores_map: Dict[Tuple[str, str], float] = {}
        summary_csv_path = None
        if latest_subdir:
            exp_dir = results_base + latest_subdir + "/"
            summary_dir = exp_dir + "summary/"
            # 约定路径：summary/summary_{timestamp}.csv 或 .txt（与 run 目录名一致）
            direct_csv = summary_dir + "summary_" + latest_subdir + ".csv"
            direct_txt = summary_dir + "summary_" + latest_subdir + ".txt"
            for attempt in range(3):
                try:
                    entries = list(jfs.listdir(exp_dir))
                    logger.info(
                        f"基准评估结果目录 {exp_dir} 子目录: {entries}, "
                        f"attempt={attempt + 1}"
                    )
                    if "summary" in entries:
                        for name in jfs.listdir(summary_dir):
                            if name.endswith(".csv") or (name.endswith(".txt") and "summary" in name.lower()):
                                summary_csv_path = summary_dir + name
                                break
                    if not summary_csv_path:
                        for name in entries:
                            if name.endswith("summary.csv") or name == "summary.csv":
                                summary_csv_path = exp_dir + name
                                break
                            if name.endswith(".txt") and "summary" in name.lower():
                                summary_csv_path = exp_dir + name
                                break
                    # listdir 可能因 JFS 缓存未列出 summary，按约定路径直接尝试（先 exists 再兜底 open）
                    if not summary_csv_path:
                        if jfs.exists(direct_csv):
                            summary_csv_path = direct_csv
                        elif jfs.exists(direct_txt):
                            summary_csv_path = direct_txt
                    if not summary_csv_path:
                        try:
                            with jfs.open(direct_csv, "r", encoding="utf-8") as f:
                                f.read()
                            summary_csv_path = direct_csv
                        except Exception:
                            pass
                        if not summary_csv_path:
                            try:
                                with jfs.open(direct_txt, "r", encoding="utf-8") as f:
                                    f.read()
                                summary_csv_path = direct_txt
                            except Exception:
                                pass
                    logger.info(f"基准评估结果文件路径: {summary_csv_path}")
                    if summary_csv_path:
                        with jfs.open(summary_csv_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        # 打印读取到的内容便于排查（截断避免日志过长）
                        content_preview = content.strip()
                        if len(content_preview) > 1500:
                            content_preview = content_preview[:1500] + "\n... (已截断)"
                        logger.info(
                            f"基准评估读取 summary 文件: path={summary_csv_path}, "
                            f"长度={len(content)} 字符, 内容预览:\n{content_preview}"
                        )
                        scores_map = _parse_summary_csv(content)
                except Exception as e:
                    logger.debug(f"解析 OpenCompass 结果文件失败 attempt={attempt + 1}: {e}")
                if scores_map:
                    break
                if attempt < 2:
                    await asyncio.sleep(5)
            if not scores_map and summary_csv_path:
                logger.warning(
                    f"基准评估 summary 解析后 scores_map 为空: task_id={task_id}, "
                    f"summary_csv_path={summary_csv_path}，将按 0 分入库"
                )

        # 查询本任务的模型、数据集关联
        model_relations = await model_relation_mapper.query(
            select(BenchmarkTaskModelRelation).where(
                BenchmarkTaskModelRelation.benchmark_task_id == task_id
            )
        )
        dataset_relations = await dataset_relation_mapper.query(
            select(BenchmarkTaskDatasetRelation).where(
                BenchmarkTaskDatasetRelation.benchmark_task_id == task_id
            )
        )

        # 写入 BenchmarkResult（存在则更新，否则插入）
        logger.info(
            f"基准评估 scores_map 解析得到 {len(scores_map)} 条, "
            f"model_relations={len(model_relations)}, dataset_relations={len(dataset_relations)}"
        )
        for model_rel in model_relations:
            for dataset_rel in dataset_relations:
                score = _get_score_from_map(
                    scores_map, dataset_rel.dataset_code, model_rel.model_name
                )
                final_score = float(score) if score is not None else 0.0
                if score is None:
                    logger.warning(
                        f"基准评估未匹配到分数(将写0): task_id={task_id}, "
                        f"dataset_code={dataset_rel.dataset_code!r}, model_name={model_rel.model_name!r}, "
                        f"scores_map_keys={list(scores_map.keys())[:20]}"
                    )
                await _upsert_benchmark_result(
                    session=session,
                    result_mapper=result_mapper,
                    task_id=task_id,
                    model_id=model_rel.model_id,
                    model_name=model_rel.model_name,
                    model_version=model_rel.model_version,
                    dataset_code=dataset_rel.dataset_code,
                    score=final_score,
                    tenant_id=task.tenant_id,
                )

        # 设计文档：任务完成后「更新榜单数据」。一次性写入本任务各模型的榜单数据（各数据集得分与平均分、最近一次任务与时间）
        now = get_current_shanghai_time()
        await _write_benchmark_leaderboard_batch(
            session=session,
            leaderboard_mapper=leaderboard_mapper,
            project_id=task.project_id,
            tenant_id=task.tenant_id,
            task_id=task_id,
            now=now,
            model_relations=model_relations,
            dataset_relations=dataset_relations,
            scores_map=scores_map,
        )

        task.result_path = result_path
        task.progress = 100
        task.status = TaskStatus.COMPLETED.value
        task.finished_at = get_current_shanghai_time()
        if not task.started_at:
            task.started_at = task.created_at
        await task_mapper.commit()
        logger.info(f"基准评估任务结果已处理: task_id={task_id}, result_path={result_path}, status=已完成")
    except Exception as e:
        logger.error(f"处理基准评估任务结果失败: task_id={task_id}, error={e}", exc_info=True)
        await task_mapper.rollback()
        raise


def summary_has_eval_failure(content: str) -> bool:
    """
    检查 OpenCompass summary.csv 是否包含评估失败（任意分数格为 "-"）。
    用于判断任务应标记为失败并拼接错误日志。
    """
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if len(rows) < 2:
        return False
    for row in rows[1:]:
        for i in range(4, len(row)):
            if row[i].strip() == "-":
                return True
    return False


def parse_error_log_paths_from_run_log(log_lines: List[str]) -> List[str]:
    """
    从 OpenCompass 运行日志中解析 "fail, see" 后提到的错误日志文件路径。
    返回绝对路径列表（如 /data/benchmark/results/.../logs/eval/.../xxx.out）。
    """
    paths: List[str] = []
    for i, line in enumerate(log_lines):
        if "fail, see" not in line:
            continue
        # 同一行 see 后可能直接跟路径
        after_see = line.split("fail, see", 1)[-1].strip()
        if after_see and (after_see.endswith(".out") or "/" in after_see):
            paths.append(after_see)
        # 或下一行是路径
        if i + 1 < len(log_lines):
            next_line = log_lines[i + 1].strip()
            if next_line.endswith(".out") and next_line.startswith("/"):
                paths.append(next_line)
    return list(dict.fromkeys(paths))  # 去重保持顺序


def _get_score_from_map(
    scores_map: Dict[Tuple[str, str], float],
    dataset_code: str,
    model_name: str,
) -> Optional[float]:
    """从 scores_map 取分，按优先级依次尝试：
    1. 精确匹配 (dataset_code, model_name)
    2. openai_ 前缀：(openai_+dataset_code, model_name)
    3. 大小写不敏感精确匹配
    4. 大小写不敏感前缀匹配：CSV 的 dataset_abbr 以 dataset_code 开头（如 GPQA_diamond 匹配 gpqa）
    
    返回分数，如果未找到则返回 None。
    """
    # 1. 精确匹配
    score = scores_map.get((dataset_code, model_name))
    if score is not None:
        return float(score)
    # 2. openai_ 前缀
    score = scores_map.get(("openai_" + dataset_code, model_name))
    if score is not None:
        return float(score)
    # 3 & 4. 大小写不敏感：遍历 scores_map 做模糊匹配
    code_lower = dataset_code.lower()
    for (abbr, mname), val in scores_map.items():
        if mname != model_name:
            continue
        abbr_lower = abbr.lower()
        # 大小写不敏感精确匹配，或 abbr 以 dataset_code+"_" 开头（如 GPQA_diamond 匹配 gpqa）
        if abbr_lower == code_lower or abbr_lower.startswith(code_lower + "_"):
            return float(val)
    return None


def _parse_summary_csv(content: str) -> Dict[Tuple[str, str], float]:
    """
    解析 OpenCompass summary 格式：表头 dataset, version, metric, mode, <model_name>。
    - 若存在 metric 列为 "score" 的行（多行格式：同一 dataset 多行 score/pass/timeout 等），只取 metric=score 的行；
    - 否则按原有逻辑：每行即一条 dataset 的分数（无 metric 或仅一行）。
    返回 (dataset_code, model_name) -> score。
    """
    result: Dict[Tuple[str, str], float] = {}
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    if len(rows) < 2:
        return result
    header = rows[0]
    # 列：dataset(0), version(1), metric(2), mode(3), 第4列起为各 model 的数值
    model_names = []
    for i, h in enumerate(header):
        if i <= 3:
            continue
        model_names.append(h.strip())
    data_rows = rows[1:]
    # 若存在 metric 为 score 的行，则只取这些行；否则用全部数据行（兼容原有一行一 dataset）
    has_score_metric = any(
        len(r) > 2 and r[2].strip().lower() == "score" for r in data_rows
    )
    for row in data_rows:
        if len(row) <= 3:
            continue
        if has_score_metric:
            metric_col = row[2].strip().lower() if len(row) > 2 else ""
            if metric_col != "score":
                continue
        dataset_abbr = row[0].strip()
        for j, model_name in enumerate(model_names):
            if 4 + j < len(row):
                try:
                    score = float(row[4 + j].strip().replace("-", "0"))
                    result[(dataset_abbr, model_name)] = score
                except ValueError:
                    pass
    return result


async def _upsert_benchmark_result(
    session,
    result_mapper,
    task_id: int,
    model_id: int,
    model_name: str,
    model_version: Optional[str],
    dataset_code: str,
    score: float,
    tenant_id: str,
) -> None:
    """插入或更新一条 BenchmarkResult，按 (task_id, model_id, dataset_code) 唯一。"""
    stmt = select(BenchmarkResult).where(
        BenchmarkResult.benchmark_task_id == task_id,
        BenchmarkResult.model_id == model_id,
        BenchmarkResult.dataset_code == dataset_code,
    )
    stmt = await result_mapper.append_tenant_id(stmt)
    r = await session.execute(stmt)
    existing = r.scalar_one_or_none()
    if existing:
        existing.score = score
        existing.model_name = model_name
        existing.model_version = model_version
    else:
        new_result = BenchmarkResult(
            benchmark_task_id=task_id,
            model_id=model_id,
            model_name=model_name,
            model_version=model_version,
            dataset_code=dataset_code,
            score=score,
            tenant_id=tenant_id,
        )
        session.add(new_result)


async def _write_benchmark_leaderboard_batch(
    session,
    leaderboard_mapper,
    project_id: int,
    tenant_id: str,
    task_id: int,
    now: datetime,
    model_relations: list,
    dataset_relations: list,
    scores_map: Dict[Tuple[str, str], float],
) -> None:
    """
    任务完成后一次性写入榜单：本任务各模型在各数据集上的得分、平均分、最近一次任务ID与评估时间。
    """
    if not model_relations:
        return
    model_ids = [m.model_id for m in model_relations]
    stmt = select(BenchmarkLeaderboard).where(
        BenchmarkLeaderboard.project_id == project_id,
        BenchmarkLeaderboard.model_id.in_(model_ids),
    )
    stmt = await leaderboard_mapper.append_tenant_id(stmt)
    r = await session.execute(stmt)
    existing_by_model_id = {row.model_id: row for row in r.scalars().all()}

    for model_rel in model_relations:
        # 本任务每个数据集都要落表，未匹配到分数时记为 0
        new_dataset_scores = {}
        for dataset_rel in dataset_relations:
            s = _get_score_from_map(
                scores_map, dataset_rel.dataset_code, model_rel.model_name
            )
            new_dataset_scores[dataset_rel.dataset_code] = float(s) if s is not None else 0.0

        row = existing_by_model_id.get(model_rel.model_id)
        if row is not None:
            # 合并历史得分：如果已存在，则用新得分更新
            merged_scores = dict(row.dataset_scores or {})
            merged_scores.update(new_dataset_scores)
            
            average_score = (
                round(sum(merged_scores.values()) / len(merged_scores), 4)
                if merged_scores else 0.0
            )
            
            row.model_name = model_rel.model_name
            row.model_version = model_rel.model_version
            row.average_score = average_score
            row.dataset_scores = merged_scores
            row.last_task_id = task_id
            row.last_evaluated_at = now
        else:
            average_score = (
                round(sum(new_dataset_scores.values()) / len(new_dataset_scores), 4)
                if new_dataset_scores else 0.0
            )
            session.add(BenchmarkLeaderboard(
                project_id=project_id,
                model_id=model_rel.model_id,
                model_name=model_rel.model_name,
                model_version=model_rel.model_version,
                average_score=average_score,
                dataset_scores=new_dataset_scores,
                last_task_id=task_id,
                last_evaluated_at=now,
                tenant_id=tenant_id,
            ))
