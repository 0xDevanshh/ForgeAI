import os
from typing import Any

from pydantic import BaseModel

SKIP_DIRS = {
    "node_modules",
    ".git",
    "venv",
    ".venv",
    "__pycache__",
    "dist",
    "build",
    ".next",
    "target",
    "vendor",
}

MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024  # 1MB
BINARY_SNIFF_BYTES = 1024
MAX_FOLDER_STRUCTURE_DEPTH = 3

# Simple, rule-based — not exhaustive. Extend by adding entries; no need for
# content-based/ML detection here.
LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".py": "Python",
    ".js": "JavaScript",
    ".jsx": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".go": "Go",
    ".java": "Java",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".c": "C",
    ".h": "C",
    ".hpp": "C++",
    ".rs": "Rust",
    ".swift": "Swift",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".scala": "Scala",
    ".sh": "Shell",
    ".bash": "Shell",
    ".sql": "SQL",
    ".html": "HTML",
    ".css": "CSS",
    ".scss": "SCSS",
}

# (marker filename, substring to look for in its content, framework name).
# File content is lowercased before matching, so keys here must be lowercase.
# package.json keys are quoted ('"next"') to avoid matching unrelated
# packages that merely start with the same name (e.g. "next-auth").
FRAMEWORK_RULES: list[tuple[str, str, str]] = [
    ("package.json", '"next"', "Next.js"),
    ("package.json", '"express"', "Express"),
    ("package.json", '"@prisma/client"', "Prisma"),
    ("requirements.txt", "fastapi", "FastAPI"),
    ("pyproject.toml", "fastapi", "FastAPI"),
    ("requirements.txt", "django", "Django"),
]


class RepoAnalysis(BaseModel):
    file_count: int
    languages: dict[str, int]
    frameworks: list[str]
    folder_structure: dict[str, Any]


def _is_binary(file_path: str) -> bool:
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(BINARY_SNIFF_BYTES)
    except OSError:
        return True
    return b"\0" in chunk


def _detect_frameworks(repo_path: str) -> list[str]:
    detected: list[str] = []
    content_cache: dict[str, str] = {}

    for marker_file, dependency_key, framework_name in FRAMEWORK_RULES:
        if marker_file not in content_cache:
            file_path = os.path.join(repo_path, marker_file)
            content = ""
            if os.path.isfile(file_path):
                try:
                    with open(file_path, encoding="utf-8", errors="ignore") as f:
                        content = f.read().lower()
                except OSError:
                    content = ""
            content_cache[marker_file] = content

        if dependency_key in content_cache[marker_file]:
            detected.append(framework_name)

    return detected


def _build_folder_structure(path: str, depth: int) -> dict[str, Any]:
    if depth > MAX_FOLDER_STRUCTURE_DEPTH:
        return {}

    structure: dict[str, Any] = {}
    try:
        entries = sorted(os.listdir(path))
    except OSError:
        return {}

    for entry in entries:
        if entry in SKIP_DIRS:
            continue
        entry_path = os.path.join(path, entry)
        if os.path.islink(entry_path):
            continue
        if os.path.isdir(entry_path):
            structure[entry] = _build_folder_structure(entry_path, depth + 1)

    return structure


def analyze_repo(repo_path: str) -> RepoAnalysis:
    file_count = 0
    languages: dict[str, int] = {}

    for dirpath, dirnames, filenames in os.walk(repo_path):
        # Prune in place so os.walk never descends into these at all.
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            file_path = os.path.join(dirpath, filename)

            try:
                if os.path.islink(file_path) or os.path.getsize(file_path) > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                continue

            if _is_binary(file_path):
                continue

            file_count += 1

            ext = os.path.splitext(filename)[1].lower()
            language = LANGUAGE_EXTENSIONS.get(ext)
            if language:
                languages[language] = languages.get(language, 0) + 1

    return RepoAnalysis(
        file_count=file_count,
        languages=languages,
        frameworks=_detect_frameworks(repo_path),
        folder_structure=_build_folder_structure(repo_path, depth=1),
    )
