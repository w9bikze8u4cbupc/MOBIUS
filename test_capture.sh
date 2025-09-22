#!/bin/bash
set -euo pipefail

test_func() {
    echo "message to stderr" >&2
    echo "success"
}

echo "Before calling function"
result=$(test_func)
echo "After calling function, result: $result"
case "$result" in
    "success") echo "It worked!" ;;
    *) echo "Got: $result" ;;
esac
echo "End of script"
