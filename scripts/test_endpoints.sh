#!/bin/bash

# Test script for Mobius Tutorial Generator endpoints
echo -e "\033[0;32mTesting Mobius Tutorial Generator endpoints...\033[0m"

# Test health endpoint
echo -e "\033[1;33mTesting health endpoint...\033[0m"
if response=$(curl -s -w "%{http_code}" -o /tmp/health_response.json http://localhost:5001/health); then
    http_code="${response: -3}"
    if [ "$http_code" -eq 200 ]; then
        status=$(jq -r '.status' /tmp/health_response.json)
        echo -e "\033[0;32mHealth endpoint response: $status\033[0m"
    else
        echo -e "\033[0;31mHealth endpoint test failed with HTTP code: $http_code\033[0m"
    fi
else
    echo -e "\033[0;31mHealth endpoint test failed: curl command failed\033[0m"
fi

# Test summarize endpoint
echo -e "\033[1;33mTesting summarize endpoint...\033[0m"
cat > /tmp/summarize_request.json <<EOF
{
    "rulebookText": "This is a test rulebook text for validation purposes.",
    "language": "english",
    "gameName": "Test Game",
    "metadata": {
        "theme": "Adventure"
    },
    "detailPercentage": 25
}
EOF

if response=$(curl -s -w "%{http_code}" -o /tmp/summarize_response.json -X POST -H "Content-Type: application/json" -d @/tmp/summarize_request.json http://localhost:5001/summarize); then
    http_code="${response: -3}"
    if [ "$http_code" -eq 200 ]; then
        echo -e "\033[0;32mSummarize endpoint test: Success\033[0m"
        summary_length=$(jq -r '.summary | length' /tmp/summarize_response.json)
        echo -e "\033[0;36mSummary length: $summary_length\033[0m"
    else
        echo -e "\033[0;31mSummarize endpoint test failed with HTTP code: $http_code\033[0m"
        echo "Response: $(cat /tmp/summarize_response.json)"
    fi
else
    echo -e "\033[0;31mSummarize endpoint test failed: curl command failed\033[0m"
fi

# Test TTS endpoint
echo -e "\033[1;33mTesting TTS endpoint...\033[0m"
cat > /tmp/tts_request.json <<EOF
{
    "text": "This is a test of the text to speech functionality.",
    "voice": "dllHSct4GokGc1AH9JwT",
    "language": "english",
    "gameName": "Test Game"
}
EOF

if response=$(curl -s -w "%{http_code}" -o /tmp/tts_response.mp3 -X POST -H "Content-Type: application/json" -d @/tmp/tts_request.json http://localhost:5001/tts); then
    http_code="${response: -3}"
    if [ "$http_code" -eq 200 ]; then
        echo -e "\033[0;32mTTS endpoint test: Success\033[0m"
        audio_size=$(wc -c < /tmp/tts_response.mp3)
        echo -e "\033[0;36mAudio response size: $audio_size bytes\033[0m"
    else
        echo -e "\033[0;31mTTS endpoint test failed with HTTP code: $http_code\033[0m"
    fi
else
    echo -e "\033[0;31mTTS endpoint test failed: curl command failed\033[0m"
fi

# Cleanup
rm -f /tmp/health_response.json /tmp/summarize_request.json /tmp/summarize_response.json /tmp/tts_request.json /tmp/tts_response.mp3

echo -e "\033[0;32mEndpoint testing completed.\033[0m"