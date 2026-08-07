import logging

from pydantic import BaseModel
from tree_sitter import Node, Parser, Tree
from tree_sitter_languages import get_parser as _get_ts_parser

logger = logging.getLogger(__name__)

# Maps our detected language names (see app/services/repo_analyzer.py's
# LANGUAGE_EXTENSIONS) to tree-sitter-languages' grammar keys. Not every
# entry here necessarily has a bundled grammar — get_parser() falls back
# gracefully (see below) for whichever ones don't.
LANGUAGE_KEY_MAP: dict[str, str] = {
    "TypeScript": "typescript",
    "JavaScript": "javascript",
    "Python": "python",
    "Go": "go",
    "Java": "java",
    "Ruby": "ruby",
    "PHP": "php",
    "C#": "c_sharp",
    "C++": "cpp",
    "C": "c",
    "Rust": "rust",
    "Kotlin": "kotlin",
    "Scala": "scala",
    "Shell": "bash",
    "SQL": "sql",
    "HTML": "html",
    "CSS": "css",
}

_parser_cache: dict[str, Parser | None] = {}


def get_parser(language: str) -> Parser | None:
    """Returns a cached tree-sitter Parser for `language`.

    Returns None if there's no tree-sitter grammar available for it (either
    we have no mapping for it, or tree-sitter-languages doesn't bundle it) —
    callers should use fallback_chunk_lines() for that file instead of
    treating this as an error.
    """
    if language in _parser_cache:
        return _parser_cache[language]

    lang_key = LANGUAGE_KEY_MAP.get(language)
    parser: Parser | None = None

    if lang_key:
        try:
            parser = _get_ts_parser(lang_key)
        except Exception:
            parser = None

    if parser is None:
        logger.warning("no tree-sitter grammar for %s, using fallback chunker", language)

    _parser_cache[language] = parser
    return parser


def parse_file(file_path: str, language: str) -> Tree | None:
    """Parses `file_path` with the tree-sitter grammar for `language`.

    Returns None (logging a warning, never raising) if the file can't be
    read, isn't valid UTF-8, or has no available grammar — callers should
    fall back to fallback_chunk_lines() in the no-grammar case rather than
    treating a None return as fatal to the whole indexing job.
    """
    try:
        with open(file_path, "rb") as f:
            content_bytes = f.read()
    except OSError as exc:
        logger.warning("could not read %s: %s", file_path, exc)
        return None

    try:
        content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("skipping %s: not valid UTF-8", file_path)
        return None

    parser = get_parser(language)
    if parser is None:
        return None

    return parser.parse(content_bytes)


def fallback_chunk_lines(file_path: str, lines_per_chunk: int = 50) -> list[str]:
    """Simple line-based chunker for files parse_file() couldn't produce a
    real syntax tree for (no grammar available). Not a tree-sitter Tree —
    just fixed-size groups of lines, good enough to still embed/index a file
    in a language we don't have a grammar for.
    """
    try:
        with open(file_path, "rb") as f:
            content_bytes = f.read()
    except OSError as exc:
        logger.warning("could not read %s for fallback chunking: %s", file_path, exc)
        return []

    try:
        text = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("skipping %s: not valid UTF-8, cannot fallback-chunk", file_path)
        return []

    lines = text.splitlines()
    return ["\n".join(lines[i : i + lines_per_chunk]) for i in range(0, len(lines), lines_per_chunk)]


class CodeChunk(BaseModel):
    content: str
    file_path: str
    chunk_type: str  # "function" | "class" | "method" | "fallback_block" | "file_summary"
    name: str | None
    start_line: int
    end_line: int
    language: str


# Which node types count as a chunkable declaration per language, and the
# base chunk_type each maps to. Extensible — add a language by adding an
# entry here (and to IMPORT_NODE_TYPES_BY_LANGUAGE below for file_summary).
NODE_TYPES_BY_LANGUAGE: dict[str, dict[str, str]] = {
    "TypeScript": {
        "function_declaration": "function",
        "method_definition": "method",
        "class_declaration": "class",
        "arrow_function": "function",
    },
    "JavaScript": {
        "function_declaration": "function",
        "method_definition": "method",
        "class_declaration": "class",
        "arrow_function": "function",
    },
    "Python": {
        "function_definition": "function",
        "class_definition": "class",
    },
}

