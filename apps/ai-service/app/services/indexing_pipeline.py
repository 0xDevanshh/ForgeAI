import asyncio
import logging
import os
import time
from collections.abc import Iterator

from pydantic import BaseModel

from app.services.code_parser import CodeChunk, extract_chunks, parse_file
from app.services.repo_analyzer import (
    LANGUAGE_EXTENSIONS,
    MAX_FILE_SIZE_BYTES,
    SKIP_DIRS,
    RepoAnalysis,
    analyze_repo,
)
from app.services.repo_cloner import cleanup_repo, clone_repo

logger = logging.getLogger(__name__)


class ParseRepoRequest(BaseModel):
    repo_id: str
    clone_url: str
    branch: str
    job_id: str


class ParseResult(BaseModel):
    analysis: RepoAnalysis
    chunks: list[CodeChunk]
    chunk_count: int


def _iter_source_files(clone_path: str) -> Iterator[tuple[str, str]]:
    """Yields (file_path, detected_language) for every file under clone_path
    with a recognized language extension, applying the same directory
    skip-list and 1MB size guard as repo_analyzer.analyze_repo.
    """
    for dirpath, dirnames, filenames in os.walk(clone_path):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]

        for filename in filenames:
            ext = os.path.splitext(filename)[1].lower()
            language = LANGUAGE_EXTENSIONS.get(ext)
            if language is None:
                continue

            file_path = os.path.join(dirpath, filename)
            try:
                if os.path.islink(file_path) or os.path.getsize(file_path) > MAX_FILE_SIZE_BYTES:
                    continue
            except OSError:
                continue

            yield file_path, language


def _run_parse_stage_sync(request: ParseRepoRequest) -> ParseResult:
    clone_started_at = time.monotonic()
    logger.info(
        "cloning started: job_id=%s repo_id=%s branch=%s", request.job_id, request.repo_id, request.branch
    )

    clone_path = clone_repo(request.clone_url, request.branch, request.job_id)

    clone_duration = time.monotonic() - clone_started_at
    logger.info(
        "cloning done: job_id=%s repo_id=%s duration=%.2fs",
        request.job_id,
        request.repo_id,
        clone_duration,
    )

    try:
        analysis = analyze_repo(clone_path)

        parse_started_at = time.monotonic()
        logger.info(
            "parsing started: job_id=%s repo_id=%s file_count=%d",
            request.job_id,
            request.repo_id,
            analysis.file_count,
        )

        all_chunks: list[CodeChunk] = []
        files_parsed = 0

        for file_path, language in _iter_source_files(clone_path):
            tree = parse_file(file_path, language)

            try:
                with open(file_path, "rb") as f:
                    source_bytes = f.read()
            except OSError as exc:
                logger.warning("could not re-read %s for chunk extraction: %s", file_path, exc)
                continue

            all_chunks.extend(extract_chunks(tree, source_bytes, file_path, language))
            files_parsed += 1

        parse_duration = time.monotonic() - parse_started_at
        logger.info(
            "parsing done: job_id=%s repo_id=%s duration=%.2fs files_parsed=%d chunk_count=%d",
            request.job_id,
            request.repo_id,
            parse_duration,
            files_parsed,
            len(all_chunks),
        )
    finally:
        # Always runs, whether analysis/parsing succeeded, raised, or the
        # loop above skipped every file — a partially-processed repo must
        # never linger on disk.
        cleanup_repo(clone_path)

    return ParseResult(analysis=analysis, chunks=all_chunks, chunk_count=len(all_chunks))


async def run_parse_stage(request: ParseRepoRequest) -> ParseResult:
    """Runs the full clone -> analyze -> parse -> chunk pipeline for one repo.

    Everything this does (the git subprocess, walking the checkout, tree-
    sitter parsing) is synchronous/blocking. It's offloaded to a worker
    thread via asyncio.to_thread rather than run directly in this coroutine
    — otherwise it would block the whole event loop, and with it every other
    concurrent request to this service (including health checks), for as
    long as the clone+parse takes. That would also make the route's timeout
    guard (asyncio.wait_for) purely cosmetic, since a truly blocking call
    with no internal await points can't be interrupted by it.
    """
    return await asyncio.to_thread(_run_parse_stage_sync, request)
