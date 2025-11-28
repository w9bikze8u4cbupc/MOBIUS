export function extractComponentsFromText(text) {
  const components = [];
  
  if (!text || typeof text !== 'string') {
    return components;
  }

  // Common component patterns in board game rulebooks
  const componentPatterns = [
    // Pattern: "X [type]" or "X x [type]" e.g., "50 cards", "4 player boards"
    /(\d+)\s*x?\s*(cards?|tiles?|tokens?|meeples?|dice?|boards?|markers?|cubes?|pieces?|pawns?|coins?|miniatures?|figures?|counters?|chips?|discs?|blocks?)/gi,
    
    // Pattern: "[number] [color/type] [component]"
    /(\d+)\s+(red|blue|green|yellow|white|black|orange|purple|brown|gray|grey|wooden|plastic|metal|cardboard)?\s*(cards?|tiles?|tokens?|meeples?|dice?|boards?|markers?|cubes?|pieces?|pawns?|coins?|miniatures?|figures?|counters?|chips?|discs?|blocks?)/gi,
    
    // Pattern: Bullet point components "- 1 game board"
    /[-•*]\s*(\d+)\s+([\w\s]+?)(?=[\n,;]|$)/gm,
    
    // Pattern: Components list with "includes" or "contains"
    /(?:includes?|contains?|comes?\s+with)\s*:?\s*(.+)/gi,
  ];

  // Track unique components
  const seen = new Set();

  for (const pattern of componentPatterns) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      const quantity = match[1] || 'N/A';
      const name = (match[2] || match[0]).trim().toLowerCase();
      
      // Skip if already seen
      const key = `${quantity}-${name}`;
      if (seen.has(key)) continue;
      seen.add(key);

      // Filter out common non-component words
      const skipWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
      if (skipWords.includes(name)) continue;

      components.push({
        name: name.charAt(0).toUpperCase() + name.slice(1),
        quantity: quantity,
        description: '',
        visualCharacteristics: ''
      });
    }
  }

  // If no components found with patterns, try to extract from "Components" section
  if (components.length === 0) {
    const componentSection = text.match(/(?:components?|contents?|what'?s?\s+in\s+(?:the\s+)?box)[\s:]+([^]*?)(?:\n\n|\n(?=[A-Z])|$)/i);
    if (componentSection) {
      const lines = componentSection[1].split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.length > 2 && trimmed.length < 100) {
          const quantityMatch = trimmed.match(/^(\d+)\s+(.+)/);
          if (quantityMatch) {
            components.push({
              name: quantityMatch[2].trim(),
              quantity: quantityMatch[1],
              description: '',
              visualCharacteristics: ''
            });
          } else if (trimmed.match(/^[-•*]/)) {
            components.push({
              name: trimmed.replace(/^[-•*]\s*/, ''),
              quantity: 'N/A',
              description: '',
              visualCharacteristics: ''
            });
          }
        }
      }
    }
  }

  return components;
}
