#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""بررسی قواعد فایل‌های job_*.py با AST واقعی پایتون.

این نسخه اختیاری برای اجرای محلی است؛ همان قواعدی را دارد که پنل مدیر
در Worker با تحلیل سبک اعمال می‌کند. اگر خواستید پیش از کامیت یک فایل را
با دقت بیشتری بررسی کنید:

    python scripts/lint_job.py path/to/job_x.py
    python scripts/lint_job.py path/to/job_x.py --strict   # مسیر مطلق ویندوز = خطا
    python scripts/lint_job.py --dir .                     # همه‌ی job_*.py ریشه

خروجی ۰ یعنی هیچ خطایی نیست (هشدارها مانع نیستند).
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from pathlib import Path

MAX_BYTES = 512 * 1024
MAX_RUNTIME = 600
NAME_RE = re.compile(r"^job_[A-Za-z0-9_]+\.py$")
PATH_RE = re.compile(r"(?:^|[^A-Za-z])[A-Za-z]:[\\/]")

INTERACTIVE = {"input", "getpass"}
STDLIB = set(sys.stdlib_module_names) if hasattr(sys, "stdlib_module_names") else set()
STDLIB |= {"__future__"}


def issue(code, message, *, line=None, severity="error", hint=None):
    item = {"code": code, "message": message, "severity": severity}
    if line is not None:
        item["line"] = line
    if hint:
        item["hint"] = hint
    return item


def module_docstring_node(tree):
    if tree.body and isinstance(tree.body[0], ast.Expr):
        value = tree.body[0].value
        if isinstance(value, ast.Constant) and isinstance(value.value, str):
            return tree.body[0]
    return None


def check_imports(tree, errors):
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                top = alias.name.split(".")[0]
                if top not in STDLIB:
                    errors.append(
                        issue(
                            "non_stdlib_import",
                            f"ماژول «{alias.name}» جزو کتابخانه‌ی استاندارد پایتون نیست.",
                            line=node.lineno,
                            hint="پنل ویندوز pip install انجام نمی‌دهد؛ فقط کتابخانه استاندارد مجاز است.",
                        )
                    )
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                errors.append(
                    issue(
                        "relative_import",
                        "import نسبی مجاز نیست؛ فایل باید کاملاً مستقل باشد.",
                        line=node.lineno,
                    )
                )
                continue
            top = (node.module or "").split(".")[0]
            if top and top not in STDLIB:
                errors.append(
                    issue(
                        "non_stdlib_import",
                        f"ماژول «{node.module}» جزو کتابخانه‌ی استاندارد پایتون نیست.",
                        line=node.lineno,
                        hint="فقط کتابخانه استاندارد پایتون ۳.۹+ مجاز است.",
                    )
                )
        elif isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id in ("__import__", "eval", "exec"):
                if func.id == "__import__":
                    errors.append(
                        issue("dynamic_import", "import پویا (__import__) مجاز نیست.", line=node.lineno)
                    )
            if isinstance(func, ast.Attribute) and func.attr == "import_module":
                errors.append(
                    issue("dynamic_import", "import پویا (importlib.import_module) مجاز نیست.", line=node.lineno)
                )


def check_interactive(tree, errors):
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id in INTERACTIVE:
            errors.append(
                issue(
                    "uses_input",
                    f"از {func.id}() استفاده شده است.",
                    line=node.lineno,
                    hint="پنل ویندوز بدون کنسول اجرا می‌کند؛ ورودی تعاملی حذف شود.",
                )
            )
        if isinstance(func, ast.Attribute) and func.attr == "read":
            base = func.value
            if isinstance(base, ast.Attribute) and base.attr == "stdin":
                errors.append(
                    issue("uses_input", "از stdin خوانده می‌شود.", line=node.lineno)
                )


def check_paths(tree, errors, warnings, strict):
    doc_node = module_docstring_node(tree)
    for node in ast.walk(tree):
        if not isinstance(node, ast.Constant) or not isinstance(node.value, str):
            continue
        if node is getattr(doc_node, "value", None):
            continue
        if PATH_RE.search(node.value) or re.search(r"\\\\Users\\\\", node.value, re.I):
            bucket = errors if strict else warnings
            bucket.append(
                issue(
                    "absolute_windows_path",
                    "مسیر مطلق ویندوزی در کد وجود دارد.",
                    line=node.lineno,
                    severity="error" if strict else "warning",
                    hint="از Path.home() یا os.environ[\"USERPROFILE\"] استفاده کنید.",
                )
            )
            break


