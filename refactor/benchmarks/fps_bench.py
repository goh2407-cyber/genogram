"""
fps_bench.py - FPS / render-time benchmark harness for the genogram app.

Usage:
    PYTHONIOENCODING=utf-8 python refactor/benchmarks/fps_bench.py

Produces:
    refactor/benchmarks/results/baseline-<timestamp>.json
    Console summary table

Metrics per scenario (small/medium/large):
    cold_ms       : first app.render() call latency (performance.now diff)
    warm_avg_ms   : mean of 30 consecutive render() calls
    warm_p95_ms   : 95th-percentile of those 30 calls
    pan_fps       : RAF-loop pan simulation over 2 s
    zoom_fps      : scale 1.0 -> 0.5 -> 1.5 animation over ~2 s
    find_count    : Array.prototype.find call count during one render (monkey-patch)

Each scenario is run RUNS_PER_SCENARIO times; results are averaged to reduce noise.
"""

import sys
import json
import time
import subprocess
import socket
import datetime
import pathlib
import statistics

# Force UTF-8 so Windows cp950 doesn't choke on any Unicode output
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

from playwright.sync_api import sync_playwright

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PORT = 8765
BASE_URL = f"http://127.0.0.1:{PORT}/index.html"
SERVE_DIR = pathlib.Path(__file__).parent.parent.parent  # C:/temp/genogram-b
RESULTS_DIR = pathlib.Path(__file__).parent / "results"
RUNS_PER_SCENARIO = 3   # repeat each scenario N times, then average
WARM_ITERATIONS = 30    # consecutive renders for warm timing
FPS_DURATION_MS = 2000  # ms for each FPS measurement window
VIEWPORT_W, VIEWPORT_H = 1400, 900

SCENARIOS = [
    {"name": "small",  "n_persons": 20,  "n_target_rels": 40},
    {"name": "medium", "n_persons": 100, "n_target_rels": 200},
    {"name": "large",  "n_persons": 200, "n_target_rels": 400},
]

# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def wait_for_port(host: str, port: int, timeout: float = 10.0) -> None:
    """Block until the TCP port is listening."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"Port {port} did not open within {timeout}s")


def percentile(data: list, pct: float) -> float:
    """Return the p-th percentile of a sorted or unsorted list."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    k = (len(sorted_data) - 1) * pct / 100
    lo, hi = int(k), min(int(k) + 1, len(sorted_data) - 1)
    return sorted_data[lo] + (sorted_data[hi] - sorted_data[lo]) * (k - lo)


def get_git_commit(cwd: pathlib.Path) -> str:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, cwd=cwd
        )
        return result.stdout.strip() or "unknown"
    except Exception:
        return "unknown"


# ---------------------------------------------------------------------------
# JS helpers injected into page
# ---------------------------------------------------------------------------

# Seed persons and relationships programmatically.
# Grid layout: persons placed on a 10-col grid.
# Relationships: spouse pairs (i, i+1), parent-child (i -> i+10, i+1 -> i+10).
SEED_JS = """
(function(nPersons) {
    const app = window.app;
    // Clear existing data without triggering history / autosave side-effects
    app.persons = [];
    app.relationships = [];
    app.households = [];
    app.lifeCircles = [];
    app.selectedPersonId = null;
    app.selectedRelationshipId = null;
    app.selectedPersonIds = [];

    const cols = 10;
    for (let i = 0; i < nPersons; i++) {
        const gender = i % 2 === 0 ? 'male' : 'female';
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 200 + col * 130;
        const y = 200 + row * 160;
        app.persons.push(new Person({
            id: 'p' + i,
            name: 'P' + i,
            gender: gender,
            x: x,
            y: y
        }));
    }

    // Relationships: spouse pairs + parent-child links
    for (let i = 0; i < nPersons; i += 2) {
        if (i + 1 < nPersons) {
            app.relationships.push(new Relationship({
                fromPersonId: 'p' + i,
                toPersonId: 'p' + (i + 1),
                type: 'married'
            }));
        }
        // parent -> child two rows down (i+10 in same grid)
        const childIdx = i + 10;
        if (childIdx < nPersons) {
            app.relationships.push(new Relationship({
                fromPersonId: 'p' + i,
                toPersonId: 'p' + childIdx,
                type: 'parent-child'
            }));
            if (i + 1 < nPersons && childIdx < nPersons) {
                app.relationships.push(new Relationship({
                    fromPersonId: 'p' + (i + 1),
                    toPersonId: 'p' + childIdx,
                    type: 'parent-child'
                }));
            }
        }
        // sibling links: adjacent even-index pairs share a child
        const siblingIdx = i + 12;
        if (siblingIdx < nPersons) {
            app.relationships.push(new Relationship({
                fromPersonId: 'p' + i,
                toPersonId: 'p' + siblingIdx,
                type: 'parent-child'
            }));
        }
    }

    // Return actual counts for verification
    return { persons: app.persons.length, relationships: app.relationships.length };
})(PLACEHOLDER_N)
"""

COLD_RENDER_JS = """
() => {
    const t0 = performance.now();
    window.app.render();
    const t1 = performance.now();
    return t1 - t0;
}
"""

