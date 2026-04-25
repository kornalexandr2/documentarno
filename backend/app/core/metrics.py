import json
import logging
import os
import subprocess

import psutil
import redis

logger = logging.getLogger(__name__)

try:
    import pynvml
except Exception as exc:
    pynvml = None
    logger.warning("NVML import unavailable, GPU metrics disabled: %s", exc)

NVML_AVAILABLE = False
_NVML_ERROR_LOGGED = False
_NVIDIA_SMI_ERROR_LOGGED = False


def _ensure_nvml_initialized() -> bool:
    global NVML_AVAILABLE, _NVML_ERROR_LOGGED

    if pynvml is None:
        return False

    if NVML_AVAILABLE:
        return True

    try:
        pynvml.nvmlInit()
        NVML_AVAILABLE = True
        logger.info("NVML initialized successfully, GPU metrics enabled.")
        return True
    except Exception as exc:
        if not _NVML_ERROR_LOGGED:
            logger.warning("NVML initialization failed, GPU metrics will report zero until fixed: %s", exc)
            _NVML_ERROR_LOGGED = True
        return False


def _read_gpu_metrics_via_nvml() -> tuple[float, int, int] | None:
    try:
        handle = pynvml.nvmlDeviceGetHandleByIndex(0)
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
        return util.gpu, mem_info.used // (1024**2), mem_info.total // (1024**2)
    except Exception as exc:
        logger.warning("Failed to read GPU metrics from NVML: %s", exc)
        return None


def _read_gpu_metrics_via_nvidia_smi() -> tuple[float, int, int] | None:
    global _NVIDIA_SMI_ERROR_LOGGED

    try:
        cmd = [
            "nvidia-smi",
            "--query-gpu=utilization.gpu,memory.used,memory.total",
            "--format=csv,noheader,nounits",
        ]
        output = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, timeout=3)
        first_line = output.strip().splitlines()[0]
        gpu_util_str, vram_used_str, vram_total_str = [item.strip() for item in first_line.split(",")]
        return float(gpu_util_str), int(vram_used_str), int(vram_total_str)
    except Exception as exc:
        if not _NVIDIA_SMI_ERROR_LOGGED:
            logger.warning("nvidia-smi fallback unavailable, GPU metrics will report zero: %s", exc)
            _NVIDIA_SMI_ERROR_LOGGED = True
        return None


def _get_redis_values() -> tuple[str, dict | None]:
    try:
        app_state = redis_sync.get("APP_STATE") or "SEARCH"
        ocr_progress = redis_sync.get("OCR_PROGRESS")
        ocr_data = json.loads(ocr_progress) if ocr_progress else None
        return app_state, ocr_data
    except Exception as exc:
        logger.warning("Failed to read live state from Redis, using safe defaults: %s", exc)
        return "SEARCH", None


def _get_disk_usage_gb(path: str) -> tuple[float, float]:
    try:
        disk = psutil.disk_usage(path)
        return disk.used / (1024**3), disk.total / (1024**3)
    except Exception as exc:
        logger.warning("Failed to read disk usage for path %s, using zero values: %s", path, exc)
        return 0.0, 0.0


# Sync redis client for metrics gathering
redis_sync = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", "6379")),
    db=0,
    decode_responses=True,
)


def get_live_metrics():
    cpu_usage = psutil.cpu_percent(interval=None)
    ram = psutil.virtual_memory()
    ram_usage = ram.percent

    app_state, ocr_data = _get_redis_values()

    root_path = os.path.abspath(os.sep)
    sys_disk_used_gb, sys_disk_total_gb = _get_disk_usage_gb(root_path)

    source_path = os.getenv("DOC_SOURCE_PATH", "./doc_source")
    source_disk_used_gb, source_disk_total_gb = _get_disk_usage_gb(source_path)

    gpu_util = 0.0
    vram_used = 0
    vram_total = 0

    gpu_metrics: tuple[float, int, int] | None = None
    if _ensure_nvml_initialized():
        gpu_metrics = _read_gpu_metrics_via_nvml()

    if gpu_metrics is None:
        gpu_metrics = _read_gpu_metrics_via_nvidia_smi()

    if gpu_metrics is not None:
        gpu_util, vram_used, vram_total = gpu_metrics

    return {
        "app_state": app_state,
        "ocr_progress": ocr_data,
        "cpu_usage_percent": cpu_usage,
        "ram_usage_percent": ram_usage,
        "gpu_utilization_percent": gpu_util,
        "vram_used_mb": vram_used,
        "vram_total_mb": vram_total,
        "disk_system_used_gb": round(sys_disk_used_gb, 2),
        "disk_system_total_gb": round(sys_disk_total_gb, 2),
        "disk_source_used_gb": round(source_disk_used_gb, 2),
        "disk_source_total_gb": round(source_disk_total_gb, 2),
    }
