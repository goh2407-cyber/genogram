"""
compare.py - Compare two baseline JSON files (before vs after Agent P optimization).

Usage:
    python refactor/benchmarks/compare.py results/baseline-BEFORE.json results/baseline-AFTER.json

Prints a delta table showing percentage change for each metric per scenario.
Lower ms = better. Higher fps = better. Lower find_count = better (fewer linear scans).
"""

import sys
import json


def load(path: str) -> dict:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def pct_change(before: float, after: float) -> str:
    if before == 0:
        return "n/a"
    delta = (after - before) / before * 100
    return f"{delta:+.1f}%"


def direction(metric: str, pct_str: str) -> str:
    """Annotate whether the change is an improvement."""
    if pct_str == "n/a":
        return ""
    val = float(pct_str.rstrip("%"))
    # Lower is better for latency metrics; higher is better for FPS
    if metric.endswith("_ms") or metric == "find_count":
        return " [FASTER]" if val < -5 else (" [SLOWER]" if val > 5 else "")
    else:  # fps
        return " [BETTER]" if val > 5 else (" [WORSE]" if val < -5 else "")


def main():
    if len(sys.argv) != 3:
        print("Usage: python compare.py <before.json> <after.json>")
        sys.exit(1)

    before = load(sys.argv[1])
    after = load(sys.argv[2])

    print(f"BEFORE : commit={before['commit']}  date={before['date']}")
    print(f"AFTER  : commit={after['commit']}  date={after['date']}")
    print()

    metrics = ["cold_ms", "warm_avg_ms", "warm_p95_ms", "pan_fps", "zoom_fps", "find_count"]
    col_w = 16
    header = f"{'Scenario':<10} " + " ".join(f"{m:>{col_w}}" for m in metrics)
    print(header)
    print("-" * len(header))

    b_map = {s["scenario"]: s for s in before["summary"]}
    a_map = {s["scenario"]: s for s in after["summary"]}

    for sc in ("small", "medium", "large"):
        b = b_map.get(sc, {})
        a = a_map.get(sc, {})
        row = f"{sc:<10} "
        for m in metrics:
            bv = b.get(m, 0) or 0
            av = a.get(m, 0) or 0
            pct = pct_change(bv, av)
            row += f"{pct:>{col_w}} "
        print(row)

    print()
    print("Notes:")
    print("  Latency metrics (*_ms, find_count): negative % = faster = improvement")
    print("  FPS metrics (*_fps):                positive % = smoother = improvement")
    print("  Threshold for flagging: +/-5%")
    print()

    # Absolute value comparison table
    print("ABSOLUTE VALUES (before -> after)")
    print("-" * 80)
    abs_header = f"{'Scenario':<10} {'Metric':<16} {'Before':>12} {'After':>12} {'Delta':>10}"
    print(abs_header)
    print("-" * len(abs_header))
    for sc in ("small", "medium", "large"):
        b = b_map.get(sc, {})
        a = a_map.get(sc, {})
        for m in metrics:
            bv = b.get(m, 0) or 0
            av = a.get(m, 0) or 0
            pct = pct_change(bv, av)
            ann = direction(m, pct)
            print(f"{sc:<10} {m:<16} {bv:>12.3f} {av:>12.3f} {pct:>10}{ann}")


if __name__ == "__main__":
    main()