WARM_RENDER_JS = """
(iterations) => {
    const times = [];
    for (let i = 0; i < iterations; i++) {
        const t0 = performance.now();
        window.app.render();
        const t1 = performance.now();
        times.push(t1 - t0);
    }
    return times;
}
"""

PAN_FPS_JS = """
(durationMs) => {
    return new Promise((resolve) => {
        const app = window.app;
        const startOffX = app.canvas.offsetX || 0;
        const startOffY = app.canvas.offsetY || 0;
        let frames = 0;
        let elapsed = 0;
        let lastTs = null;

        function frame(ts) {
            if (lastTs === null) { lastTs = ts; }
            const delta = ts - lastTs;
            lastTs = ts;
            elapsed += delta;

            // Sinusoidal pan: oscillate +/- 100px
            const phase = (elapsed / durationMs) * Math.PI * 4;
            app.canvas.offsetX = startOffX + Math.sin(phase) * 100;
            app.canvas.offsetY = startOffY + Math.cos(phase) * 60;
            app.render();
            frames++;

            if (elapsed < durationMs) {
                requestAnimationFrame(frame);
            } else {
                // Restore
                app.canvas.offsetX = startOffX;
                app.canvas.offsetY = startOffY;
                resolve(frames / (elapsed / 1000));
            }
        }
        requestAnimationFrame(frame);
    });
}
"""

ZOOM_FPS_JS = """
(durationMs) => {
    return new Promise((resolve) => {
        const app = window.app;
        const origScale = app.canvas.scale;
        let frames = 0;
        let elapsed = 0;
        let lastTs = null;

        function frame(ts) {
            if (lastTs === null) { lastTs = ts; }
            const delta = ts - lastTs;
            lastTs = ts;
            elapsed += delta;

            // Smooth scale animation: 1.0 -> 0.5 -> 1.5 over durationMs
            const t = elapsed / durationMs;
            // triangle wave: goes 0->1->0 over [0,0.5] then [0.5,1]
            const tri = t < 0.5 ? t * 2 : 2 - t * 2;
            app.canvas.scale = 0.5 + tri * 1.0;  // range [0.5, 1.5]
            app.render();
            frames++;

            if (elapsed < durationMs) {
                requestAnimationFrame(frame);
            } else {
                app.canvas.scale = origScale;
                app.render();
                resolve(frames / (elapsed / 1000));
            }
        }
        requestAnimationFrame(frame);
    });
}
"""

FIND_COUNT_JS = """
() => {
    // Monkey-patch Array.prototype.find to count calls during one render
    let count = 0;
    const orig = Array.prototype.find;
    Array.prototype.find = function(...args) {
        count++;
        return orig.apply(this, args);
    };
    window.app.render();
    Array.prototype.find = orig;  // restore immediately
    return count;
}
"""


# ---------------------------------------------------------------------------
# Core benchmark routine
# ---------------------------------------------------------------------------

def run_scenario(page, scenario: dict, run_idx: int) -> dict:
    """
    Run all measurements for one scenario on the given Playwright page.
    Returns a dict of raw metric values for this single run.
    """
    n = scenario["n_persons"]
    name = scenario["name"]

    # --- Seed data ---
    seed_code = SEED_JS.replace("PLACEHOLDER_N", str(n))
    seed_result = page.evaluate(seed_code)
    actual_persons = seed_result["persons"]
    actual_rels = seed_result["relationships"]

    # Give the browser a frame to settle after data injection
    page.wait_for_timeout(100)

    # --- Cold render ---
    cold_ms = page.evaluate(COLD_RENDER_JS)

    # --- Warm render (30 iterations) ---
    warm_times = page.evaluate(WARM_RENDER_JS, WARM_ITERATIONS)
    warm_avg_ms = statistics.mean(warm_times)
    warm_p95_ms = percentile(warm_times, 95)

    # --- find() call count (monkey-patch, optional) ---
    try:
        find_count = page.evaluate(FIND_COUNT_JS)
    except Exception:
        find_count = -1

    # --- Pan FPS ---
    pan_fps = page.evaluate(f"({PAN_FPS_JS})({FPS_DURATION_MS})")

    # --- Zoom FPS ---
    zoom_fps = page.evaluate(f"({ZOOM_FPS_JS})({FPS_DURATION_MS})")

    return {
        "scenario": name,
        "run": run_idx,
        "n_persons": actual_persons,
        "n_relationships": actual_rels,
        "cold_ms": round(cold_ms, 3),
        "warm_avg_ms": round(warm_avg_ms, 3),
        "warm_p95_ms": round(warm_p95_ms, 3),
        "find_count": find_count,
        "pan_fps": round(pan_fps, 2),
        "zoom_fps": round(zoom_fps, 2),
    }