IMPORT_NODE_TYPES_BY_LANGUAGE: dict[str, set[str]] = {
    "TypeScript": {"import_statement"},
    "JavaScript": {"import_statement"},
    "Python": {"import_statement", "import_from_statement"},
}

# ~2000 tokens, estimated as len(content) // 4 (no real tokenizer needed).
MAX_CHUNK_TOKENS = 2000
FALLBACK_BLOCK_LINES = 500
FALLBACK_BLOCK_OVERLAP_LINES = 50

# Node types, across the two grammars above, that hold a construct's name.
_NAME_NODE_TYPES = ("identifier", "property_identifier", "type_identifier")

# Node types that hold a block's statements — used to find what to split an
# oversized chunk by.
_BODY_NODE_TYPES = ("statement_block", "block", "class_body")


def _walk(node: Node):
    yield node
    for child in node.children:
        yield from _walk(child)


def _extract_name(node: Node | None, source_code: bytes) -> str | None:
    if node is None:
        return None
    for child in node.children:
        if child.type in _NAME_NODE_TYPES:
            return source_code[child.start_byte : child.end_byte].decode("utf-8", errors="replace")
    return None


def _is_named_arrow_function(node: Node) -> bool:
    # const foo = () => {} -> parent is variable_declarator (has a name).
    # array.map(x => x + 1) -> parent is arguments/call_expression (anonymous
    # inline callback) — deliberately excluded so we don't chunk every tiny
    # callback passed as an argument.
    return node.parent is not None and node.parent.type == "variable_declarator"


def _is_python_method(node: Node) -> bool:
    # class Foo:\n    def bar(self): ... -> class_definition > block > function_definition
    parent = node.parent
    return (
        parent is not None
        and parent.type == "block"
        and parent.parent is not None
        and parent.parent.type == "class_definition"
    )


