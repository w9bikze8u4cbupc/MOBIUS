#!/bin/bash
declare -A ENDPOINTS
ENDPOINTS["OpenAI API"]="api.openai.com:443:https://api.openai.com/v1/models"
ENDPOINTS["ElevenLabs API"]="api.elevenlabs.io:443:https://api.elevenlabs.io"
ENDPOINTS["BoardGameGeek API"]="boardgamegeek.com:443:https://boardgamegeek.com/xmlapi2"

echo "Number of endpoints: ${#ENDPOINTS[@]}"
for name in "${!ENDPOINTS[@]}"; do
    echo "Processing: $name -> ${ENDPOINTS[$name]}"
done
