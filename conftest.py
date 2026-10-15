"""
conftest.py — root-level pytest config.

Adds the repo root to sys.path so `apps.api.*` imports resolve
without needing to install the package.
"""
import sys
import pathlib

# Ensure the repo root is on sys.path regardless of where pytest is invoked from
sys.path.insert(0, str(pathlib.Path(__file__).parent))
