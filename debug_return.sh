#!/bin/bash
test_func() {
    echo "Log message" >&2
    echo "Another log" >&2
    echo "failed"
}

result=$(test_func)
echo "Captured: '$result'"
case "$result" in
    "failed") echo "Matched failed" ;;
    *) echo "Didn't match, got: '$result'" ;;
esac