def check_runtime(tree, errors, warnings):
    has_print = False
    has_break = False
    has_main = False
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            if isinstance(func, ast.Name) and func.id == "print":
                has_print = True
            if isinstance(func, ast.Attribute) and func.attr == "sleep":
                arg = node.args[0] if node.args else None
                if isinstance(arg, ast.Constant) and isinstance(arg.value, (int, float)) and arg.value > MAX_RUNTIME:
                    errors.append(
                        issue(
                            "sleep_too_long",
                            f"time.sleep({arg.value}) از حداکثر زمان اجرا ({MAX_RUNTIME} ثانیه) بیشتر است.",
                            line=node.lineno,
                        )
                    )
            if isinstance(func, ast.Attribute) and func.attr == "run":
                for kw in node.keywords:
                    if kw.arg == "shell" and isinstance(kw.value, ast.Constant) and kw.value.value is True:
                        warnings.append(
                            issue(
                                "shell_true",
                                "subprocess با shell=True اجرا می‌شود؛ ریسک تزریق دستور دارد.",
                                line=node.lineno,
                                severity="warning",
                            )
                        )
        if isinstance(node, ast.Break):
            has_break = True
        if isinstance(node, ast.While) and isinstance(node.test, ast.Constant) and node.test.value is True and not has_break:
            warnings.append(
                issue(
                    "infinite_loop",
                    "حلقه‌ی while True بدون break دیده می‌شود.",
                    line=node.lineno,
                    severity="warning",
                    hint="حداکثر زمان اجرا ۶۰۰ ثانیه است.",
                )
            )
        if isinstance(node, ast.If) and isinstance(node.test, ast.Compare):
            left = node.test.left
            if (
                isinstance(left, ast.Name)
                and left.id == "__name__"
                and isinstance(node.test.comparators[0], ast.Constant)
                and node.test.comparators[0].value == "__main__"
            ):
                has_main = True
    if not has_print:
        warnings.append(
            issue("no_print", "هیچ print() در کد نیست؛ خروجی متنی برای گزارش اجرا لازم است.", severity="warning")
        )
    if not has_main:
        warnings.append(
            issue(
                "no_main_guard",
                'بلوک if __name__ == "__main__" دیده نمی‌شود.',
                severity="warning",
                hint="اختیاری است، اما برای اجرای مستقیم امن‌تر است.",
            )
        )


def lint_source(source: str, name: str | None, strict: bool):
    errors, warnings = [], []
    if name:
        if not NAME_RE.match(name):
            errors.append(
                issue(
                    "name_chars",
                    "نام فایل باید job_ و فقط حروف لاتین/عدد/زیرخط باشد و مستقیم در ریشه باشد.",
                )
            )
    if len(source.encode("utf-8")) > MAX_BYTES:
        errors.append(issue("file_too_large", "حجم فایل بیش از ۵۱۲ کیلوبایت است."))
    try:
        tree = ast.parse(source, filename=name or "<job>")
    except SyntaxError as exc:
        errors.append(
            issue(
                "syntax_error",
                f"خطای نگارشی پایتون: {exc.msg}",
                line=exc.lineno,
                hint="فایل را با python -m py_compile بررسی کنید.",
            )
        )
        return errors, warnings
    check_imports(tree, errors)
    check_interactive(tree, errors)
    check_paths(tree, errors, warnings, strict)
    check_runtime(tree, errors, warnings)
    return errors, warnings


def main(argv=None):
    parser = argparse.ArgumentParser(description="بررسی قواعد job_*.py برای پنل مدیریت ویندوز")
    parser.add_argument("path", nargs="?", help="مسیر فایل job_*.py")
    parser.add_argument("--dir", default=None, help="بررسی همه‌ی job_*.py در یک پوشه")
    parser.add_argument("--strict", action="store_true", help="مسیر مطلق ویندوز را خطا بدان")
    parser.add_argument("--json", action="store_true", help="خروجی JSON")
    args = parser.parse_args(argv)

    targets = []
    if args.dir:
        targets = sorted(Path(args.dir).glob("job_*.py"))
        if not targets:
            print("هیچ فایل job_*.py پیدا نشد.", file=sys.stderr)
            return 2
    elif args.path:
        targets = [Path(args.path)]
    else:
        parser.print_help()
        return 2

    failed = False
    report = []
    for path in targets:
        source = path.read_text(encoding="utf-8", errors="replace")
        errors, warnings = lint_source(source, path.name, args.strict)
        failed = failed or bool(errors)
        report.append(
            {
                "file": str(path),
                "ok": not errors,
                "errors": errors,
                "warnings": warnings,
            }
        )

    if args.json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for item in report:
            print(f"\n{item['file']} — {'قبول' if item['ok'] else 'رد'}")
            for err in item["errors"]:
                line = f" (خط {err['line']})" if err.get("line") else ""
                print(f"  ✗ [{err['code']}]{line} {err['message']}")
            for warn in item["warnings"]:
                line = f" (خط {warn['line']})" if warn.get("line") else ""
                print(f"  ! [{warn['code']}]{line} {warn['message']}")
        print("\nنتیجه:", "خطا دارد" if failed else "قبول")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
