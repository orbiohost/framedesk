#!/bin/sh
set -e
# GPU builds ship cuBLAS/cuDNN as pip packages; point the loader at them.
if python -c "import nvidia.cublas.lib, nvidia.cudnn.lib" 2>/dev/null; then
  export LD_LIBRARY_PATH="$(python -c 'import os, nvidia.cublas.lib, nvidia.cudnn.lib; print(os.path.dirname(nvidia.cublas.lib.__file__) + ":" + os.path.dirname(nvidia.cudnn.lib.__file__))')${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi
# One process: the model sits in memory once and jobs share it.
exec uvicorn app:app --host 0.0.0.0 --port 9000 --workers 1 --no-access-log