def _node_text(node: Node, source_code: bytes) -> str:
    return source_code[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _get_body_node(node: Node) -> Node | None:
    for child in node.children:
        if child.type in _BODY_NODE_TYPES:
            return child
    return None


def _make_chunk(
    content: str, file_path: str, chunk_type: str, name: str | None, start_line: int, end_line: int, language: str
) -> CodeChunk:
    return CodeChunk(
        content=content,
        file_path=file_path,
        chunk_type=chunk_type,
        name=name,
        start_line=start_line,
        end_line=end_line,
        language=language,
    )


def _split_large_node(
    node: Node, source_code: bytes, file_path: str, chunk_type: str, name: str | None, language: str
) -> list[CodeChunk]:
    """A function/class too large to embed as one chunk: broken up by its
    top-level statements (the direct children of its body) into consecutive
    groups that each stay under the size guard, in source order.
    """
    body = _get_body_node(node)
    if body is None or not body.children:
        return [
            _make_chunk(
                _node_text(node, source_code),
                file_path,
                chunk_type,
                name,
                node.start_point[0] + 1,
                node.end_point[0] + 1,
                language,
            )
        ]

    max_chars = MAX_CHUNK_TOKENS * 4
    chunks: list[CodeChunk] = []
    group: list[Node] = []

    def flush() -> None:
        if not group:
            return
        start_byte = group[0].start_byte
        end_byte = group[-1].end_byte
        chunks.append(
            _make_chunk(
                source_code[start_byte:end_byte].decode("utf-8", errors="replace"),
                file_path,
                chunk_type,
                name,
                group[0].start_point[0] + 1,
                group[-1].end_point[0] + 1,
                language,
            )
        )

    for child in body.children:
        # Measured as the full span from the group's start to this child's
        # end — not summed per-child lengths, which would silently ignore
        # the whitespace/newlines *between* statements and let a flushed
        # group's actual text run well past max_chars.
        if group and (child.end_byte - group[0].start_byte) > max_chars:
            flush()
            group = []
        group.append(child)

    flush()
    return chunks


def _fallback_block_chunks(source_code: bytes, file_path: str, language: str) -> list[CodeChunk]:
    """Used when Tree-sitter found no chunkable declarations at all (no
    grammar, or a file — config, JSON, etc. — with none of the matched node
    types): fixed ~500-line blocks with 50 lines of overlap between
    consecutive blocks, so a boundary never silently splits something
    relevant in half.
    """
    try:
        text = source_code.decode("utf-8")
    except UnicodeDecodeError:
        logger.warning("skipping %s: not valid UTF-8, cannot fallback-chunk", file_path)
        return []

    lines = text.splitlines()
    if not lines:
        return []

    chunks: list[CodeChunk] = []
    step = FALLBACK_BLOCK_LINES - FALLBACK_BLOCK_OVERLAP_LINES
    start = 0
    while start < len(lines):
        end = min(start + FALLBACK_BLOCK_LINES, len(lines))
        chunks.append(
            _make_chunk(
                "\n".join(lines[start:end]),
                file_path,
                "fallback_block",
                None,
                start + 1,
                end,
                language,
            )
        )
        if end == len(lines):
            break
        start += step

    return chunks


def _build_file_summary_chunk(tree: Tree | None, source_code: bytes, file_path: str, language: str) -> CodeChunk:
    """Always produced, one per file: just the import statements (if any)
    plus the file path, so RAG retrieval has a lightweight signal of what a
    file depends on even when the matched function/class chunk doesn't
    itself show its imports.
    """
    import_types = IMPORT_NODE_TYPES_BY_LANGUAGE.get(language, set())
    import_nodes: list[Node] = []
    if tree is not None and import_types:
        import_nodes = [child for child in tree.root_node.children if child.type in import_types]

    if import_nodes:
        import_text = "\n".join(_node_text(n, source_code) for n in import_nodes)
        start_line = import_nodes[0].start_point[0] + 1
        end_line = import_nodes[-1].end_point[0] + 1
    else:
        import_text = ""
        start_line = 1
        end_line = 1

    content = f"# {file_path}\n{import_text}".rstrip()

    return _make_chunk(content, file_path, "file_summary", None, start_line, end_line, language)


def extract_chunks(tree: Tree | None, source_code: bytes, file_path: str, language: str) -> list[CodeChunk]:
    """Extracts function/class/method chunks from a parsed file, always plus
    one file_summary chunk. Falls back to fixed-size overlapping blocks
    (chunk_type="fallback_block") when there's no tree, no config for the
    language, or the tree simply has none of the matched node types (e.g. a
    JSON/config file).
    """
    node_types = NODE_TYPES_BY_LANGUAGE.get(language)
    chunks: list[CodeChunk] = []

    if tree is not None and node_types:
        for node in _walk(tree.root_node):
            base_type = node_types.get(node.type)
            if base_type is None:
                continue

            if node.type == "arrow_function" and not _is_named_arrow_function(node):
                continue

            name_source = node.parent if node.type == "arrow_function" else node
            name = _extract_name(name_source, source_code)

            chunk_type = "method" if node.type == "function_definition" and _is_python_method(node) else base_type

            content = _node_text(node, source_code)
            if len(content) // 4 > MAX_CHUNK_TOKENS:
                chunks.extend(_split_large_node(node, source_code, file_path, chunk_type, name, language))
            else:
                chunks.append(
                    _make_chunk(
                        content,
                        file_path,
                        chunk_type,
                        name,
                        node.start_point[0] + 1,
                        node.end_point[0] + 1,
                        language,
                    )
                )

    if not chunks:
        chunks = _fallback_block_chunks(source_code, file_path, language)

    return [_build_file_summary_chunk(tree, source_code, file_path, language), *chunks]
