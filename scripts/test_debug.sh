#!/bin/bash
test_func() {
    echo "inside function"
    echo "failed"
}

result=$(test_func)
echo "Got result: '$result'"
