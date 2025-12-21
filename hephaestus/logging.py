import logging
import os


def get_logger(name: str) -> logging.Logger:
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler()
    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)
    
    # Default to WARNING for library usage, INFO for CLI
    # Can be overridden with HEPHAESTUS_LOG_LEVEL environment variable
    default_level = logging.WARNING
    if name.endswith('.cli'):
        default_level = logging.INFO
    
    level_name = os.getenv('HEPHAESTUS_LOG_LEVEL', logging.getLevelName(default_level))
    try:
        level = getattr(logging, level_name.upper())
    except AttributeError:
        level = default_level
    
    logger.setLevel(level)
    return logger