import React from 'react';

function ImageMatcher() {
  const [images, setImages] = React.useState([]);
  const [placements, setPlacements] = React.useState({});
  const [selectedImage, setSelectedImage] = React.useState(null);
  const [draggedImage, setDraggedImage] = React.useState(null);

  // Load images from the data directory
  React.useEffect(() => {
    // In a real implementation, this would fetch images from the backend
    // For now, we'll use placeholder images
    const placeholderImages = [
      { id: 'img1', name: 'board.png', url: 'https://placehold.co/200x200?text=Board' },
      { id: 'img2', name: 'cards.png', url: 'https://placehold.co/200x200?text=Cards' },
      { id: 'img3', name: 'tokens.png', url: 'https://placehold.co/200x200?text=Tokens' },
      { id: 'img4', name: 'dice.png', url: 'https://placehold.co/200x200?text=Dice' },
    ];
    setImages(placeholderImages);
  }, []);

  const handleDragStart = (e, image) => {
    setDraggedImage(image);
    e.dataTransfer.setData('text/plain', image.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e, stepId) => {
    e.preventDefault();
    if (draggedImage) {
      setPlacements(prev => ({
        ...prev,
        [stepId]: [...(prev[stepId] || []), draggedImage]
      }));
      setDraggedImage(null);
    }
  };

  const removeImageFromStep = (stepId, imageId) => {
    setPlacements(prev => ({
      ...prev,
      [stepId]: (prev[stepId] || []).filter(img => img.id !== imageId)
    }));
  };

  // Mock steps data - in a real implementation, this would come from the script editor
  const mockSteps = [
    { id: 'step1', text: 'Lay out the board and shuffle all decks.' },
    { id: 'step2', text: 'Give each player their starting resources.' },
    { id: 'step3', text: 'On your turn, draw a card and take one action.' },
    { id: 'step4', text: 'Resolve end-of-turn effects.' },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4">
        <h1 className="text-xl font-semibold mb-2">Image Matcher</h1>
        <p className="text-sm text-gray-600">
          Drag and drop images to associate them with specific steps in your tutorial.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 flex-grow">
        {/* Image Library */}
        <div className="col-span-1 bg-white rounded shadow p-3">
          <h2 className="font-semibold mb-2">Image Library</h2>
          <div className="grid grid-cols-2 gap-2">
            {images.map(image => (
              <div 
                key={image.id}
                draggable
                onDragStart={(e) => handleDragStart(e, image)}
                className="border rounded p-2 cursor-move hover:bg-gray-50"
              >
                <img 
                  src={image.url} 
                  alt={image.name} 
                  className="w-full h-24 object-cover rounded"
                />
                <div className="text-xs mt-1 truncate">{image.name}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Step Placements */}
        <div className="col-span-2 bg-white rounded shadow p-3">
          <h2 className="font-semibold mb-2">Step Placements</h2>
          <div className="space-y-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {mockSteps.map(step => (
              <div 
                key={step.id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, step.id)}
                className="border rounded p-3"
              >
                <div className="font-medium mb-2">Step: {step.text}</div>
                <div className="min-h-24 border-2 border-dashed border-gray-300 rounded p-2 bg-gray-50">
                  <div className="text-xs text-gray-500 mb-2">
                    {placements[step.id]?.length ? 'Images for this step:' : 'Drag images here'}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(placements[step.id] || []).map(image => (
                      <div key={image.id} className="relative">
                        <img 
                          src={image.url} 
                          alt={image.name} 
                          className="w-16 h-16 object-cover rounded border"
                        />
                        <button 
                          onClick={() => removeImageFromStep(step.id, image.id)}
                          className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded">
        <h3 className="font-medium mb-1">How to use:</h3>
        <ul className="text-sm text-gray-700 list-disc pl-5 space-y-1">
          <li>Drag images from the library to steps where they should appear</li>
          <li>Click the × button to remove an image from a step</li>
          <li>Images will be included in the final export package</li>
        </ul>
      </div>
    </div>
  );
}

export default ImageMatcher;