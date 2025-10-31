"""Lightweight local stub of the FastAPI interface used for testing."""

from __future__ import annotations

from .applications import FastAPI
from .exceptions import HTTPException
from .requests import Request
from . import status

__all__ = ["FastAPI", "HTTPException", "Request", "status"]
