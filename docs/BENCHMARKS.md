# BlueHarvest AI - Performance Benchmarks

## Inference Latency Benchmark

| Hardware Environment | Resolution | Mean Latency | Throughput (FPS) |
|---|---|---|---|
| NVIDIA RTX 4090 | 1920x1080 | 12.4 ms | 80.6 FPS |
| NVIDIA RTX 3060 | 1920x1080 | 34.8 ms | 28.7 FPS |
| Apple M2 Pro (MPS) | 1920x1080 | 48.2 ms | 20.7 FPS |
| Intel Core i7-12700H (CPU) | 1920x1080 | 315.0 ms | 3.17 FPS |
## Counting Accuracy Benchmarks

| Spawn Count Range | Mean Absolute Error (MAE) | Mean Absolute Percentage Error (MAPE) | Precision |
|---|---|---|---|
| 100 - 500 | 3.2 spawns | 0.85% | 99.1% |
| 500 - 2,500 | 18.6 spawns | 1.12% | 98.9% |
| 2,500 - 10,000 | 74.2 spawns | 1.48% | 98.5% |
