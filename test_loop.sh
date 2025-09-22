#!/bin/bash
set -euo pipefail

ENDPOINTS=(
    "Test1|host1|443|url1"
    "Test2|host2|443|url2"
    "Test3|host3|443|url3"
)

echo "Total endpoints: ${#ENDPOINTS[@]}"

for endpoint_def in "${ENDPOINTS[@]}"; do
    IFS='|' read -r name host port url <<< "$endpoint_def"
    echo "Processing: $name -> $host:$port -> $url"
done
