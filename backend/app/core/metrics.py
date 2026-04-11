import os
import psutil
try:
    import pynvml
    pynvml.nvmlInit()
    NVML_AVAILABLE = True
except Exception:
    NVML_AVAILABLE = False

def get_live_metrics():
    # CPU
    cpu_usage = psutil.cpu_percent(interval=None)
    
    # RAM
    ram = psutil.virtual_memory()
    ram_usage = ram.percent
    
    # Disks - platform-agnostic root
    root_path = os.path.abspath(os.sep)
    sys_disk = psutil.disk_usage(root_path)
    sys_disk_used_gb = sys_disk.used / (1024**3)
    sys_disk_total_gb = sys_disk.total / (1024**3)
    
    source_path = os.getenv("DOC_SOURCE_PATH", "./doc_source")
    try:
        source_disk = psutil.disk_usage(source_path)
        source_disk_used_gb = source_disk.used / (1024**3)
        source_disk_total_gb = source_disk.total / (1024**3)
    except FileNotFoundError:
        source_disk_used_gb = 0.0
        source_disk_total_gb = 0.0

    # GPU
    gpu_util = 0.0
    vram_used = 0
    vram_total = 0
    
    if NVML_AVAILABLE:
        try:
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            util = pynvml.nvmlDeviceGetUtilizationRates(handle)
            gpu_util = util.gpu
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            vram_used = mem_info.used // (1024**2)
            vram_total = mem_info.total // (1024**2)
        except Exception:
            pass
            
    return {
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
