# Genogram Benchmark Harness

Performance baseline tool for the genogram Canvas 2D app.  
Measures render latency and animation FPS across three data-size scenarios (small / medium / large).

---

## How to Run

```bash
# From the repo root (C:/temp/genogram-b):
PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py
```

Prerequisites already in place on the Sprint 2 machine:
- Python 3.13 with `playwright` package installed
- Chromium downloaded via `python -m playwright install chromium`
- No additional `pip install` steps needed

The script:
1. Starts `python -m http.server 8765` in the background, serving the repo root.
2. Launches headless Chromium (1400 x 900, DPR=1).
3. Seeds three data scenarios programmatically (no UI interaction needed).
4. Measures cold render, warm render (avg + p95), pan FPS, and zoom FPS.
5. Writes `results/baseline-<timestamp>.json` and prints a summary table.

---

## Comparing Before / After (Agent P optimization)

### Option A — Manual JSON diff

After Agent P merges the `personMap` index changes, run the script again:

```bash
PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py
```

Two result files will exist in `results/`:
```
baseline-20260422_143012.json   # before (this run)
baseline-20260422_160500.json   # after Agent P's changes
```

Open both and compare the `summary` array, or use:

```bash
python refactor/benchmarks/compare.py \
  results/baseline-20260422_143012.json \
  results/baseline-20260422_160500.json
```

### Option B — `compare.py` helper

```python
# refactor/benchmarks/compare.py
import sys, json

def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)

def pct_change(before, after):
    if before == 0:
        return 'n/a'
    return f'{(after - before) / before * 100:+.1f}%'

before = load(sys.argv[1])
after  = load(sys.argv[2])

print(f"Before commit: {before['commit']}  ({before['date']})")
print(f"After  commit: {after['commit']}  ({after['date']})")
print()

metrics = ['cold_ms', 'warm_avg_ms', 'warm_p95_ms', 'pan_fps', 'zoom_fps', 'find_count']
header = f"{'Scenario':<10} " + " ".join(f"{m:>14}" for m in metrics)
print(header)
print('-' * len(header))

b_map = {s['scenario']: s for s in before['summary']}
a_map = {s['scenario']: s for s in after['summary']}

for sc in ('small', 'medium', 'large'):
    b = b_map.get(sc, {})
    a = a_map.get(sc, {})
    row = f"{sc:<10} "
    for m in metrics:
        bv = b.get(m, 0)
        av = a.get(m, 0)
        row += f"{pct_change(bv, av):>14} "
    print(row)
```

Save this as `refactor/benchmarks/compare.py` and run it with the two JSON paths.  
Negative `%` for `*_ms` = faster (good). Positive `%` for `*_fps` = smoother (good).

---

## Metrics Explained

| Metric | Description |
|---|---|
| `cold_ms` | First `app.render()` latency after data seed (cold caches, ms) |
| `warm_avg_ms` | Mean of 30 consecutive `app.render()` calls (ms) |
| `warm_p95_ms` | 95th-percentile render latency across 30 calls (ms) |
| `pan_fps` | FPS during 2-second sinusoidal pan animation via RAF |
| `zoom_fps` | FPS during 2-second scale 0.5 -> 1.5 -> 0.5 animation via RAF |
| `find_count` | `Array.prototype.find` call count during one render (monkey-patched) |

Each scenario is run **3 times** and results are averaged to reduce scheduler noise.

---

## Hardware / Environment Caveats

**Do not compare results across different machines.**  
All timing is relative to the CPU, GPU driver, and OS scheduler of the machine running the test.

- The benchmark runs headless Chromium — driver differences between machines produce 2x-5x FPS variance.
- Thermal throttling on laptops can cause cold-vs-warm timing drift of 20-40% between runs.
- Background OS processes (antivirus scans, Windows Update) introduce jitter; run in a quiet state.
- The only meaningful comparison is **before vs. after on the same machine in the same session**.
- `find_count` is deterministic for a given data set and is the most reliable cross-machine signal.

---

## Output JSON Schema

```json
{
  "date": "20260422_143012",
  "commit": "98e4891",
  "environment": { "viewport": "1400x900", "dpr": 1, "..." : "..." },
  "summary": [
    {
      "scenario": "small",
      "n_persons": 20,
      "n_relationships": 38,
      "cold_ms": 4.2,
      "warm_avg_ms": 2.1,
      "warm_p95_ms": 3.4,
      "pan_fps": 58.3,
      "zoom_fps": 57.9,
      "find_count": 142
    }
  ],
  "raw_runs": [ "...individual run objects..." ]
}
```
