#!/usr/bin/env python3
"""Convert a Wrangler D1 SQL export into portable JSON without network access."""
from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path

TABLES = [
    "settings", "jobs", "runs", "error_logs", "prompts", "events", "sync_state", "drive_files",
    "agent_keys", "managed_agents", "agent_control_requests", "agent_connection_tests", "commands",
    "command_events", "command_artifacts", "screenshots", "automations", "automation_versions", "automation_runs",
]


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert a D1 SQL export to JSON for the PostgreSQL importer")
    parser.add_argument("input", type=Path, help="SQL file produced by wrangler d1 export")
    parser.add_argument("output", type=Path, help="JSON output path (keep it outside Git)")
    args = parser.parse_args()

    sql = args.input.read_text(encoding="utf-8")
    connection = sqlite3.connect(":memory:")
    connection.row_factory = sqlite3.Row
    try:
        connection.executescript(sql)
        existing = {
            row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
        }
        payload: dict[str, list[dict[str, object]]] = {}
        for table in TABLES:
            if table not in existing:
                continue
            payload[table] = [dict(row) for row in connection.execute(f'SELECT * FROM "{table}"')]
        args.output.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        total = sum(len(rows) for rows in payload.values())
        print(f"Export converted: {len(payload)} tables, {total} rows -> {args.output}")
    finally:
        connection.close()


if __name__ == "__main__":
    main()
