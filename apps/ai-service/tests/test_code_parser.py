from pathlib import Path

from app.services.code_parser import extract_chunks, parse_file

TYPESCRIPT_SAMPLE = """import { useState } from "react";

function add(a: number, b: number): number {
  return a + b;
}

function subtract(a: number, b: number): number {
  return a - b;
}

class Calculator {
  value: number = 0;
}
"""

PYTHON_SAMPLE = """def add(a, b):
    return a + b
"""


def test_typescript_file_extracts_functions_class_and_file_summary(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.ts"
    file_path.write_text(TYPESCRIPT_SAMPLE)

    tree = parse_file(str(file_path), "TypeScript")
    assert tree is not None

    chunks = extract_chunks(tree, TYPESCRIPT_SAMPLE.encode("utf-8"), str(file_path), "TypeScript")

    # 1 file_summary + 2 functions + 1 class — no methods here, so no
    # ambiguity about whether nested method chunks should also be counted.
    assert len(chunks) == 4

    by_type = {}
    for chunk in chunks:
        by_type.setdefault(chunk.chunk_type, []).append(chunk)

    assert {c.chunk_type for c in chunks} == {"file_summary", "function", "class"}
    assert len(by_type["function"]) == 2
    assert len(by_type["class"]) == 1
    assert len(by_type["file_summary"]) == 1

    functions_by_name = {c.name: c for c in by_type["function"]}
    assert set(functions_by_name) == {"add", "subtract"}

    add_chunk = functions_by_name["add"]
    assert add_chunk.start_line == 3
    assert add_chunk.end_line == 5
    assert add_chunk.file_path == str(file_path)
    assert add_chunk.language == "TypeScript"
    assert "return a + b" in add_chunk.content

    subtract_chunk = functions_by_name["subtract"]
    assert subtract_chunk.start_line == 7
    assert subtract_chunk.end_line == 9
    assert "return a - b" in subtract_chunk.content

    class_chunk = by_type["class"][0]
    assert class_chunk.name == "Calculator"
    assert class_chunk.start_line == 11
    assert class_chunk.end_line == 13
    assert "class Calculator" in class_chunk.content

    summary_chunk = by_type["file_summary"][0]
    assert summary_chunk.name is None
    assert str(file_path) in summary_chunk.content
    assert 'import { useState } from "react";' in summary_chunk.content
    assert summary_chunk.start_line == 1
    assert summary_chunk.end_line == 1


def test_python_file_extracts_one_function_and_file_summary(tmp_path: Path) -> None:
    file_path = tmp_path / "sample.py"
    file_path.write_text(PYTHON_SAMPLE)

    tree = parse_file(str(file_path), "Python")
    assert tree is not None

    chunks = extract_chunks(tree, PYTHON_SAMPLE.encode("utf-8"), str(file_path), "Python")

    # 1 file_summary + 1 function.
    assert len(chunks) == 2

    function_chunks = [c for c in chunks if c.chunk_type == "function"]
    summary_chunks = [c for c in chunks if c.chunk_type == "file_summary"]
    assert len(function_chunks) == 1
    assert len(summary_chunks) == 1

    add_chunk = function_chunks[0]
    assert add_chunk.name == "add"
    assert add_chunk.start_line == 1
    assert add_chunk.end_line == 2
    assert add_chunk.language == "Python"
    assert "return a + b" in add_chunk.content

    # No imports in this file — file_summary still always gets produced.
    summary_chunk = summary_chunks[0]
    assert summary_chunk.name is None
    assert str(file_path) in summary_chunk.content
