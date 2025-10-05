export function normaliseMetadata(metadata) {
  return Object.entries(metadata ?? {}).reduce((acc, [key, value]) => {
    if (value != null && value !== '') acc[key] = value;
    return acc;
  }, {});
}

export function mapStatusToSteps(status) {
  return [
    { 
      key: 'ingestion', 
      label: 'Rulebook Ingestion', 
      completed: status?.ingested,
      description: 'Parsing and analyzing the game rulebook'
    },
    { 
      key: 'script', 
      label: 'Script Draft', 
      completed: status?.scriptReady,
      description: 'Generating tutorial script from rulebook'
    },
    { 
      key: 'audio', 
      label: 'Audio Generation', 
      completed: status?.audioReady,
      description: 'Creating voice narration for the tutorial'
    },
  ];
}