def aggregate_runs(runs: list) -> dict:
    """Average numeric fields across multiple runs of the same scenario."""
    keys = ["cold_ms", "warm_avg_ms", "warm_p95_ms", "pan_fps", "zoom_fps", "find_count"]
    result = {
        "scenario": runs[0]["scenario"],
        "n_persons": runs[0]["n_persons"],
        "n_relationships": runs[0]["n_relationships"],
        "runs": len(runs),
    }
    for k in keys:
        vals = [r[k] for r in runs if r[k] >= 0]
        if vals:
            result[k] = round(statistics.mean(vals), 3)
            result[k + "_min"] = round(min(vals), 3)
            result[k + "_max"] = round(max(vals), 3)
        else:
            result[k] = -1
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    commit = get_git_commit(SERVE_DIR)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Genogram FPS / Render Benchmark")
    print(f"  commit  : {commit}")
    print(f"  date    : {timestamp}")
    print(f"  runs    : {RUNS_PER_SCENARIO} per scenario")
    print(f"  warm N  : {WARM_ITERATIONS} iterations")
    print("=" * 60)

    # Start HTTP server
    server_proc = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--directory", str(SERVE_DIR)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"HTTP server PID {server_proc.pid} starting on port {PORT}...")

    all_raw_runs = []
    aggregated = []

    try:
        wait_for_port("127.0.0.1", PORT, timeout=15)
        print("HTTP server ready.\n")

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=[
                    "--disable-gpu",
                    "--no-sandbox",
                    "--force-device-scale-factor=1",
                ],
            )
            context = browser.new_context(
                viewport={"width": VIEWPORT_W, "height": VIEWPORT_H},
                device_scale_factor=1,
            )
            page = context.new_page()

            # Suppress console noise from the app
            page.on("console", lambda msg: None)

            # Load app
            print(f"Loading {BASE_URL} ...")
            page.goto(BASE_URL, wait_until="networkidle", timeout=30000)

            # Wait for window.app to be initialised
            page.wait_for_function("() => !!window.app && typeof window.app.render === 'function'",
                                   timeout=15000)

            # Get browser info
            browser_version = browser.version
            user_agent = page.evaluate("() => navigator.userAgent")
            print(f"Browser : Chromium {browser_version}")
            print(f"UA      : {user_agent[:80]}...")
            print()

            for scenario in SCENARIOS:
                print(f"--- Scenario: {scenario['name']} ({scenario['n_persons']} persons) ---")
                runs_for_scenario = []
                for run_idx in range(1, RUNS_PER_SCENARIO + 1):
                    print(f"  Run {run_idx}/{RUNS_PER_SCENARIO}...", end=" ", flush=True)
                    result = run_scenario(page, scenario, run_idx)
                    runs_for_scenario.append(result)
                    all_raw_runs.append(result)
                    print(f"cold={result['cold_ms']:.1f}ms  "
                          f"warm_avg={result['warm_avg_ms']:.1f}ms  "
                          f"pan={result['pan_fps']:.1f}fps  "
                          f"zoom={result['zoom_fps']:.1f}fps  "
                          f"find={result['find_count']}")

                agg = aggregate_runs(runs_for_scenario)
                aggregated.append(agg)
                print(f"  => AVG  cold={agg['cold_ms']:.1f}ms  "
                      f"warm_avg={agg['warm_avg_ms']:.1f}ms  "
                      f"warm_p95={agg['warm_p95_ms']:.1f}ms  "
                      f"pan={agg['pan_fps']:.1f}fps  "
                      f"zoom={agg['zoom_fps']:.1f}fps\n")

            browser.close()

    finally:
        server_proc.terminate()
        try:
            server_proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server_proc.kill()
        print("HTTP server stopped.")

    # --- Build output JSON ---
    output = {
        "date": timestamp,
        "commit": commit,
        "environment": {
            "viewport": f"{VIEWPORT_W}x{VIEWPORT_H}",
            "dpr": 1,
            "runs_per_scenario": RUNS_PER_SCENARIO,
            "warm_iterations": WARM_ITERATIONS,
            "fps_duration_ms": FPS_DURATION_MS,
            "python": sys.version,
        },
        "summary": aggregated,
        "raw_runs": all_raw_runs,
    }

    out_path = RESULTS_DIR / f"baseline-{timestamp}.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # --- Console summary table ---
    print()
    print("=" * 60)
    print("BENCHMARK RESULTS SUMMARY")
    print("=" * 60)
    header = f"{'Scenario':<10} {'Persons':>8} {'Rels':>6} {'cold_ms':>9} {'warm_avg':>9} {'warm_p95':>9} {'pan_fps':>9} {'zoom_fps':>9} {'find':>7}"
    print(header)
    print("-" * len(header))
    for a in aggregated:
        print(
            f"{a['scenario']:<10} "
            f"{a['n_persons']:>8} "
            f"{a['n_relationships']:>6} "
            f"{a['cold_ms']:>9.2f} "
            f"{a['warm_avg_ms']:>9.2f} "
            f"{a['warm_p95_ms']:>9.2f} "
            f"{a['pan_fps']:>9.1f} "
            f"{a['zoom_fps']:>9.1f} "
            f"{a.get('find_count', -1):>7}"
        )
    print()
    print(f"Results saved to: {out_path}")
    print("Done.")

    return str(out_path)


if __name__ == "__main__":
    main()
