#!/bin/bash
test_func() {
    echo "log message 1" >&2
    echo "log message 2" >&2
    echo '{"result": "test"}' # only this should be captured
    echo "log message 3" >&2
}

result=$(test_func)
echo "Got: $result"
